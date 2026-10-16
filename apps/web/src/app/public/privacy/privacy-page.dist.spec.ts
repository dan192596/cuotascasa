import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Run after `pnpm build` with `pnpm exec ng test --configuration=dist --no-watch` (cwd = repository root). */
const BROWSER = 'dist/apps/web/browser';
const DOC = readFileSync('docs/specs/privacy-requirements.md', 'utf8');
const SECTION = DOC.split('## Encabezados obligatorios')[1]?.split('\n## ')[0] ?? '';
const HEADINGS = [...SECTION.matchAll(/^- `([^`]+)`/gm)].map((match) => match[1] ?? '');
const FILE = join(BROWSER, 'privacidad', 'index.html');

describe('prerendered /privacidad', () => {
  const html = readFileSync(FILE, 'utf8');

  it('contains every required heading as an <h2>', () => {
    expect(HEADINGS.length).toBe(11);
    for (const heading of HEADINGS) expect(html, heading).toContain(`>${heading}</h2>`);
  });

  it('contains no email address and no "@" outside inlined CSS', () => {
    const withoutCss = html.replace(/<style[\s\S]*?<\/style>/gi, '');
    expect(withoutCss).not.toContain('@');
  });

  it('passes the local denylist when the developer list exists', (context) => {
    const run = spawnSync('node', ['tools/hygiene/denylist.mjs', '--count-file', FILE], { encoding: 'utf8' });
    const count = run.stdout.trim();
    if (!/^\d+$/.test(count)) return context.skip();
    expect(count).toBe('0');
  });

  it('serves the 404 page as 404.html', () => {
    expect(readFileSync(join(BROWSER, '404.html'), 'utf8')).toContain('data-testid="page-not-found"');
  });
});
