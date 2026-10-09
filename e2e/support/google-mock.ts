import type { BrowserContext, Page, Route } from '@playwright/test';
import {
  createDriveFake,
  createGisFake,
  type DriveFake,
  type GisFake,
  type GisFakeOptions,
} from '@cuotascasa/sync/testing';

export interface GoogleMock {
  /** Inspectable GIS fake: requests, issued and revoked tokens, queueUserActions(). */
  readonly gis: GisFake;
  /** Inspectable Drive v3 appDataFolder fake: files(), seed(), failNext(), requests. */
  readonly drive: DriveFake;
  reset(): void;
}

type BridgeCall =
  | { readonly op: 'request'; readonly config: Record<string, unknown>; readonly overrides?: Record<string, unknown> }
  | { readonly op: 'revoke'; readonly token: string };

type BridgeResult =
  | { readonly kind: 'callback'; readonly response: unknown }
  | { readonly kind: 'error'; readonly error: unknown }
  | { readonly kind: 'done' };

const BRIDGE = '__ccGisBridge';

/** What accounts.google.com/gsi/client would define, delegating every call to the Node-side GIS fake. */
const GIS_SHIM = `(() => {
  const bridge = window.${BRIDGE};
  window.google = { accounts: { oauth2: {
    initTokenClient(config) {
      const { callback, error_callback, ...plain } = config;
      return { requestAccessToken(overrides) {
        bridge({ op: 'request', config: plain, overrides }).then((result) => {
          if (result.kind === 'error') error_callback && error_callback(result.error);
          else callback(result.response);
        });
      } };
    },
    revoke(token, done) { bridge({ op: 'revoke', token }).then(() => { if (done) done(); }); },
  } } };
})();
`;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS',
  'access-control-expose-headers': '*',
};

/**
 * Routes accounts.google.com/gsi/client and the Drive v3 endpoints of the context to the frozen fakes. Nothing
 * reaches Google. The CSP still applies to the page: `context.route` only replaces the network answer.
 */
export async function installGoogleMock(
  context: BrowserContext,
  options: { readonly gis?: GisFakeOptions } = {},
): Promise<GoogleMock> {
  const gis = createGisFake(options.gis);
  const drive = createDriveFake({ isTokenValid: (token) => gis.isTokenValid(token) });

  await context.exposeFunction(BRIDGE, (call: BridgeCall): Promise<BridgeResult> => {
    if (call.op === 'revoke') {
      return new Promise((done) => gis.oauth2.revoke(call.token, () => done({ kind: 'done' })));
    }
    return new Promise((resolve) => {
      const config = {
        ...call.config,
        callback: (response: unknown) => resolve({ kind: 'callback', response }),
        error_callback: (error: unknown) => resolve({ kind: 'error', error }),
      } as unknown as Parameters<GisFake['oauth2']['initTokenClient']>[0];
      gis.oauth2.initTokenClient(config).requestAccessToken(call.overrides);
    });
  });

  await context.route('https://accounts.google.com/gsi/client**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: GIS_SHIM }),
  );

  const driveRoute = async (route: Route): Promise<void> => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    const body = request.postDataBuffer();
    let response: Response;
    try {
      response = await drive.handle(
        new Request(request.url(), {
          method: request.method(),
          headers: request.headers(),
          ...(body === null ? {} : { body: new Uint8Array(body) }),
        }),
      );
    } catch {
      // failNext({ kind: 'network' }): the fetch() in the page rejects like a dropped connection.
      await route.abort('failed');
      return;
    }
    await route.fulfill({
      status: response.status,
      headers: { ...Object.fromEntries(response.headers), ...CORS },
      body: Buffer.from(await response.arrayBuffer()),
    });
  };
  await context.route('https://www.googleapis.com/drive/v3/**', driveRoute);
  await context.route('https://www.googleapis.com/upload/drive/v3/**', driveRoute);

  return {
    gis,
    drive,
    reset() {
      gis.reset();
      drive.reset();
    },
  };
}

/**
 * Loads accounts.google.com/gsi/client into the page the way the production loader does (ADR-0021 decision 3): a
 * script element whose `src` comes from the Trusted Types policy `cc-gis-loader`, accepting only the GIS URL. It
 * therefore also works on real pages with Trusted Types enforced. Resolves when the script ran. Unlike
 * page.addScriptTag it is not rejected by CSP notices. Needs installGoogleMock on the context.
 */
export async function loadGisScript(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const url = 'https://accounts.google.com/gsi/client';
        type Factory = { createPolicy(name: string, rules: { createScriptURL(input: string): string }): unknown };
        const factory = (window as unknown as { trustedTypes?: Factory }).trustedTypes;
        const script = document.createElement('script');
        script.async = true;
        if (factory === undefined) {
          script.src = url;
        } else {
          const policy = factory.createPolicy('cc-gis-loader', {
            createScriptURL: (input) => {
              if (input !== url) throw new TypeError('cc-gis-loader only allows the GIS URL');
              return input;
            },
          }) as { createScriptURL(input: string): string };
          (script as unknown as { src: unknown }).src = policy.createScriptURL(url);
        }
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('gsi/client did not load'));
        document.head.append(script);
      }),
  );
}
