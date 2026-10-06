import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Frozen design contract (W0-05, ADR-0012 decision 5). W3-05 changes values in tokens.css, never names. cwd = repo root. */
interface TokenNames {
  readonly themed: readonly string[];
  readonly shared: readonly string[];
}

const NAMES = JSON.parse(readFileSync('apps/web/src/design-contract/token-names.json', 'utf8')) as TokenNames;
const CSS = readFileSync('apps/web/src/styles/tokens.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const DECLARATION = /(--cc-[a-z0-9-]+)\s*:\s*([^;]+);/g;
const LIGHT_DARK = /^light-dark\(\s*[^,()]+(\([^()]*\))?\s*,\s*[^,()]+(\([^()]*\))?\s*\)$/;

const declarations = [...CSS.matchAll(DECLARATION)].map(([, name = '', value = '']) => ({ name, value: value.trim() }));

describe('design tokens contract', () => {
  it('token-names.json lists unique --cc-* names', () => {
    const all = [...NAMES.themed, ...NAMES.shared];
    expect(new Set(all).size).toBe(all.length);
    expect(all.every((name) => /^--cc-[a-z0-9-]+$/.test(name))).toBe(true);
  });

  it('tokens.css declares exactly the frozen names, each once', () => {
    const declared = declarations.map((declaration) => declaration.name);
    expect(new Set(declared).size).toBe(declared.length);
    expect([...declared].sort()).toEqual([...NAMES.themed, ...NAMES.shared].sort());
  });

  it('every themed token has a light and a dark value', () => {
    for (const name of NAMES.themed) {
      const value = declarations.find((declaration) => declaration.name === name)?.value ?? '';
      expect(value, name).toMatch(LIGHT_DARK);
    }
  });

  it('shared tokens do not depend on the theme', () => {
    for (const name of NAMES.shared) {
      const value = declarations.find((declaration) => declaration.name === name)?.value ?? '';
      expect(value, name).not.toMatch(/light-dark\(/);
    }
  });

  it('follows the system by default and lets ThemeService force light or dark', () => {
    expect(CSS).toMatch(/:root\s*\{[^}]*color-scheme:\s*light dark;/);
    expect(CSS).toMatch(/:root\[data-theme='light'\]\s*\{\s*color-scheme:\s*light;\s*\}/);
    expect(CSS).toMatch(/:root\[data-theme='dark'\]\s*\{\s*color-scheme:\s*dark;\s*\}/);
  });
});
