import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  magnetOffset,
  motionEnv,
  odometerFrame,
  scrambleFrame,
  stackShrink,
  startLandingMotion,
} from './landing-motion.ts';

/** A window whose media queries answer from `matches`; everything else comes from the real (test) window. */
function fakeWindow(matches: (query: string) => boolean): Window {
  return new Proxy(window, {
    get(target, key) {
      if (key === 'matchMedia') return (query: string) => ({ matches: matches(query) });
      const value: unknown = Reflect.get(target, key);
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  });
}

const desktop = (query: string): boolean => query.includes('pointer: fine');
const reduced = (query: string): boolean => desktop(query) || query.includes('reduce');
const touch = (query: string): boolean => query.includes('coarse');

function host(): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = '<h2 data-scramble>240 cuotas. Muévelas.</h2><b data-odometer>Q 102,207</b><a data-magnet>Ir</a>';
  document.body.append(el);
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

/** An IntersectionObserver that reports every observed element as visible at once. */
class VisibleObserver {
  private readonly callback: (entries: { isIntersecting: boolean; target: Element }[]) => void;
  constructor(callback: (entries: { isIntersecting: boolean; target: Element }[]) => void) {
    this.callback = callback;
  }
  observe(target: Element): void {
    this.callback([{ isIntersecting: true, target }]);
  }
  unobserve(): void {}
  disconnect(): void {}
}

describe('scrambleFrame', () => {
  const zero = (): number => 0;

  it('is the final text at progress 1 and beyond', () => {
    expect(scrambleFrame('Muévelas.', 1, zero)).toBe('Muévelas.');
    expect(scrambleFrame('Muévelas.', 2, zero)).toBe('Muévelas.');
  });

  it('keeps spaces and punctuation, and reveals letters from the left', () => {
    const frame = scrambleFrame('ab, cd', 0.5, zero);
    expect(frame).toHaveLength(6);
    expect(frame.slice(0, 3)).toBe('ab,');
    expect(frame[3]).toBe(' ');
    expect(frame.slice(4)).not.toBe('cd');
  });

  it('keeps the length of the final text at every step', () => {
    for (const p of [0, 0.2, 0.7]) expect(scrambleFrame('240 cuotas.', p, Math.random)).toHaveLength(11);
  });
});

describe('odometerFrame (characters, never quantities)', () => {
  it('rolls every digit up from 0 and leaves every other character in place', () => {
    expect(odometerFrame('Q 102,207', 0)).toBe('Q 000,000');
    expect(odometerFrame('Q 102,207', 1)).toBe('Q 102,207');
  });

  it('never shows a digit above its final digit', () => {
    for (const p of [0.1, 0.3, 0.5, 0.8]) {
      const frame = odometerFrame('Q 50,000', p);
      expect(frame).toHaveLength(8);
      expect(Number(frame[2])).toBeLessThanOrEqual(5);
      expect(frame.slice(3)).toBe('0,000');
    }
  });
});

describe('stackShrink and magnetOffset', () => {
  it('shrinks a card as the next one covers it, at most 6 %', () => {
    expect(stackShrink(800, 800)).toBe(1);
    expect(stackShrink(400, 800)).toBeCloseTo(0.97);
    expect(stackShrink(0, 800)).toBeCloseTo(0.94);
    expect(stackShrink(-100, 800)).toBeCloseTo(0.94);
  });

  it('pulls the button a fraction of the way to the pointer, with a cap', () => {
    const rect = { left: 0, top: 0, width: 100, height: 40 };
    expect(magnetOffset(50, 20, rect)).toEqual({ x: 0, y: 0 });
    expect(magnetOffset(100, 40, rect)).toEqual({ x: 10, y: 4 });
    expect(magnetOffset(900, 20, rect).x).toBe(12);
  });
});

describe('motionEnv', () => {
  it('reads reduced motion and a fine, hovering pointer', () => {
    expect(motionEnv(fakeWindow(desktop))).toEqual({ reduce: false, cursor: true });
    expect(motionEnv(fakeWindow(reduced))).toEqual({ reduce: true, cursor: false });
    expect(motionEnv(fakeWindow(touch))).toEqual({ reduce: false, cursor: false });
  });
});

describe('startLandingMotion', () => {
  it('does nothing under prefers-reduced-motion: no cursor, texts untouched', () => {
    const el = host();
    const stop = startLandingMotion(el, fakeWindow(reduced));
    expect(document.querySelector('.cursor')).toBeNull();
    expect(el.querySelector('h2')?.textContent).toBe('240 cuotas. Muévelas.');
    stop();
  });

  it('adds no custom cursor on a touch screen', () => {
    const stop = startLandingMotion(host(), fakeWindow(touch));
    expect(document.querySelector('.cursor')).toBeNull();
    stop();
  });

  it('adds a decorative cursor with a fine pointer and removes it, and its class, on stop', () => {
    const el = host();
    const stop = startLandingMotion(el, fakeWindow(desktop));
    const cursor = document.querySelector<HTMLElement>('.cursor');
    expect(cursor?.getAttribute('aria-hidden')).toBe('true');
    // The native cursor stays (no class) until the first pointermove shows the dot.
    expect(el.classList.contains('cc-cursor')).toBe(false);
    expect(cursor?.style.opacity).toBe('0');
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 10, clientY: 20 }));
    expect(el.classList.contains('cc-cursor')).toBe(true);
    expect(cursor?.style.opacity).toBe('1');
    stop();
    expect(document.querySelector('.cursor')).toBeNull();
    expect(el.classList.contains('cc-cursor')).toBe(false);
  });

  it('leaves every text final after stop', () => {
    const el = host();
    startLandingMotion(el, fakeWindow(desktop))();
    expect(el.querySelector('h2')?.textContent).toBe('240 cuotas. Muévelas.');
    expect(el.querySelector('b')?.textContent).toBe('Q 102,207');
  });

  it('keeps the accessible text final while a title or counter moves, and cleans up on stop', () => {
    vi.stubGlobal('IntersectionObserver', VisibleObserver);
    const el = host();
    const stop = startLandingMotion(el, fakeWindow(desktop));
    const h2 = el.querySelector('h2');
    const counter = el.querySelector('b');
    expect(h2?.getAttribute('aria-label')).toBe('240 cuotas. Muévelas.');
    expect(h2?.hasAttribute('role')).toBe(false);
    expect(counter?.getAttribute('aria-label')).toBe('Q 102,207');
    expect(counter?.getAttribute('role')).toBe('img');
    stop();
    expect(h2?.hasAttribute('aria-label')).toBe(false);
    expect(counter?.hasAttribute('aria-label')).toBe(false);
    expect(counter?.hasAttribute('role')).toBe(false);
    expect(h2?.textContent).toBe('240 cuotas. Muévelas.');
  });

  it('holds the box of a moving title, so random glyphs never reflow the page under the pointer', () => {
    vi.stubGlobal('IntersectionObserver', VisibleObserver);
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => frames.push(fn));
    const el = host();
    const h2 = el.querySelector('h2') as HTMLElement;
    h2.style.color = 'red';
    vi.spyOn(h2, 'getBoundingClientRect').mockReturnValue({ width: 412.5, height: 74 } as DOMRect);
    const stop = startLandingMotion(el, fakeWindow(desktop));
    // One frame for each moving text (the title, then the counter), a tenth of a second in.
    frames.splice(0).forEach((frame) => frame(performance.now() + 100));
    expect(h2.textContent).not.toBe('240 cuotas. Muévelas.');
    expect(h2.style.width).toBe('412.5px');
    expect(h2.style.height).toBe('74px');
    expect(h2.style.boxSizing).toBe('border-box');
    expect(h2.style.overflow).toBe('hidden');
    while (frames.length > 0) frames.shift()?.(performance.now() + 5000);
    expect(h2.textContent).toBe('240 cuotas. Muévelas.');
    expect(h2.getAttribute('style')).toBe('color: red;');
    stop();
    expect(h2.getAttribute('style')).toBe('color: red;');
  });
});
