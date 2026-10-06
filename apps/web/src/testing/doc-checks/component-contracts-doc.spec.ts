import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** docs/specs/component-contracts.md stays in step with the code it freezes (cwd = repository root). */
const DOC = readFileSync('docs/specs/component-contracts.md', 'utf8');
const CONTRACT_SPECS = readdirSync('apps/web/src/app', { recursive: true, encoding: 'utf8' })
  .filter((file) => file.endsWith('.contract.spec.ts'))
  .map((file) => `apps/web/src/app/${file}`);
const PAGE_TEST_IDS = [
  'page-landing',
  'page-privacy',
  'page-app',
  'page-dashboard',
  'page-loan-new',
  'page-loan-detail',
  'page-schedule',
  'page-real-data',
  'page-scenarios',
  'page-settings',
  'page-not-found',
];

describe('docs/specs/component-contracts.md', () => {
  it('names only files that exist', () => {
    const paths = [...DOC.matchAll(/`(apps\/web\/src\/[^`\s]+\.(?:ts|css|json))`/g)].map((match) => match[1] ?? '');
    expect(paths.length).toBeGreaterThan(30);
    expect(paths.filter((path) => !existsSync(path))).toEqual([]);
  });

  it('documents every component that has a frozen contract spec, and nothing else', () => {
    const fromSpecs = CONTRACT_SPECS.map(
      (path) => /describe\('(cc-[a-z-]+) contract'/.exec(readFileSync(path, 'utf8'))?.[1],
    );
    const fromDoc = [...DOC.matchAll(/^\| `(cc-[a-z-]+)` \|/gm)].map((match) => match[1]);
    expect(fromSpecs.length).toBe(11);
    expect([...fromDoc].sort()).toEqual([...fromSpecs].sort());
  });

  it('documents every page test id', () => {
    for (const testId of PAGE_TEST_IDS) {
      expect(DOC, testId).toContain(`\`${testId}\``);
    }
  });
});
