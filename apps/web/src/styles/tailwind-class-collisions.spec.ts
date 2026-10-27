import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * tailwind.scss scans apps/web/src and emits every utility whose name appears there, global and `important`. A
 * component class with a utility's name (`.fixed`, `.outline`, `.block`…) silently picks up that rule: the odometer's
 * `.fixed` glyphs became `position: fixed` and piled up in production. Component classes must not use those names.
 * cwd = repo root.
 */
const ROOT = 'apps/web/src/app';
const UTILITIES = new Set(
  [
    // display
    'block inline inline-block inline-flex inline-grid inline-table flex grid table contents hidden flow-root list-item',
    'table-row table-cell table-caption table-column table-header-group table-row-group table-footer-group',
    // position and visibility
    'static fixed absolute relative sticky visible invisible collapse isolate container',
    // typography
    'truncate italic underline overline line-through uppercase lowercase capitalize antialiased',
    // borders, effects, filters, transitions
    'border rounded outline ring shadow blur grayscale invert sepia filter backdrop-blur transform transition',
    // flex (`sr-only` is left out: templates use it on purpose, for the utility itself)
    'grow shrink flex-wrap flex-col flex-row',
  ]
    .join(' ')
    .split(' '),
);
const CLASS_USES = [
  /\bclass="([^"]*)"/g,
  /\[class\.([\w-]+)\]/g,
  /classList\.(?:add|remove|toggle)\('([\w-]+)'/g,
  /'class':\s*'([^']*)'/g,
];

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

describe('component classes vs Tailwind utilities', () => {
  it('uses no class name that Tailwind also emits as a global utility', () => {
    const offenders = files(ROOT)
      .filter((file) => /\.(ts|html)$/.test(file) && !/\.(spec|test-d)\.ts$/.test(file))
      .flatMap((file) => {
        const source = readFileSync(file, 'utf8');
        return CLASS_USES.flatMap((pattern) =>
          Array.from(source.matchAll(pattern), (match) => match[1] ?? '')
            .flatMap((names) => names.split(/\s+/))
            .filter((name) => UTILITIES.has(name))
            .map((name) => `${file}: ${name}`),
        );
      });
    expect(offenders).toEqual([]);
  });
});
