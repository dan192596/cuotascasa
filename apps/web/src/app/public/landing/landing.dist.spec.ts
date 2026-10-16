import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Run after `pnpm build` with `pnpm exec ng test --configuration=dist --no-watch` (cwd = repo root). */
const INDEX = 'dist/apps/web/browser/index.html';

describe('prerendered landing in dist (HU-01, R1)', () => {
  it('has the build output', () => {
    expect(existsSync(INDEX)).toBe(true);
  });

  it('contains the hero heading and the privacy call to action', () => {
    const html = readFileSync(INDEX, 'utf8');
    expect(html).toContain('Tu casa se va llenando, cuota a cuota.');
    expect(html).toContain('Tus datos se quedan en tu navegador');
    expect(html).toContain('Empezar en la app');
  });

  it('contains the disclaimer in the landing footer', () => {
    const html = readFileSync(INDEX, 'utf8');
    const footer = /<footer[\s\S]*<\/footer>/.exec(html)?.[0] ?? '';
    expect(footer).toContain('Cifras estimadas; el banco tiene la última palabra. No es asesoría financiera.');
  });

  it('links to /app and /privacidad from the prerendered markup', () => {
    const html = readFileSync(INDEX, 'utf8');
    expect(html).toMatch(/href="\/app"/);
    expect(html).toMatch(/href="\/privacidad"/);
  });
});
