import { describe, expect, it } from 'vitest';
import { isCompletePalette, samePalette } from './chart-palette.ts';

const palette = { ink: 'rgb(1, 2, 3)', 'ink-muted': 'rgb(4, 5, 6)', accent: 'rgb(7, 8, 9)', rule: 'rgb(0, 0, 0)' };

describe('chart palette', () => {
  it('is never accepted with an empty colour', () => {
    expect(isCompletePalette(palette)).toBe(true);
    expect(isCompletePalette({ ...palette, accent: '' })).toBe(false);
    expect(isCompletePalette({ ...palette, rule: '  ' })).toBe(false);
  });

  it('detects whether a colour changed', () => {
    expect(samePalette(palette, { ...palette })).toBe(true);
    expect(samePalette(palette, { ...palette, ink: 'rgb(9, 9, 9)' })).toBe(false);
  });
});
