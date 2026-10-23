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
    expect(counters).toEqual(['240', 'Q 50,000.00', '35', 'Q 102,206.82']);
    expect(html).toContain('de intereses y seguros ahorrados');
  });

  it('shows the board at installment 60 with its reading and slider (complete without JS)', () => {
    const html = readFileSync(INDEX, 'utf8');
    const board = /<cc-landing-board[\s\S]*<\/cc-landing-board>/.exec(html)?.[0] ?? '';
    expect(board.match(/<i\b[^>]*class="paid"/g)).toHaveLength(59);
    expect(board.match(/<i\b[^>]*class="now"/g)).toHaveLength(1);
    expect(board.match(/<i\b/g)).toHaveLength(240);
    expect(board).toContain('Cuota 60 de 240');
    expect(board).toContain('Q 439,205.48');
    expect(board).toContain('12.2 %');
    expect(board).toContain('15/12/2030');
    expect(board).toMatch(/role="slider"[^>]*aria-valuenow="60"|aria-valuenow="60"[^>]*role="slider"/);
    expect(board).toContain('aria-valuetext="Cuota 60, saldo Q 439,205.48"');
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
