import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** docs/specs/design-palette.md: owner approval recorded, one row per themed token, WCAG 2.2 AA (ADR-0012 §1, §12). */
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

const TEXT = [
  '--cc-color-ink',
  '--cc-color-ink-muted',
  '--cc-color-accent',
  '--cc-color-positive',
  '--cc-color-warning',
  '--cc-color-danger',
];
const TEXT_BACKGROUNDS = ['--cc-color-paper', '--cc-color-surface', '--cc-color-band', '--cc-color-current-month'];
const GRAPHICS = ['--cc-color-control-border', '--cc-color-positive-fill'];
const GRAPHIC_BACKGROUNDS = ['--cc-color-paper', '--cc-color-surface', '--cc-color-band', '--cc-color-current-month'];

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
    for (const foreground of TEXT) {
      for (const background of TEXT_BACKGROUNDS) {
        const ratio = contrast(color(foreground, theme), color(background, theme));
        expect(ratio, `${foreground} on ${background}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    for (const foreground of GRAPHICS) {
      for (const background of GRAPHIC_BACKGROUNDS) {
        const ratio = contrast(color(foreground, theme), color(background, theme));
        expect(ratio, `${foreground} on ${background}`).toBeGreaterThanOrEqual(3);
      }
    }
    // Text on the accent fill (primary button, selection) is paper, never ink.
    const onAccent = contrast(color('--cc-color-paper', theme), color('--cc-color-accent', theme));
    expect(onAccent, '--cc-color-paper on --cc-color-accent').toBeGreaterThanOrEqual(4.5);
  });
});
