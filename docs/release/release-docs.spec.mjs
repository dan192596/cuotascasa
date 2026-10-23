// Tests of the release documents (W7-01): the R1–R28 traceability matrix and the residual risks of the v1 checklist.
// Run: pnpm exec vitest run --config docs/release/vitest.config.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CLOSED_WITHOUT_CHANGES,
  PENDING_RELEASE_CARDS,
  RELEASE_CARD,
  REQUIREMENT_IDS,
  buildMatrix,
  coverageGaps,
  mergedCardsFromSubjects,
  WAVE_MERGES,
  withWaveMerges,
  parseMatrixMarkdown,
  parseRequirements,
  renderMarkdown,
  testFilesByCard,
  unlistedUnmergedCards,
  staleAllowlistEntries,
} from './traceability.mjs';
import { checklistGaps, unauthorizedGates } from './checklist-rules.mjs';

const ROOT = join(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

/** A tiny synthetic plan: three requirements and four cards. */
function fixture() {
  const requirements = [
    { id: 'R1', description: 'Uno' },
    { id: 'R2', description: 'Dos' },
    { id: 'R3', description: 'Tres' },
  ];
  const cards = new Map([
    ['W1-01', { id: 'W1-01', owns: ['packages/a/'], requirements: ['R1'] }],
    ['W1-02', { id: 'W1-02', owns: ['docs/b.md'], requirements: ['R2'] }],
    ['W2-01', { id: 'W2-01', owns: ['packages/c/'], requirements: ['R2', 'R3'] }],
    ['W9-01', { id: 'W9-01', owns: ['docs/release/'], requirements: ['R3'] }],
  ]);
  const merged = mergedCardsFromSubjects([
    'feat(a): primera (W1-01) (#3)',
    'docs(b): segunda (W1-02)',
    'feat(c): tercera (W2-01) (#7)',
    'wip(W9-01): todavía no es un merge',
  ]);
  const testFiles = testFilesByCard(cards, [
    'packages/a/x.spec.ts',
    'packages/a/x.ts',
    'packages/c/y.spec.mjs',
    'docs/release/z.spec.mjs',
  ]);
  return { requirements, cards, merged, testFiles };
}

const OPTIONS = { releaseCard: 'W9-01', pending: [], closed: {} };

describe('withWaveMerges', () => {
  it('marks every card of a wave PR as merged in that PR, without overriding a per-card subject', () => {
    const merged = withWaveMerges(mergedCardsFromSubjects(['feat(a): primera (W8-01) (#200)']), {
      'W8-01': 108,
      'W8-02': 108,
    });
    expect(merged.get('W8-01')).toEqual({ pr: 200 });
    expect(merged.get('W8-02')).toEqual({ pr: 108 });
  });

  it('lists only W8 cards, all merged in PR #108', () => {
    expect(Object.keys(WAVE_MERGES).every((id) => /^W8-\d{2}$/.test(id))).toBe(true);
    expect(new Set(Object.values(WAVE_MERGES))).toEqual(new Set([108]));
  });
});

describe('mergedCardsFromSubjects', () => {
  it('reads the card id at the end of a squash subject and its PR number', () => {
    const merged = mergedCardsFromSubjects([
      'feat(web): pantalla (W5-02) (#87)',
      'build(workspace): base (W0-01)',
      'wip(W7-01): avance',
      'docs(plan): register W7-02..W7-04 fix cards (#96)',
    ]);
    expect([...merged.keys()].sort()).toEqual(['W0-01', 'W5-02']);
    expect(merged.get('W5-02')).toEqual({ pr: 87 });
    expect(merged.get('W0-01')).toEqual({ pr: null });
  });
});

describe('traceability coverage', () => {
  it('passes when every requirement has a merged card with tests', () => {
    const { requirements, cards, merged, testFiles } = fixture();
    const matrix = buildMatrix({ requirements, cards, merged, testFiles, ...OPTIONS });
    expect(coverageGaps(matrix)).toEqual([]);
  });

  it('fails for a requirement that no card covers (RED fixture: one R missing)', () => {
    const { requirements, cards, merged, testFiles } = fixture();
    const withR4 = [...requirements, { id: 'R4', description: 'Cuatro' }];
    const matrix = buildMatrix({ requirements: withR4, cards, merged, testFiles, ...OPTIONS });
    expect(coverageGaps(matrix)).toEqual(['R4']);
  });

  it('fails for a requirement whose only merged card has no tests', () => {
    const { requirements, cards, merged } = fixture();
    const noTests = new Map(cards);
    noTests.set('W1-01', { id: 'W1-01', owns: ['docs/sin-pruebas.md'], requirements: ['R1'] });
    const files = testFilesByCard(noTests, ['packages/c/y.spec.mjs', 'docs/release/z.spec.mjs']);
    const matrix = buildMatrix({ requirements, cards: noTests, merged, testFiles: files, ...OPTIONS });
    expect(coverageGaps(matrix)).toEqual(['R1']);
  });

  it('does not count a pending card as coverage', () => {
    const { requirements, cards, testFiles } = fixture();
    const merged = mergedCardsFromSubjects(['feat(a): primera (W1-01) (#3)', 'docs(b): segunda (W1-02)']);
    const matrix = buildMatrix({
      requirements,
      cards,
      merged,
      testFiles,
      releaseCard: 'W9-01',
      pending: ['W2-01'],
      closed: {},
    });
    // R3 is still covered by the release card's own tests; R2's merged card W1-02 has no tests.
    expect(coverageGaps(matrix)).toEqual(['R2']);
  });

  it('flags allowlisted cards that already merged and unmerged cards missing from the allowlist', () => {
    const { cards, merged } = fixture();
    expect(staleAllowlistEntries(['W2-01', 'W8-08'], merged)).toEqual(['W2-01']);
    const partial = mergedCardsFromSubjects(['feat(a): primera (W1-01) (#3)']);
    expect(unlistedUnmergedCards(cards, partial, { releaseCard: 'W9-01', pending: ['W1-02'], closed: {} })).toEqual([
      'W2-01',
    ]);
  });

  it('round-trips through the Markdown table that the release test reads', () => {
    const { requirements, cards, merged, testFiles } = fixture();
    const matrix = buildMatrix({ requirements, cards, merged, testFiles, ...OPTIONS });
    const parsed = parseMatrixMarkdown(renderMarkdown(matrix));
    expect(parsed.map((row) => row.id)).toEqual(['R1', 'R2', 'R3']);
    expect(coverageGaps(parsed)).toEqual([]);
    const r2 = parsed.find((row) => row.id === 'R2');
    expect(r2?.cards).toEqual([
      { id: 'W1-02', status: 'merged', pr: null, tests: 0 },
      { id: 'W2-01', status: 'merged', pr: 7, tests: 1 },
    ]);
  });
});

describe('docs/release/traceability.md (the real matrix)', () => {
  const rowsOf = () => parseMatrixMarkdown(read('docs/release/traceability.md'));

  it('lists exactly R1–R28, in order, with the cards of docs/plan/plan.json', () => {
    const plan = JSON.parse(read('docs/plan/plan.json'));
    const requirements = parseRequirements(read('docs/plan/traceability.md'));
    const rows = rowsOf();
    expect(requirements.map((r) => r.id)).toEqual(REQUIREMENT_IDS);
    expect(rows.map((row) => row.id)).toEqual(REQUIREMENT_IDS);
    for (const row of rows) {
      const planned = plan.waves
        .flatMap((wave) => wave.cards)
        .filter((card) => card.requirements.includes(row.id))
        .map((card) => card.id)
        .sort();
      expect(row.cards.map((card) => card.id).sort(), row.id).toEqual(planned);
    }
  });

  it('gives every requirement a merged card with tests', () => {
    expect(coverageGaps(rowsOf())).toEqual([]);
  });

  it('keeps the pending allowlist honest: only unmerged cards, and every unmerged card is listed', () => {
    const rows = rowsOf();
    const pendingInMatrix = rows.flatMap((row) => row.cards.filter((card) => card.status === 'pending'));
    for (const card of pendingInMatrix) expect(PENDING_RELEASE_CARDS).toContain(card.id);
    const mergedInMatrix = rows.flatMap((row) => row.cards.filter((card) => card.status === 'merged'));
    for (const card of mergedInMatrix) expect(PENDING_RELEASE_CARDS).not.toContain(card.id);
    expect(PENDING_RELEASE_CARDS).not.toContain(RELEASE_CARD);
    expect(Object.keys(CLOSED_WITHOUT_CHANGES)).not.toContain(RELEASE_CARD);
  });
});

describe('checklist residual risks', () => {
  const LOG = [
    '# Bitácora',
    '2026-01-02 · W2-01 · oráculo abc1234 · validación privada: no autorizada',
    '2026-01-03 · W3-01 · oráculo abc1234 · validación privada: no autorizada',
    '2026-01-04 · oráculo abc1234 · préstamo a · todas las filas coinciden: sí',
  ].join('\n');

  it('reads every «validación privada: no autorizada» line of the oracle log', () => {
    expect(unauthorizedGates(LOG)).toEqual([
      { date: '2026-01-02', gate: 'W2-01' },
      { date: '2026-01-03', gate: 'W3-01' },
    ]);
  });

  it('fails when a gate of the log has no residual-risk row in the checklist (RED fixture)', () => {
    const checklist = '| W2-01 | 2026-01-02 | validación privada: no autorizada | riesgo |';
    expect(checklistGaps(LOG, checklist)).toEqual(['W3-01']);
  });

  it('passes when each gate has its row', () => {
    const checklist = [
      '| W2-01 | 2026-01-02 | validación privada: no autorizada | riesgo |',
      '| W3-01 | 2026-01-03 | validación privada: no autorizada | riesgo |',
    ].join('\n');
    expect(checklistGaps(LOG, checklist)).toEqual([]);
  });
});

describe('docs/release/v1-checklist.md (the real checklist)', () => {
  const checklistOf = () => read('docs/release/v1-checklist.md');

  it('records the residual risk of every gate logged as «validación privada: no autorizada»', () => {
    const log = read('docs/specs/oracle-validation-log.md');
    expect(unauthorizedGates(log).length).toBeGreaterThan(0);
    expect(checklistGaps(log, checklistOf())).toEqual([]);
  });

  it('records the owner decision of 2026-10-21: no private bank table, never published', () => {
    const checklist = checklistOf();
    expect(checklist).toContain('### Sin tabla privada del banco (decisión del dueño, 2026-10-21)');
    expect(checklist).toMatch(/nunca se publica/);
  });

  it('is signed through the release PR approval and names no person, account or e-mail', () => {
    const checklist = checklistOf();
    expect(checklist).toContain('firmado por el dueño mediante la aprobación del PR de release');
    expect(checklist).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(checklist).not.toMatch(/github\.com\/(?!gitleaks)[\w-]+/i);
    expect(checklist).not.toMatch(/\.(png|jpe?g|gif|webp)\b/i);
  });
});
