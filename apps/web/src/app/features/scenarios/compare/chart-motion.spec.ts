import { describe, expect, it } from 'vitest';
import { chartAnimation } from './chart-motion.ts';

const windowWith = (reduce: boolean | undefined) =>
  reduce === undefined
    ? { matchMedia: undefined }
    : { matchMedia: (query: string) => ({ matches: reduce && query === '(prefers-reduced-motion: reduce)' }) };

describe('chartAnimation', () => {
  it('animates for 600 ms by default', () => {
    expect(chartAnimation(windowWith(false))).toEqual({ duration: 600 });
  });

  it('is off with prefers-reduced-motion: reduce', () => {
    expect(chartAnimation(windowWith(true))).toBe(false);
  });

  it('stays defensive without a window or matchMedia: no animation', () => {
    expect(chartAnimation(null)).toBe(false);
    expect(chartAnimation(windowWith(undefined))).toBe(false);
  });
});
