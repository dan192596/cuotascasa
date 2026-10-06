import { describe, expect, it } from 'vitest';
import {
  OwnsCheckConfigError,
  appendOnlyViolation,
  evaluate,
  parseBranch,
  parseCards,
  parseFrozenFiles,
  pathMatches,
} from './lib.mjs';

const CARDS = JSON.stringify([
  { id: 'W0-06', wave: 'W0', executor: 'opus', branch: 'card/W0-06-ci', owns: ['.github/', 'tools/conformance/src/'] },
  {
    id: 'W1-04',
    wave: 'W1',
    executor: 'sonnet',
    branch: 'card/W1-04-memory',
    owns: ['packages/persistence/src/memory/'],
  },
  { id: 'W2-01', wave: 'W2', executor: 'opus', branch: 'card/W2-01-gate', owns: ['.github/workflows/ci.yml'] },
  {
    id: 'W2-13',
    wave: 'W2',
    executor: 'sonnet',
    branch: 'card/W2-13-core',
    owns: ['packages/domain/src/schedule/', 'tools/conformance/enforced-features.json'],
  },
  { id: 'W3-17', wave: 'W3', executor: 'opus', branch: 'card/W3-17-deploy', owns: ['.github/workflows/deploy.yml'] },
]);

const FROZEN = JSON.stringify([
  { path: '.github/', editableBy: ['W0-06', 'W2-01'] },
  { path: 'packages/persistence/src/memory/contract.ts', editableBy: [] },
]);

const cards = parseCards(CARDS);
const frozen = parseFrozenFiles(FROZEN, new Set(cards.keys()));
const ENFORCED = 'tools/conformance/enforced-features.json';

function run(
  branch: string,
  paths: string[],
  contents: { before?: Record<string, string | null>; after?: Record<string, string | null> } = {},
) {
  return evaluate({
    branch,
    changes: paths.map((path) => ({ status: 'M', path })),
    cards,
    frozen,
    readBefore: (path: string) => contents.before?.[path] ?? null,
    readAfter: (path: string) => contents.after?.[path] ?? null,
  });
}

describe('parseBranch', () => {
  it('reads the card id from card/<id>-<slug>', () => {
    expect(parseBranch('card/W1-04-in-memory-datastore-adapter')).toEqual({ kind: 'card', cardId: 'W1-04' });
  });

  it('recognises the exempt prefixes', () => {
    expect(parseBranch('renovate/vitest-5.x')).toEqual({ kind: 'exempt', prefix: 'renovate/' });
    expect(parseBranch('opus/register-W2-14')).toEqual({ kind: 'exempt', prefix: 'opus/' });
  });

  it('rejects any other branch name', () => {
    for (const name of ['main', 'card/W1-04', 'card/w1-04-x', 'feature/W1-04-x', 'card/W1-04-Bad_Slug']) {
      expect(parseBranch(name)).toEqual({ kind: 'invalid' });
    }
  });
});

describe('pathMatches', () => {
  it('matches a directory pattern by prefix and a file pattern exactly', () => {
    expect(pathMatches('.github/', '.github/workflows/ci.yml')).toBe(true);
    expect(pathMatches('.github/', '.githubx/a')).toBe(false);
    expect(pathMatches('package.json', 'package.json')).toBe(true);
    expect(pathMatches('package.json', 'apps/web/package.json')).toBe(false);
  });
});

describe('evaluate', () => {
  it('passes an in-owns diff', () => {
    expect(run('card/W1-04-memory', ['packages/persistence/src/memory/index.ts'])).toEqual({
      outcome: 'pass',
      cardId: 'W1-04',
      violations: [],
    });
  });

  it('fails a path outside owns and lists it', () => {
    const result = run('card/W1-04-memory', [
      'packages/persistence/src/memory/index.ts',
      'packages/domain/src/index.ts',
    ]);
    expect(result).toEqual({
      outcome: 'fail',
      cardId: 'W1-04',
      violations: ['outside owns: packages/domain/src/index.ts'],
    });
  });

  it('fails a frozen file inside an owned dir', () => {
    expect(run('card/W1-04-memory', ['packages/persistence/src/memory/contract.ts']).violations).toEqual([
      'frozen: packages/persistence/src/memory/contract.ts (frozen by packages/persistence/src/memory/contract.ts; editableBy: none)',
    ]);
  });

  it('passes a frozen file edited by a card listed in its editableBy', () => {
    expect(run('card/W2-01-gate', ['.github/workflows/ci.yml']).outcome).toBe('pass');
  });

  it('fails the same frozen edit by an owner that is not in editableBy', () => {
    expect(run('card/W3-17-deploy', ['.github/workflows/deploy.yml']).violations).toEqual([
      'frozen: .github/workflows/deploy.yml (frozen by .github/; editableBy: W0-06, W2-01)',
    ]);
  });

  it('passes a tag added at the end of enforced-features.json', () => {
    const result = run('card/W2-13-core', [ENFORCED], {
      before: { [ENFORCED]: '[]\n' },
      after: { [ENFORCED]: '["core"]\n' },
    });
    expect(result.outcome).toBe('pass');
  });

  it('fails when a tag is removed from enforced-features.json', () => {
    const result = run('card/W2-13-core', [ENFORCED], {
      before: { [ENFORCED]: '["core", "anchor"]\n' },
      after: { [ENFORCED]: '["core"]\n' },
    });
    expect(result.violations).toEqual([`append-only: ${ENFORCED} may only gain entries (removes or reorders entries)`]);
  });

  it('fails when enforced-features.json is deleted', () => {
    const result = evaluate({
      branch: 'card/W2-13-core',
      changes: [{ status: 'D', path: ENFORCED }],
      cards,
      frozen,
      readBefore: () => '["core"]\n',
      readAfter: () => null,
    });
    expect(result.violations).toEqual([`append-only: ${ENFORCED} may only gain entries (deleted)`]);
  });

  it('fails an unknown card id', () => {
    expect(run('card/W9-99-ghost', ['README.md'])).toEqual({
      outcome: 'fail',
      cardId: 'W9-99',
      violations: ['unknown card id W9-99: it is not in docs/plan/cards.json'],
    });
  });

  it('exempts renovate/ and opus/ branches', () => {
    expect(run('renovate/vitest-5.x', ['pnpm-lock.yaml', 'package.json'])).toEqual({
      outcome: 'exempt',
      cardId: null,
      violations: [],
    });
    expect(run('opus/register-W2-14', ['docs/plan/plan.json']).outcome).toBe('exempt');
  });

  it('fails a branch that is neither a card branch nor exempt', () => {
    expect(run('feature/x', ['README.md'])).toEqual({
      outcome: 'fail',
      cardId: null,
      violations: ['branch "feature/x" is not card/<id>-<slug>, renovate/… or opus/…'],
    });
  });
});

describe('appendOnlyViolation', () => {
  it('accepts a new file and appended entries, rejects anything else', () => {
    expect(appendOnlyViolation(null, '[]\n')).toBeNull();
    expect(appendOnlyViolation('["core"]', '["core","anchor"]')).toBeNull();
    expect(appendOnlyViolation('["core","anchor"]', '["anchor","core"]')).toBe('removes or reorders entries');
    expect(appendOnlyViolation('["core"]', '{"core":true}')).toBe('not a JSON array of unique strings');
    expect(appendOnlyViolation('["core"]', '["core","core"]')).toBe('not a JSON array of unique strings');
  });
});

describe('configuration validation', () => {
  it('rejects a frozen-files.json entry without editableBy', () => {
    const text = JSON.stringify([{ path: '.github/', editableBy: ['W0-06'] }, { path: 'package.json' }]);
    expect(() => parseFrozenFiles(text, new Set(cards.keys()))).toThrow(OwnsCheckConfigError);
    expect(() => parseFrozenFiles(text, new Set(cards.keys()))).toThrow(
      'docs/plan/frozen-files.json entry 1 (package.json): missing editableBy',
    );
  });

  it('rejects an editableBy that names an unknown card', () => {
    const text = JSON.stringify([{ path: '.github/', editableBy: ['W9-99'] }]);
    expect(() => parseFrozenFiles(text, new Set(cards.keys()))).toThrow(
      'docs/plan/frozen-files.json entry 0 (.github/): editableBy names unknown card W9-99',
    );
  });

  it('rejects a cards.json entry without owns and a duplicated card id', () => {
    expect(() => parseCards(JSON.stringify([{ id: 'W1-04' }]))).toThrow(
      'docs/plan/cards.json entry 0 (W1-04): owns must be a list of paths',
    );
    expect(() =>
      parseCards(
        JSON.stringify([
          { id: 'W1-04', owns: [] },
          { id: 'W1-04', owns: [] },
        ]),
      ),
    ).toThrow('docs/plan/cards.json: duplicated card id W1-04');
  });
});
