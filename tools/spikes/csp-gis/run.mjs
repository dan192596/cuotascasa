// @ts-check
/* global window, document */
// Throwaway spike code (W1-08, retired in W7-01). Runs the CSP + Trusted Types + Google Identity Services evidence
// matrix on Chromium and WebKit and writes `results.json`. Usage: node tools/spikes/csp-gis/run.mjs [--out file]
// The only network use is part (a): https://accounts.google.com/gsi/client, a placeholder OAuth client id, an
// unauthenticated Drive v3 call and a revoke of a placeholder token. No credentials, no sign-in.
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { BUILD_VARIANTS, buildAll } from './builds.mjs';
import {
  ROUTE_CLASSES,
  buildHeaders,
  externalSources,
  extractInline,
  forbiddenScriptSources,
  parseCsp,
  sha256Source,
} from './policies.mjs';
import { PROBE_INLINE_LOADER, PROBE_PATH, startServer } from './server.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');
const RECORDER = readFileSync(join(HERE, 'page/recorder.js'), 'utf8');
const OUT = process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]
  : join(HERE, 'results.json');

const ENGINES = /** @type {const} */ ([
  ['chromium', chromium],
  ['webkit', webkit],
]);
const TT_MODES = /** @type {const} */ (['enforced', 'report-only', 'off']);
const STRATEGY_BUILDS = /** @type {Record<string, string[]>} */ ({
  autocsp: ['autocsp-csr'],
  'header-hashes': ['plain', 'probe'],
  'post-build': ['plain', 'probe'],
});
// Part (a) plan per inline-strategy group. The two hash strategies send the same /app header for the probe page
// (it has no inline script), so they share one group. `strict` keeps style-src to self; the other style modes are
// measured only with the policy loader and the static tag.
const GIS_PLAN = /** @type {Record<string, { loads: string[], styleLoads: string[] }>} */ ({
  autocsp: { loads: ['direct', 'policy', 'default'], styleLoads: ['policy'] },
  hashes: { loads: ['direct', 'policy', 'default', 'static'], styleLoads: ['policy', 'static'] },
});
const STYLE_MODES = /** @type {const} */ (['gis-hash', 'unsafe-inline']);
const PATHS = { root: '/', privacy: '/privacidad', notfound: '/no-existe', app: '/app' };
const GOOGLE = {
  script: ['https://accounts.google.com/gsi/client'],
  connect: ['https://www.googleapis.com', 'https://oauth2.googleapis.com'],
  frame: [],
  style: [],
};
const GIS_POLICIES = readGisPolicies();
const CSP_TEXT = /content[ -]security[ -]policy|trusted ?(types?|html|script|scripturl)|refused to|violates/i;
const REPORT_ONLY_NOTICE = /was delivered in report-only mode/i;
const EXTERNAL_PROBE_URL = 'https://external.invalid/csp-probe';

function readGisPolicies() {
  const index = process.argv.indexOf('--gis-policies');
  return index === -1 ? [] : (process.argv[index + 1] ?? '').split(',').filter(Boolean);
}

/**
 * @template T
 * @param {(() => Promise<T>)[]} tasks
 * @param {number} width
 * @returns {Promise<T[]>}
 */
async function pool(tasks, width) {
  /** @type {T[]} */
  const results = new Array(tasks.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: width }, async () => {
      while (next < tasks.length) {
        const index = next++;
        results[index] = await /** @type {() => Promise<T>} */ (tasks[index])();
      }
    }),
  );
  return results;
}

/** @param {string} root @param {'root' | 'privacy' | 'notfound' | 'app'} route */
function htmlFor(root, route) {
  const pick = (/** @type {string[]} */ names) => names.find((name) => existsSync(join(root, name))) ?? 'index.html';
  const file =
    route === 'root'
      ? 'index.html'
      : route === 'privacy'
        ? pick(['privacidad/index.html', 'index.html'])
        : pick(['index.csr.html', 'index.html']);
  return readFileSync(join(root, file), 'utf8');
}

/**
 * Hashes for one build, per strategy. header-hashes pins the union found in the `plain` build; post-build reads the
 * HTML that is actually served; autocsp reads the strict-dynamic hashes from the builder's own meta CSP.
 * @param {Record<string, string>} outputs
 */
function hashPlans(outputs) {
  const plainRoot = outputs['plain'];
  const pinned = { scripts: new Set(), styles: new Set() };
  for (const route of ROUTE_CLASSES) {
    const inline = extractInline(htmlFor(/** @type {string} */ (plainRoot), route));
    inline.scripts.forEach((s) => pinned.scripts.add(sha256Source(s)));
    inline.styles.forEach((s) => pinned.styles.add(sha256Source(s)));
  }
  /** @param {string} strategy @param {string} buildId @param {'root' | 'privacy' | 'notfound' | 'app'} route */
  return (strategy, buildId, route) => {
    const root = /** @type {string} */ (outputs[buildId]);
    const html = htmlFor(root, route);
    const inline = extractInline(html);
    const styles = inline.styles.map(sha256Source);
    if (strategy === 'header-hashes') return { scripts: [...pinned.scripts], styles: [...pinned.styles] };
    if (strategy === 'autocsp') {
      const meta = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/i.exec(html)?.[1] ?? '';
      return { scripts: meta.match(/'sha256-[^']+'/g) ?? [], styles };
    }
    return { scripts: inline.scripts.map(sha256Source), styles };
  };
}

/** @param {unknown} value */
const toOrigin = (value) => {
  try {
    return new URL(String(value)).origin;
  } catch {
    return '';
  }
};

/**
 * One page session: collects own-origin violations, console CSP errors and external requests.
 * @param {import('playwright').Browser} browser
 * @param {string} origin
 */
async function openSession(browser, origin) {
  const context = await browser.newContext();
  const page = await context.newPage();
  /** @type {{ own: any[], third: any[], policies: any[], support: any }} */
  const record = { own: [], third: [], policies: [], support: null };
  /** @type {string[]} */
  const consoleCsp = [];
  /** @type {string[]} */
  const pageErrors = [];
  /** WebKit notice: report-only policy without report-uri. Not an error of the page, counted apart. */
  /** @type {string[]} */
  const notices = [];
  /** @type {Set<string>} */
  const externalRequests = new Set();
  await page.exposeBinding('__ccRecord', (source, json) => {
    const item = JSON.parse(json);
    const own = toOrigin(source.frame.url()) === origin;
    if (item.kind === 'violation') (own ? record.own : record.third).push(item);
    else if (item.kind === 'policy') record.policies.push({ ...item, own });
    else if (item.kind === 'support' && own && source.frame === page.mainFrame()) record.support = item;
  });
  await page.addInitScript(RECORDER);
  page.on('console', (message) => {
    const sameOrigin = !message.location().url || toOrigin(message.location().url) === origin;
    if (!sameOrigin || !CSP_TEXT.test(message.text())) return;
    if (REPORT_ONLY_NOTICE.test(message.text())) notices.push(message.text().slice(0, 60));
    else consoleCsp.push(message.text().slice(0, 140));
  });
  page.on('pageerror', (error) => {
    if (CSP_TEXT.test(error.message)) pageErrors.push(error.message.slice(0, 140));
  });
  page.on('request', (request) => {
    const requestOrigin = toOrigin(request.url());
    if (requestOrigin && requestOrigin !== origin && !request.url().startsWith('data:')) {
      externalRequests.add(`${requestOrigin}${new URL(request.url()).pathname}`);
    }
  });
  return { context, page, record, consoleCsp, pageErrors, notices, externalRequests };
}

function summarise(
  /** @type {any[]} */ own,
  /** @type {string[]} */ consoleCsp,
  /** @type {string[]} */ pageErrors,
  /** @type {any[]} */ third,
) {
  const enforce = own.filter((v) => v.disposition === 'enforce').length;
  const report = own.filter((v) => v.disposition !== 'enforce').length;
  /** @type {Record<string, number>} */
  const byDirective = {};
  for (const v of own)
    byDirective[`${v.directive}${v.disposition === 'enforce' ? '' : ' (report)'}`] =
      (byDirective[`${v.directive}${v.disposition === 'enforce' ? '' : ' (report)'}`] ?? 0) + 1;
  const samples = [
    ...new Set(own.map((v) => `${v.directive}: ${v.blocked}${v.sample ? ` [${v.sample.slice(0, 40)}]` : ''}`)),
  ].slice(0, 4);
  return {
    enforced: enforce,
    reportOnly: report,
    byDirective,
    samples,
    consoleCspErrors: consoleCsp.length + pageErrors.length,
    consoleSamples: [...consoleCsp, ...pageErrors]
      .slice(0, 2)
      .map((text) => text.replace(/http:\/\/127\.0\.0\.1:\d+/g, 'http://harness')),
    thirdPartyFrameViolations: third.length,
  };
}

/** Part (b): one route of a build under one candidate. */
async function runPageCell({
  browser,
  engine,
  buildId,
  outputs,
  plans,
  strategy,
  tt,
  route,
  baseUri,
  path,
  styleMode = 'hashes',
}) {
  const root = /** @type {string} */ (outputs[buildId]);
  const hashes = plans(strategy, buildId, route);
  const headers = buildHeaders({
    route,
    strategy,
    tt,
    hashes,
    google: GOOGLE,
    baseUri,
    gisPolicies: GIS_POLICIES,
    unsafeInlineStyle: styleMode === 'unsafe-inline',
  });
  const server = await startServer({
    root,
    resolveHeaders: ({ route: requested }) => (requested === route ? headers : {}),
  });
  const session = await openSession(browser, server.origin);
  try {
    const response = await session.page.goto(`${server.origin}${path ?? PATHS[route]}`, { waitUntil: 'load' });
    const rendered = await session.page
      .waitForFunction(() => (document.querySelector('cc-root')?.children.length ?? 0) > 0, null, { timeout: 10000 })
      .then(() => true)
      .catch(() => false);
    const probe = session.page.locator('button:has-text("probe")');
    if (route === 'root' && (await probe.count()) > 0) await probe.first().click();
    await session.page.waitForTimeout(600);
    const sent = Object.keys(response?.headers() ?? {}).filter((name) => name.startsWith('content-security-policy'));
    return {
      engine,
      build: buildId,
      strategy,
      tt,
      route,
      styleMode,
      status: response?.status() ?? 0,
      rendered,
      headersSent: sent.sort(),
      externalRequests: [...session.externalRequests].sort(),
      reportOnlyNotices: session.notices.length,
      ...summarise(session.record.own, session.consoleCsp, session.pageErrors, session.record.third),
    };
  } finally {
    await session.context.close();
    await server.close();
  }
}

/** Part (a): GIS under the /app candidate with one loading option. */
async function runGisCell({ browser, engine, outputs, group, tt, load, styleMode, gisStyleHashes }) {
  const strategy = group === 'autocsp' ? 'autocsp' : 'post-build';
  const hashes = {
    scripts: group === 'autocsp' ? [sha256Source(PROBE_INLINE_LOADER)] : [],
    styles: styleMode === 'gis-hash' ? gisStyleHashes : [],
  };
  const headers = buildHeaders({
    route: 'app',
    strategy,
    tt,
    hashes,
    google: GOOGLE,
    gisPolicies: GIS_POLICIES,
    unsafeInlineStyle: styleMode === 'unsafe-inline',
  });
  const server = await startServer({
    root: /** @type {string} */ (outputs['plain']),
    resolveHeaders: ({ pathname }) => (pathname === PROBE_PATH ? headers : {}),
  });
  const session = await openSession(browser, server.origin);
  /** @type {Record<string, any>} */
  const cell = { engine, group, tt, load, styleMode, part: 'a' };
  try {
    const loader = group === 'autocsp' ? '&loader=inline' : '';
    await session.page.goto(`${server.origin}${PROBE_PATH}?load=${load}${loader}`, { waitUntil: 'load' });
    await session.page
      .waitForFunction(() => /** @type {any} */ (window).__probe?.ready, null, { timeout: 20000 })
      .catch(() => {});
    const popupPromise = session.page.waitForEvent('popup', { timeout: 8000 }).catch(() => null);
    const clickable = await session.page.evaluate(() => Boolean(/** @type {any} */ (window).__probe?.steps?.init?.ok));
    if (clickable) await session.page.click('#connect');
    const popup = clickable ? await popupPromise : null;
    cell.popup = popup ? 'opened' : 'not opened';
    if (popup) {
      await popup.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});
      const popupUrl = new URL(popup.url());
      cell.popupPage = `${popupUrl.origin}${popupUrl.pathname}`;
      await popup.close().catch(() => {});
    }
    const hasGis = await session.page.evaluate(() => Boolean(/** @type {any} */ (window).google?.accounts?.oauth2));
    if (hasGis) await session.page.evaluate(() => /** @type {any} */ (window).__probeFinish());
    const probe = await session.page.evaluate(() => JSON.stringify(/** @type {any} */ (window).__probe ?? null));
    const result = JSON.parse(probe) ?? { steps: {}, probeScriptDidNotRun: true };
    cell.probeScriptRan = !result.probeScriptDidNotRun;
    cell.steps = Object.fromEntries(
      Object.entries(result.steps ?? {}).map(([name, value]) => [
        name,
        value.ok ? value.detail : `FAILED: ${value.detail}`,
      ]),
    );
    cell.requestAccessToken = result.requestAccessToken ?? null;
    const styleTexts = await session.page.evaluate(() =>
      [...document.querySelectorAll('style')].map((node) => node.textContent ?? ''),
    );
    cell.inlineStyleHashes = styleTexts.map(sha256Source);
    cell.externalRequests = [...session.externalRequests].sort();
    cell.reportOnlyNotices = session.notices.length;
    cell.policiesCreated = session.record.policies.map(
      (p) => `${p.own ? '' : '(third-party frame) '}${p.name}${p.created ? '' : ' REJECTED'}`,
    );
    cell.flowComplete = Boolean(
      result.steps?.load?.ok && result.steps?.init?.ok && popup && result.steps?.drive?.ok && result.steps?.revoke?.ok,
    );
    Object.assign(cell, summarise(session.record.own, session.consoleCsp, session.pageErrors, session.record.third));
    return cell;
  } finally {
    await session.context.close();
    await server.close();
  }
}

/** Negative runtime checks on the '/' candidate (post-build hashes, Trusted Types off and enforced). */
async function runNegativeRuntime({ browser, engine, outputs, plans }) {
  const out = [];
  for (const tt of /** @type {const} */ (['off', 'enforced'])) {
    const hashes = plans('post-build', 'plain', 'root');
    const headers = buildHeaders({ route: 'root', strategy: 'post-build', tt, hashes, google: GOOGLE });
    const server = await startServer({
      root: /** @type {string} */ (outputs['plain']),
      resolveHeaders: ({ route }) => (route === 'root' ? headers : {}),
    });
    const session = await openSession(browser, server.origin);
    try {
      await session.page.goto(`${server.origin}/`, { waitUntil: 'load' });
      await session.page.waitForTimeout(500);
      const fetched = await session.page.evaluate(async (url) => {
        try {
          await fetch(url, { mode: 'no-cors' });
          return 'resolved';
        } catch (error) {
          return `rejected: ${error instanceof Error ? error.name : 'error'}`;
        }
      }, EXTERNAL_PROBE_URL);
      await session.page.waitForTimeout(300);
      const connectViolations = session.record.own.filter((v) => v.directive === 'connect-src').length;
      out.push({
        engine,
        tt,
        check: "'/' blocks fetch to an external origin",
        fetch: fetched,
        connectSrcViolations: connectViolations,
        externalRequestsObserved: [...session.externalRequests].sort(),
        pass: fetched.startsWith('rejected') && connectViolations >= 1 && session.externalRequests.size === 0,
      });
    } finally {
      await session.context.close();
      await server.close();
    }
  }
  return out;
}

function staticNegativeChecks(
  /** @type {Record<string, string>} */ outputs,
  /** @type {ReturnType<typeof hashPlans>} */ plans,
) {
  const checked = [];
  let unsafeScript = [];
  let externalOnPublic = [];
  for (const strategy of Object.keys(STRATEGY_BUILDS))
    for (const tt of TT_MODES)
      for (const route of ROUTE_CLASSES) {
        const buildId = /** @type {string} */ (STRATEGY_BUILDS[strategy]?.[0]);
        const headers = buildHeaders({
          route,
          strategy: /** @type {any} */ (strategy),
          tt,
          hashes: plans(strategy, buildId, route),
          google: GOOGLE,
          gisPolicies: GIS_POLICIES,
        });
        for (const value of Object.values(headers)) {
          checked.push(`${strategy}/${tt}/${route}`);
          const parsed = parseCsp(value);
          unsafeScript.push(...forbiddenScriptSources(parsed));
          if (route !== 'app') externalOnPublic.push(...externalSources(parsed));
        }
      }
  const builderMeta = Object.entries(outputs).flatMap(([id, root]) => {
    const meta = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/i.exec(
      readFileSync(join(root, 'index.html'), 'utf8'),
    )?.[1];
    return meta
      ? [
          {
            build: id,
            forbiddenScriptSources: forbiddenScriptSources(parseCsp(meta)),
            policy: meta.replace(/'sha256-[^']+'/g, "'sha256-…'"),
          },
        ]
      : [];
  });
  return {
    headersChecked: checked.length,
    noUnsafeInlineOrEvalInScriptSrc: { pass: unsafeScript.length === 0, found: unsafeScript },
    publicRoutesHaveNoExternalOrigin: { pass: externalOnPublic.length === 0, found: externalOnPublic },
    angularAutoCspBuilderMeta: builderMeta,
  };
}

const scratch = mkdtempSync(join(tmpdir(), 'csp-gis-out-'));
try {
  const built = buildAll(REPO, scratch);
  const outputs = built.outputs;
  const plans = hashPlans(outputs);
  /** @type {Record<string, any>} */
  const results = {
    generatedBy: 'tools/spikes/csp-gis/run.mjs',
    spike: 'W1-08',
    placeholderClientId: '000000000000-placeholder.apps.googleusercontent.com',
    scope: 'https://www.googleapis.com/auth/drive.appdata',
    builds: { built: Object.keys(outputs), failed: built.failures, variants: BUILD_VARIANTS },
    gisPolicyNamesAllowedUnderApp: GIS_POLICIES,
    engines: {},
    candidateHeaders: {},
    inlineInventory: {},
    pageCells: [],
    gisCells: [],
    gisInlineStyleHashes: {},
    literalBaseUri: [],
    negativeChecks: {},
  };

  for (const [id, root] of Object.entries(outputs)) {
    results.inlineInventory[id] = Object.fromEntries(
      ROUTE_CLASSES.map((route) => {
        const inline = extractInline(htmlFor(root, route));
        return [
          route,
          {
            inlineScripts: inline.scripts.map((s) => sha256Source(s)),
            inlineStyles: inline.styles.map((s) => sha256Source(s)),
          },
        ];
      }),
    );
  }
  for (const strategy of Object.keys(STRATEGY_BUILDS)) {
    results.candidateHeaders[strategy] = Object.fromEntries(
      ROUTE_CLASSES.map((route) => [
        route,
        Object.fromEntries(
          TT_MODES.map((tt) => [
            tt,
            buildHeaders({
              route,
              strategy: /** @type {any} */ (strategy),
              tt,
              hashes: plans(strategy, /** @type {string} */ (STRATEGY_BUILDS[strategy]?.[0]), route),
              google: GOOGLE,
              gisPolicies: GIS_POLICIES,
            }),
          ]),
        ),
      ]),
    );
  }
  results.negativeChecks.static = staticNegativeChecks(outputs, plans);
  results.negativeChecks.runtime = [];

  for (const [engine, type] of ENGINES) {
    const browser = await type.launch({ headless: true });
    results.engines[engine] = { version: browser.version() };
    /** @type {(() => Promise<any>)[]} */
    const pageTasks = [];
    for (const [strategy, buildIds] of Object.entries(STRATEGY_BUILDS))
      for (const buildId of buildIds)
        if (outputs[buildId])
          for (const tt of TT_MODES)
            for (const route of ROUTE_CLASSES)
              pageTasks.push(() =>
                runPageCell({
                  browser,
                  engine,
                  buildId,
                  outputs,
                  plans,
                  strategy,
                  tt,
                  route,
                  baseUri: 'self',
                  path: undefined,
                }),
              );
    for (const [strategy, buildIds] of Object.entries(STRATEGY_BUILDS))
      for (const buildId of buildIds)
        if (outputs[buildId])
          for (const tt of TT_MODES)
            pageTasks.push(() =>
              runPageCell({
                browser,
                engine,
                buildId,
                outputs,
                plans,
                strategy,
                tt,
                route: 'app',
                baseUri: 'self',
                path: undefined,
                styleMode: 'unsafe-inline',
              }),
            );
    const discovery = await runGisCell({
      browser,
      engine,
      outputs,
      group: 'hashes',
      tt: 'off',
      load: 'direct',
      styleMode: 'unsafe-inline',
      gisStyleHashes: [],
    });
    const gisStyleHashes = discovery.inlineStyleHashes ?? [];
    results.gisInlineStyleHashes[engine] = gisStyleHashes;
    const gisTasks = [];
    for (const [group, plan] of Object.entries(GIS_PLAN))
      for (const tt of TT_MODES) {
        for (const load of plan.loads)
          gisTasks.push(() =>
            runGisCell({ browser, engine, outputs, group, tt, load, styleMode: 'strict', gisStyleHashes }),
          );
        for (const load of plan.styleLoads)
          for (const styleMode of STYLE_MODES)
            gisTasks.push(() => runGisCell({ browser, engine, outputs, group, tt, load, styleMode, gisStyleHashes }));
      }
    results.pageCells.push(...(await pool(pageTasks, 4)));
    results.gisCells.push(...(await pool(gisTasks, 2)));
    for (const route of /** @type {const} */ (['root', 'app'])) {
      results.literalBaseUri.push(
        await runPageCell({
          browser,
          engine,
          buildId: 'plain',
          outputs,
          plans,
          strategy: 'post-build',
          tt: 'off',
          route,
          baseUri: 'none',
          path: undefined,
        }),
      );
    }
    results.negativeChecks.runtime.push(...(await runNegativeRuntime({ browser, engine, outputs, plans })));
    await browser.close();
  }

  // Candidate sets: (inline strategy, Trusted Types mode, GIS loading option, /app style mode). A candidate is clean
  // when every route of every build it applies to and its GIS flow have no violations and no console CSP errors on
  // both engines. `gis-hash` adds only a hash to a style-src that is already measured, so its pages are the strict ones.
  const clean = (/** @type {any} */ cell) =>
    cell.enforced === 0 && cell.reportOnly === 0 && cell.consoleCspErrors === 0;
  results.candidates = [];
  for (const strategy of Object.keys(STRATEGY_BUILDS)) {
    const group = strategy === 'autocsp' ? 'autocsp' : 'hashes';
    const plan = /** @type {{ loads: string[], styleLoads: string[] }} */ (GIS_PLAN[group]);
    for (const tt of TT_MODES) {
      for (const styleMode of /** @type {const} */ (['strict', ...STYLE_MODES])) {
        const loads = styleMode === 'strict' ? plan.loads : plan.styleLoads;
        const pages = results.pageCells.filter(
          (/** @type {any} */ c) =>
            c.strategy === strategy &&
            c.tt === tt &&
            (styleMode === 'unsafe-inline'
              ? c.route !== 'app' || c.styleMode === 'unsafe-inline'
              : c.styleMode === 'hashes'),
        );
        const pagesClean = pages.length > 0 && pages.every((c) => clean(c) && c.rendered);
        /** @type {Record<string, boolean>} */
        const pagesCleanByBuild = {};
        for (const buildId of STRATEGY_BUILDS[strategy] ?? [])
          pagesCleanByBuild[buildId] = pages.filter((c) => c.build === buildId).every((c) => clean(c) && c.rendered);
        for (const load of loads) {
          const gis = results.gisCells.filter(
            (/** @type {any} */ c) => c.group === group && c.tt === tt && c.load === load && c.styleMode === styleMode,
          );
          const gisClean = gis.length === ENGINES.length && gis.every((c) => clean(c) && c.flowComplete);
          results.candidates.push({
            strategy,
            tt,
            load,
            styleMode,
            pagesCleanByBuild,
            pagesClean,
            gisClean,
            zeroViolations: pagesClean && gisClean,
          });
        }
      }
    }
  }

  const neg = results.negativeChecks;
  neg.allPass =
    neg.static.noUnsafeInlineOrEvalInScriptSrc.pass &&
    neg.static.publicRoutesHaveNoExternalOrigin.pass &&
    neg.runtime.every((/** @type {any} */ c) => c.pass);
  results.acceptance = {
    negativeChecksPass: neg.allPass,
    atLeastOneZeroViolationCandidate: results.candidates.some((/** @type {any} */ c) => c.zeroViolations),
  };
  writeFileSync(OUT, `${JSON.stringify(results, null, 2)}\n`);
  console.log(`wrote ${OUT === join(HERE, 'results.json') ? 'tools/spikes/csp-gis/results.json' : 'results'}`);
  console.log(JSON.stringify(results.acceptance));
  process.exitCode =
    results.acceptance.negativeChecksPass && results.acceptance.atLeastOneZeroViolationCandidate ? 0 : 1;
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
