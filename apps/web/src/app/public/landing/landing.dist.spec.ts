import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Run after `pnpm build` with `pnpm exec ng test --configuration=dist --no-watch` (cwd = repo root). */
const INDEX = 'dist/apps/web/browser/index.html';

describe('prerendered landing in dist (HU-01, R1)', () => {
  it('has the build output', () => {
    expect(existsSync(INDEX)).toBe(true);
  });

  it('contains the headline, the «Sin cuenta» promise and the calls to action (complete without JS)', () => {
    const html = readFileSync(INDEX, 'utf8');
    const h1 = (/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    expect(h1).toBe('Calcula tus cuotas, mes a mes.');
    expect(html).toContain('Sin cuenta. Tus números se quedan en tu navegador.');
    expect(html).toContain('Calcular mi cuota');
    expect(html).toContain('Abrir la app');
  });

  it('shows the final value of the four counters in the prerendered markup', () => {
    const html = readFileSync(INDEX, 'utf8');
    const counters = [...html.matchAll(/<b[^>]*data-odometer[^>]*>([^<]*)<\/b>/g)].map((m) => m[1]?.trim());
    expect(counters).toEqual(['240', 'Q 50,000', '35', 'Q 102,207']);
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
