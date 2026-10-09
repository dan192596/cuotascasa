import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Contrast over the values actually declared in tokens.css (ADR-0012 §12) and fidelity to design-palette.md. cwd = repo root. */
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
const TEXT = ['ink', 'ink-muted', 'accent', 'positive', 'warning', 'danger'].map((n) => `--cc-color-${n}`);
const GRAPHICS = ['control-border', 'positive-fill'].map((n) => `--cc-color-${n}`);
const SURFACES = ['paper', 'surface', 'band', 'current-month'].map((n) => `--cc-color-${n}`);

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
  it('declares all 13 themed tokens as hex pairs', () => {
    expect(TOKENS.size).toBe(13);
  });

  it('matches the approved palette of design-palette.md', () => {
    const rows = [
      ...PALETTE.matchAll(/\| `(--cc-color-[a-z-]+)` \| [^|]+ \| `(#[0-9A-F]{6})` \| `(#[0-9A-F]{6})` \|/g),
    ];
    expect(rows.length).toBe(13);
    for (const [, name = '', light = '', dark = ''] of rows) {
      expect(TOKENS.get(name), name).toEqual({ light: light.toLowerCase(), dark: dark.toLowerCase() });
    }
  });

  it.each(['light', 'dark'] as const)('meets WCAG 2.2 AA in the %s theme', (theme) => {
    for (const fg of TEXT) {
      for (const bg of SURFACES) {
        expect(contrast(value(fg, theme), value(bg, theme)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    for (const fg of GRAPHICS) {
      for (const bg of SURFACES) {
        expect(contrast(value(fg, theme), value(bg, theme)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(3);
      }
    }
    expect(contrast(value('--cc-color-paper', theme), value('--cc-color-accent', theme))).toBeGreaterThanOrEqual(4.5);
  });
});
