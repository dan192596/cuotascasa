import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Contrast over the values actually declared in tokens.css (ADR-0012 §12, ADR-0026) and fidelity to design-palette.md. cwd = repo root. */
const THEMED = (
  JSON.parse(readFileSync('apps/web/src/design-contract/token-names.json', 'utf8')) as { themed: string[] }
).themed;
const CSS = readFileSync('apps/web/src/styles/tokens.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const PALETTE = readFileSync('docs/specs/design-palette.md', 'utf8');

function tokens(): Map<string, { light: string; dark: string }> {
  const out = new Map<string, { light: string; dark: string }>();
  for (const [, name = '', light = '', dark = ''] of CSS.matchAll(
    /(--cc-color-[a-z-]+)\s*:\s*light-dark\(\s*(#[0-9a-fA-F]{6})\s*,\s*(#[0-9a-fA-F]{6})\s*\)/g,
  )) {
    out.set(name, { light: light.toLowerCase(), dark: dark.toLowerCase() });
  }
  return out;
}

const TOKENS = tokens();

/** WCAG 2.2 AA pairs (ADR-0026): 4.5:1 for text and 3:1 for graphics. Short names stand for --cc-color-<name>. */
interface Rule {
  readonly fg: readonly string[];
  readonly bg: readonly string[];
  readonly min: number;
}
const MATRIX: readonly Rule[] = [
  // Text on the page surfaces (accent included: links and «ya es tuyo» figures).
  {
    fg: ['ink', 'ink-muted', 'accent', 'positive', 'warning', 'danger'],
    bg: ['paper', 'surface', 'band', 'current-month'],
    min: 4.5,
  },
  { fg: ['control-border', 'positive-fill'], bg: ['paper', 'surface', 'band', 'current-month'], min: 3 },
  // Fucsia and turquoise as fills, bars and squares.
  { fg: ['accent', 'saving'], bg: ['paper', 'surface', 'band', 'soft'], min: 3 },
  // Text on colour blocks: paper on fucsia, black on turquoise and yellow, on-block on the black block.
  { fg: ['paper'], bg: ['accent'], min: 4.5 },
  { fg: ['on-color'], bg: ['saving', 'highlight'], min: 4.5 },
  { fg: ['on-block'], bg: ['block'], min: 4.5 },
];

function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((start) => {
    const channel = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [high = 0, low = 0] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

function value(name: string, theme: 'light' | 'dark'): string {
  const entry = TOKENS.get(name);
  if (!entry) {
    throw new Error(`tokens.css has no hex pair for ${name}`);
  }
  return entry[theme];
}

describe('tokens.css values', () => {
  it('declares every themed token of token-names.json as a hex pair', () => {
    expect([...TOKENS.keys()].sort()).toEqual([...THEMED].sort());
  });

  it('matches the approved palette of design-palette.md', () => {
    const rows = [
      ...PALETTE.matchAll(/\| `(--cc-color-[a-z-]+)` \| [^|]+ \| `(#[0-9A-F]{6})` \| `(#[0-9A-F]{6})` \|/g),
    ];
    expect(rows.length).toBe(THEMED.length);
    for (const [, name = '', light = '', dark = ''] of rows) {
      expect(TOKENS.get(name), name).toEqual({ light: light.toLowerCase(), dark: dark.toLowerCase() });
    }
  });

  it.each(['light', 'dark'] as const)('meets WCAG 2.2 AA in the %s theme', (theme) => {
    for (const { fg: foregrounds, bg: backgrounds, min } of MATRIX) {
      for (const fg of foregrounds) {
        for (const bg of backgrounds) {
          const ratio = contrast(value(`--cc-color-${fg}`, theme), value(`--cc-color-${bg}`, theme));
          expect(ratio, `${fg} on ${bg}`).toBeGreaterThanOrEqual(min);
        }
      }
    }
  });
});
