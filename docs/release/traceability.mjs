// @ts-check
// R1–R28 traceability for the v1 release (W7-01): requirement -> cards (docs/plan/plan.json) -> merge (squash subject
// of `git log`, with its PR number) -> test files (tracked files under each card's owns).
//
// Usage, from anywhere inside the repository:
//   node docs/release/traceability.mjs            rewrites docs/release/traceability.md
//   node docs/release/traceability.mjs --check    exit 1 if the file is stale or a requirement lacks a merged card
//                                                 with tests
//   node docs/release/traceability.mjs --check --release
//                                                 also exit 1 while PENDING_RELEASE_CARDS is not empty (run before
//                                                 the v1.0.0 tag)
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REQUIREMENT_IDS = Array.from({ length: 28 }, (_, index) => `R${String(index + 1)}`);

/** The release card itself: its own tests live in docs/release/, and its status never depends on its own merge. */
export const RELEASE_CARD = 'W7-01';

/**
 * Cards of v1 that are not merged yet. MUST BE EMPTY AT TAG TIME (`--check --release`). An entry that merges makes the
 * release test fail until it is removed here, so the list drains itself as W7-02..W7-04 land.
 */
/** @type {string[]} */
export const PENDING_RELEASE_CARDS = [];

/** Cards closed without a merge, with the reason (docs/plan/implementation/w0/README.md, «Hallazgos de W3»). */
export const CLOSED_WITHOUT_CHANGES = {
  'W3-04': 'cerrada sin cambios: el triage de W3-01 no dejó ítems del lado del oráculo',
};

const TEST_FILE = /(\.spec\.(ts|mts|mjs|js)|\.test-d\.ts)$|(^|\/)test_[^/]+\.py$/;
const SQUASH_SUBJECT = /\((W\d-\d{2})\)(?:\s*\(#(\d+)\))?\s*$/;

/**
 * @typedef {{ id: string, owns: string[], requirements: string[] }} Card
 * @typedef {{ pr: number | null }} Merge
 * @typedef {'merged' | 'pending' | 'release' | 'closed' | 'unmerged'} Status
 * @typedef {{ id: string, status: Status, pr: number | null, tests: number }} CardCell
 * @typedef {{ id: string, description: string, cards: CardCell[] }} Row
 * @typedef {{ releaseCard: string, pending: string[], closed: Record<string, string> }} Options
 */

/**
 * Card ids merged into the history, read from squash subjects such as `feat(web): … (W5-02) (#87)`. Only an id in
 * parentheses at the end of the subject counts, so `wip(W7-01): …` or a plan commit that names cards does not.
 * @param {string[]} subjects
 * @returns {Map<string, Merge>}
 */
export function mergedCardsFromSubjects(subjects) {
  /** @type {Map<string, Merge>} */
  const merged = new Map();
  for (const subject of subjects) {
    const match = SQUASH_SUBJECT.exec(subject.trim());
    if (match === null) continue;
    const [, id, pr] = match;
    if (id !== undefined && !merged.has(id)) merged.set(id, { pr: pr === undefined ? null : Number(pr) });
  }
  return merged;
}

/**
 * @param {Card} card
 * @param {string} file
 */
function isOwned(card, file) {
  return card.owns.some((own) => file === own || (own.endsWith('/') && file.startsWith(own)));
}

/**
 * Tracked test files under each card's owns (spec, type tests and Python `test_*.py`).
 * @param {Map<string, Card>} cards
 * @param {string[]} files
 * @returns {Map<string, string[]>}
 */
export function testFilesByCard(cards, files) {
  const tests = files.filter((file) => TEST_FILE.test(file)).sort();
  /** @type {Map<string, string[]>} */
  const out = new Map();
  for (const card of cards.values()) out.set(card.id, tests.filter((file) => isOwned(card, file)));
  return out;
}

/**
 * @param {string} id
 * @param {Map<string, Merge>} merged
 * @param {Options} options
 * @returns {Status}
 */
function statusOf(id, merged, options) {
  if (id === options.releaseCard) return 'release';
  if (merged.has(id)) return 'merged';
  if (options.pending.includes(id)) return 'pending';
  if (Object.hasOwn(options.closed, id)) return 'closed';
  return 'unmerged';
}

/**
 * @param {{ requirements: { id: string, description: string }[], cards: Map<string, Card>,
 *   merged: Map<string, Merge>, testFiles: Map<string, string[]> } & Options} input
 * @returns {Row[]}
 */
export function buildMatrix({ requirements, cards, merged, testFiles, ...options }) {
  return requirements.map(({ id, description }) => ({
    id,
    description,
    cards: [...cards.values()]
      .filter((card) => card.requirements.includes(id))
      .map((card) => card.id)
      .sort()
      .map((cardId) => {
        const status = statusOf(cardId, merged, options);
        return {
          id: cardId,
          status,
          pr: status === 'merged' ? (merged.get(cardId)?.pr ?? null) : null,
          tests: status === 'merged' || status === 'release' ? (testFiles.get(cardId)?.length ?? 0) : 0,
        };
      }),
  }));
}

/**
 * Requirements without at least one merged card (or the release card) that has tests.
 * @param {Row[]} rows
 * @returns {string[]}
 */
export function coverageGaps(rows) {
  return rows
    .filter((row) => !row.cards.some((card) => (card.status === 'merged' || card.status === 'release') && card.tests > 0))
    .map((row) => row.id);
}

/**
 * Allowlisted cards that already merged: they must leave PENDING_RELEASE_CARDS.
 * @param {string[]} pending
 * @param {Map<string, Merge>} merged
 */
export function staleAllowlistEntries(pending, merged) {
  return pending.filter((id) => merged.has(id));
}

/**
 * Cards that are neither merged, the release card, allowlisted as pending, nor closed without changes.
 * @param {Map<string, Card>} cards
 * @param {Map<string, Merge>} merged
 * @param {Options} options
 */
export function unlistedUnmergedCards(cards, merged, options) {
  return [...cards.keys()].filter((id) => statusOf(id, merged, options) === 'unmerged').sort();
}

/**
 * Requirement ids and descriptions from the table of docs/plan/traceability.md.
 * @param {string} markdown
 */
export function parseRequirements(markdown) {
  /** @type {{ id: string, description: string }[]} */
  const out = [];
  for (const line of markdown.split('\n')) {
    const match = /^\| (R\d+) \| (.+?) \| /.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) out.push({ id: match[1], description: match[2] });
  }
  return out;
}

/** @param {number} count */
function testsLabel(count) {
  return `${String(count)} ${count === 1 ? 'prueba' : 'pruebas'}`;
}

/** @param {CardCell} card */
function renderCell(card) {
  const link = `[${card.id}](../plan/cards/${card.id}.md)`;
  switch (card.status) {
    case 'merged':
      return `${link} · ${card.pr === null ? 'sin PR' : `#${String(card.pr)}`} · ${testsLabel(card.tests)}`;
    case 'release':
      return `${link} · PR de release · ${testsLabel(card.tests)}`;
    case 'pending':
      return `${link} · pendiente`;
    case 'closed':
      return `${link} · cerrada sin cambios`;
    default:
      return `${link} · sin fusionar`;
  }
}

/**
 * @param {Row[]} rows
 * @param {Map<string, string[]>} [testFiles] when given, a per-card list of test files follows the table
 */
export function renderMarkdown(rows, testFiles) {
  const lines = [
    '# Trazabilidad de v1: requisitos ↔ tarjetas fusionadas ↔ pruebas',
    '',
    '<!-- Generado por docs/release/traceability.mjs. No editar a mano: node docs/release/traceability.mjs -->',
    '',
    'Fuentes: `docs/plan/plan.json` (tarjetas y requisitos), `docs/plan/traceability.md` (descripciones), los asuntos',
    'de `git log` (merge y número de PR) y `git ls-files` (archivos de prueba bajo los `owns` de cada tarjeta).',
    '',
    'Estados: `#N` es el PR que fusionó la tarjeta (las de W0 se fusionaron en local, «sin PR»); «PR de release» es esta',
    'tarjeta (W7-01); «pendiente» es una tarjeta de v1 aún sin fusionar, que figura en `PENDING_RELEASE_CARDS` y debe',
    'quedar vacía antes del tag; «cerrada sin cambios» es una tarjeta que se cerró sin merge. Cada requisito necesita al',
    'menos una tarjeta fusionada (o la de release) con pruebas; lo comprueba `docs/release/release-docs.spec.mjs`.',
    '',
    '| Requisito | Descripción | Tarjetas |',
    '|---|---|---|',
    ...rows.map((row) => `| ${row.id} | ${row.description} | ${row.cards.map(renderCell).join('<br>')} |`),
    '',
  ];
  if (testFiles !== undefined) {
    lines.push('## Pruebas por tarjeta', '', 'Solo las tarjetas fusionadas y la de release.', '');
    const counted = rows.flatMap((row) => row.cards.filter((card) => card.status === 'merged' || card.status === 'release'));
    const ids = [...new Set(counted.map((card) => card.id))].sort();
    for (const id of ids) {
      const files = testFiles.get(id) ?? [];
      if (files.length === 0) continue;
      lines.push(`### ${id}`, '', ...files.map((file) => `- \`${file}\``), '');
    }
  }
  return lines.join('\n');
}

/**
 * Reads back the table written by renderMarkdown.
 * @param {string} markdown
 * @returns {Row[]}
 */
export function parseMatrixMarkdown(markdown) {
  /** @type {Row[]} */
  const rows = [];
  for (const line of markdown.split('\n')) {
    const match = /^\| (R\d+) \| (.+) \| (.*) \|$/.exec(line);
    if (match?.[1] === undefined || match[2] === undefined || match[3] === undefined) continue;
    const cards = match[3]
      .split('<br>')
      .filter((cell) => cell.trim() !== '')
      .map((cell) => {
        const id = /\[(W\d-\d{2})\]/.exec(cell)?.[1] ?? '?';
        const pr = /· #(\d+) ·/.exec(cell);
        const tests = /· (\d+) pruebas?$/.exec(cell.trim());
        /** @type {Status} */
        let status = 'unmerged';
        if (cell.includes('· PR de release')) status = 'release';
        else if (cell.includes('· pendiente')) status = 'pending';
        else if (cell.includes('· cerrada sin cambios')) status = 'closed';
        else if (pr !== null || cell.includes('· sin PR ·')) status = 'merged';
        return { id, status, pr: pr === null ? null : Number(pr[1]), tests: tests === null ? 0 : Number(tests[1]) };
      });
    rows.push({ id: match[1], description: match[2], cards });
  }
  return rows;
}

/* ---------- CLI ---------- */

/**
 * @param {string} root
 * @param {string[]} args
 */
function git(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed`);
  return result.stdout;
}

/** @param {string} root */
export function computeFromRepository(root) {
  const plan = JSON.parse(readFileSync(join(root, 'docs/plan/plan.json'), 'utf8'));
  /** @type {Map<string, Card>} */
  const cards = new Map();
  for (const wave of plan.waves) {
    for (const card of wave.cards) {
      cards.set(card.id, { id: card.id, owns: card.owns, requirements: card.requirements });
    }
  }
  const requirements = parseRequirements(readFileSync(join(root, 'docs/plan/traceability.md'), 'utf8'));
  const merged = mergedCardsFromSubjects(git(root, ['log', '--format=%s', 'HEAD']).split('\n'));
  const testFiles = testFilesByCard(cards, git(root, ['ls-files']).split('\n').filter(Boolean));
  /** @type {Options} */
  const options = { releaseCard: RELEASE_CARD, pending: PENDING_RELEASE_CARDS, closed: CLOSED_WITHOUT_CHANGES };
  const rows = buildMatrix({ requirements, cards, merged, testFiles, ...options });
  return {
    rows,
    markdown: renderMarkdown(rows, testFiles),
    problems: [
      ...REQUIREMENT_IDS.filter((id) => !requirements.some((r) => r.id === id)).map((id) => `${id}: sin descripción`),
      ...coverageGaps(rows).map((id) => `${id}: sin tarjeta fusionada con pruebas`),
      ...staleAllowlistEntries(PENDING_RELEASE_CARDS, merged).map((id) => `${id}: ya fusionada; quítala de la lista`),
      ...unlistedUnmergedCards(cards, merged, options).map((id) => `${id}: sin fusionar y fuera de la lista`),
    ],
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const root = join(import.meta.dirname, '..', '..');
  const target = join(root, 'docs/release/traceability.md');
  const { markdown, problems } = computeFromRepository(root);
  if (args.includes('--release') && PENDING_RELEASE_CARDS.length > 0) {
    problems.push(`PENDING_RELEASE_CARDS no está vacía: ${PENDING_RELEASE_CARDS.join(', ')}`);
  }
  if (args.includes('--check')) {
    let current = '';
    try {
      current = readFileSync(target, 'utf8');
    } catch {
      problems.push('docs/release/traceability.md no existe');
    }
    if (current !== '' && current !== markdown) problems.push('docs/release/traceability.md está desactualizado');
  } else {
    writeFileSync(target, markdown);
  }
  for (const problem of problems) console.error(problem);
  process.exit(problems.length === 0 ? 0 : 1);
}
