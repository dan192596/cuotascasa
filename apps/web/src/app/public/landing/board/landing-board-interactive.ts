import { LANDING_EXAMPLE_ROWS } from '../example/example-rows.generated.ts';

/**
 * Lazy part of the 240-installment board (W8-07): the generated rows of both paths and the pure helpers for the
 * keyboard, the pointer and the one-time run of the knob. `cc-landing-board` fetches this chunk with a dynamic
 * `import()` when the board nears the viewport, so neither the rows nor this code are in the landing's initial graph.
 * Installment numbers and pixel positions are plain numbers; money stays in formatted strings.
 */
export const BOARD_ROWS = LANDING_EXAMPLE_ROWS;

const FIRST = 1;
const LAST = 240;
const PAGE = 12;

const clampK = (k: number): number => Math.max(FIRST, Math.min(LAST, Math.round(k)));

/** Installment the slider moves to for a key ([WAI-ARIA slider pattern]), or null when the key is not the slider's. */
export function keyTarget(key: string, shift: boolean, k: number): number | null {
  const step = shift ? PAGE : 1;
  switch (key) {
    case 'ArrowRight':
    case 'ArrowUp':
      return clampK(k + step);
    case 'ArrowLeft':
    case 'ArrowDown':
      return clampK(k - step);
    case 'PageUp':
      return clampK(k + PAGE);
    case 'PageDown':
      return clampK(k - PAGE);
    case 'Home':
      return FIRST;
    case 'End':
      return LAST;
    default:
      return null;
  }
}

/** Installment under a pointer at `clientX` on a track spanning `rect` (1 at the left edge, 240 at the right). */
export function kAt(clientX: number, rect: { readonly left: number; readonly width: number }): number {
  if (rect.width <= 0) return FIRST;
  return clampK(FIRST + ((clientX - rect.left) / rect.width) * (LAST - FIRST));
}

/** Runs the knob from 1 to `to` in `ms` with an ease-out; returns the function that stops it where it is. */
export function autoplay(win: Window, to: number, ms: number, set: (k: number) => void): () => void {
  const start = win.performance.now();
  let frame = 0;
  let stopped = false;
  set(FIRST);
  const step = (now: number): void => {
    if (stopped) return;
    const p = Math.min(1, Math.max(0, (now - start) / ms));
    set(clampK(FIRST + (to - FIRST) * (1 - (1 - p) ** 3)));
    if (p < 1) frame = win.requestAnimationFrame(step);
  };
  frame = win.requestAnimationFrame(step);
  return () => {
    stopped = true;
    win.cancelAnimationFrame(frame);
  };
}
