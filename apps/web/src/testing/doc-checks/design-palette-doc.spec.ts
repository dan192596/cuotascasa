import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** docs/specs/design-palette.md: owner approval recorded, one row per themed token, WCAG 2.2 AA (ADR-0012 §1, §12; ADR-0026). */
const DOC = readFileSync('docs/specs/design-palette.md', 'utf8');
const THEMED = (
  JSON.parse(readFileSync('apps/web/src/design-contract/token-names.json', 'utf8')) as { themed: string[] }
).themed;
const ROW = /^\| ([^|]+?) \| `(--cc-color-[a-z-]+)` \| [^|]+ \| `(#[0-9A-F]{6})` \| `(#[0-9A-F]{6})` \|$/gm;
const ROWS = [...DOC.matchAll(ROW)].map(([, role = '', token = '', light = '', dark = '']) => ({
  role,
  token,
  light,
  dark,
}));

/** WCAG 2.2 AA pairs (ADR-0026): 4.5:1 for text and 3:1 for graphics. Short names stand for --cc-color-<name>. */
interface Rule {
  readonly fg: readonly string[];
  readonly bg: readonly string[];
  readonly min: number;
}
const MATRIX: readonly Rule[] = [
  {
    fg: ['ink', 'ink-muted', 'accent', 'positive', 'warning', 'danger'],
    bg: ['paper', 'surface', 'band', 'current-month'],
    min: 4.5,
  },
  { fg: ['control-border', 'positive-fill'], bg: ['paper', 'surface', 'band', 'current-month'], min: 3 },
  { fg: ['accent', 'saving'], bg: ['paper', 'surface', 'band', 'soft'], min: 3 },
  // Text on the fucsia fill (primary button, selection) is paper; on turquoise and yellow, on-color; on the black block, on-block.
  { fg: ['paper'], bg: ['accent'], min: 4.5 },
  { fg: ['on-color'], bg: ['saving', 'highlight'], min: 4.5 },
  { fg: ['on-block'], bg: ['block'], min: 4.5 },
  // Text on the soft surfaces (board of the landing, picker) and highlight text on the black block (W8 final review).
  { fg: ['accent', 'ink-muted'], bg: ['soft'], min: 4.5 },
  { fg: ['highlight'], bg: ['block'], min: 4.5 },
];

function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((start) => {
    const channel = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string): number {
  const [high, low] = [luminance(foreground), luminance(background)].sort((x, y) => y - x);
  return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
}

function color(token: string, theme: 'light' | 'dark'): string {
  const row = ROWS.find((candidate) => candidate.token === token);
  if (!row) {
    throw new Error(`design-palette.md has no row for ${token}`);
  }
  return row[theme];
}

describe('docs/specs/design-palette.md', () => {
  it("records the owner's approval date", () => {
    const match = /^\*\*Aprobada por el dueño:\*\* (\d{4}-\d{2}-\d{2})$/m.exec(DOC);
    expect(match?.[1]).toMatch(/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
  });

  it('has exactly one row per themed token of token-names.json', () => {
    expect(ROWS.map((row) => row.token).sort()).toEqual([...THEMED].sort());
  });

  it.each(['light', 'dark'] as const)('meets WCAG 2.2 AA in the %s theme', (theme) => {
    for (const { fg: foregrounds, bg: backgrounds, min } of MATRIX) {
      for (const foreground of foregrounds) {
        for (const background of backgrounds) {
          const ratio = contrast(color(`--cc-color-${foreground}`, theme), color(`--cc-color-${background}`, theme));
          expect(ratio, `${foreground} on ${background}`).toBeGreaterThanOrEqual(min);
        }
      }
    }
  });
});
