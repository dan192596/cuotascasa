import { describe, expect, it, vi } from 'vitest';
import { LANDING_EXAMPLE_ROWS } from '../example/example-rows.generated.ts';
import { autoplay, BOARD_ROWS, keyTarget, kAt } from './landing-board-interactive.ts';

describe('landing board behaviour (lazy chunk, W8-07)', () => {
  it('carries the generated rows', () => {
    expect(BOARD_ROWS).toBe(LANDING_EXAMPLE_ROWS);
  });

  it('moves one installment with the arrows, twelve with Shift, and to the ends with Home and End', () => {
    expect(keyTarget('ArrowRight', false, 60)).toBe(61);
    expect(keyTarget('ArrowUp', false, 60)).toBe(61);
    expect(keyTarget('ArrowLeft', false, 60)).toBe(59);
    expect(keyTarget('ArrowDown', false, 60)).toBe(59);
    expect(keyTarget('ArrowRight', true, 60)).toBe(72);
    expect(keyTarget('ArrowLeft', true, 60)).toBe(48);
    expect(keyTarget('PageUp', false, 60)).toBe(72);
    expect(keyTarget('PageDown', false, 60)).toBe(48);
    expect(keyTarget('Home', false, 60)).toBe(1);
    expect(keyTarget('End', false, 60)).toBe(240);
    expect(keyTarget('ArrowRight', true, 235)).toBe(240);
    expect(keyTarget('ArrowLeft', false, 1)).toBe(1);
    expect(keyTarget('a', false, 60)).toBeNull();
    expect(keyTarget('Tab', false, 60)).toBeNull();
  });

  it('maps a pointer x on the track to an installment between 1 and 240', () => {
    const rect = { left: 100, width: 478 };
    expect(kAt(100, rect)).toBe(1);
    expect(kAt(578, rect)).toBe(240);
    expect(kAt(339, rect)).toBe(121);
    expect(kAt(0, rect)).toBe(1);
    expect(kAt(9999, rect)).toBe(240);
    expect(kAt(50, { left: 0, width: 0 })).toBe(1);
  });

  it('runs the knob from 1 up to 60 within a second, eased, and can be cancelled', () => {
    const frames: FrameRequestCallback[] = [];
    let now = 0;
    const win = {
      requestAnimationFrame: (fn: FrameRequestCallback) => frames.push(fn),
      cancelAnimationFrame: vi.fn(),
      performance: { now: () => now },
    } as unknown as Window;
    const seen: number[] = [];
    autoplay(win, 60, 900, (k) => seen.push(k));
    expect(seen).toEqual([1]);
    for (const t of [100, 300, 600, 900]) {
      now = t;
      frames.shift()?.(t);
    }
    expect(seen.at(-1)).toBe(60);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(frames).toHaveLength(0);

    const cancelled: number[] = [];
    now = 0;
    const cancel = autoplay(win, 60, 900, (k) => cancelled.push(k));
    cancel();
    now = 500;
    frames.shift()?.(500);
    expect(cancelled).toEqual([1]);
  });
});
