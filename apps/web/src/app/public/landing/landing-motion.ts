/**
 * Landing-only motion (ADR-0026 §6.1): titles that unscramble, counters that roll character by character, cards that
 * shrink as the next one covers them, a custom cursor and a magnetic button. DOM APIs only, no Angular and no `ui/`,
 * so it stays tiny in the landing's initial graph. Every effect starts from the final, prerendered text and ends on it:
 * nothing waits for this file to be readable. Under `prefers-reduced-motion: reduce` it does nothing at all, and the
 * cursor and the magnet also stay off on touch screens. Money is never parsed: only characters of formatted strings move.
 */

const GLYPHS = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ0123456789Q%';
const WORD_CHAR = /[\p{L}\p{N}]/u;
const DIGIT = /[0-9]/;
const SCRAMBLE_MS = 600;
const ODOMETER_MS = 900;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** One step of the unscramble: letters left of `progress` are final, the rest are random glyphs; the rest stays put. */
export function scrambleFrame(text: string, progress: number, random: () => number): string {
  if (progress >= 1) return text;
  const chars = Array.from(text);
  const revealed = Math.floor(progress * chars.length);
  return chars
    .map((ch, i) => (i < revealed || !WORD_CHAR.test(ch) ? ch : (GLYPHS[Math.floor(random() * GLYPHS.length)] ?? ch)))
    .join('');
}

/** One step of the odometer: each digit glyph rolls from 0 up to its own glyph, left to right; others stay fixed. */
export function odometerFrame(text: string, progress: number): string {
  const chars = Array.from(text);
  const count = chars.filter((ch) => DIGIT.test(ch)).length;
  let j = 0;
  return chars
    .map((ch) => {
      if (!DIGIT.test(ch)) return ch;
      const local = clamp01(progress * 1.6 - (0.6 * j++) / count);
      return String(Math.floor(Number(ch) * local));
    })
    .join('');
}

/** Scale of a stacked card whose next card is `gap` px below it: 1 when a screen away, 0.94 when fully covered. */
export function stackShrink(gap: number, viewport: number): number {
  return 1 - clamp01(1 - gap / viewport) * 0.06;
}

/** Offset of the magnetic button: a fifth of the way to the pointer, at most 12 px per axis. */
export function magnetOffset(
  x: number,
  y: number,
  rect: { readonly left: number; readonly top: number; readonly width: number; readonly height: number },
): { x: number; y: number } {
  const pull = (d: number): number => Math.max(-12, Math.min(12, Math.round(d * 0.2))) || 0;
  return { x: pull(x - rect.left - rect.width / 2), y: pull(y - rect.top - rect.height / 2) };
}

export function motionEnv(win: Window): { reduce: boolean; cursor: boolean } {
  const query = (q: string): boolean => (typeof win.matchMedia === 'function' ? win.matchMedia(q).matches : false);
  const reduce = typeof win.matchMedia !== 'function' || query('(prefers-reduced-motion: reduce)');
  return { reduce, cursor: !reduce && query('(hover: hover) and (pointer: fine)') && !query('(any-pointer: coarse)') };
}

/** Starts every effect inside `host`; returns the function that stops them and leaves every text final. */
export function startLandingMotion(host: HTMLElement, win: Window): () => void {
  const env = motionEnv(win);
  if (env.reduce) return () => undefined;
  const stops: (() => void)[] = [];
  const raf = (fn: FrameRequestCallback): number =>
    typeof win.requestAnimationFrame === 'function' ? win.requestAnimationFrame(fn) : 0;
  const listen = (target: EventTarget, type: string, fn: (e: Event) => void): void => {
    target.addEventListener(type, fn, { passive: true });
    stops.push(() => target.removeEventListener(type, fn));
  };

  /** Plays `frame` on every text node of `el` for `ms`, then puts the final texts back (also on stop). */
  const play = (el: Element, ms: number, frame: (text: string, p: number) => string): void => {
    const walker = win.document.createTreeWalker(el, 4);
    const nodes: { node: Text; text: string }[] = [];
    while (walker.nextNode()) nodes.push({ node: walker.currentNode as Text, text: (walker.currentNode as Text).data });
    // Screen readers keep the final text while the glyphs move: a name on the element (a heading keeps its role; a
    // counter is an `img` for the duration, since a generic element may not carry a name).
    el.setAttribute('aria-label', el.textContent ?? '');
    if (!/^H\d$/.test(el.tagName)) el.setAttribute('role', 'img');
    // The element keeps the box of its final text while the glyphs move: wider random glyphs would otherwise rewrap
    // the title and its neighbours, and shift everything below (the board) under a pointer that is already aiming.
    // Glyphs that do not fit are clipped, so they never paint, or catch the pointer, over the next block.
    const style = el.getAttribute('style');
    const box = el.getBoundingClientRect();
    if (el instanceof HTMLElement && box.width > 0) {
      el.style.boxSizing = 'border-box';
      el.style.width = `${String(box.width)}px`;
      el.style.height = `${String(box.height)}px`;
      el.style.overflow = 'hidden';
    }
    const settle = (): void => {
      nodes.forEach(({ node, text }) => (node.data = text));
      el.removeAttribute('aria-label');
      el.removeAttribute('role');
      if (style === null) el.removeAttribute('style');
      else el.setAttribute('style', style);
    };
    let done = false;
    const start = win.performance.now();
    const step = (now: number): void => {
      if (done) return;
      const p = clamp01((now - start) / ms);
      nodes.forEach(({ node, text }) => (node.data = frame(text, p)));
      if (p < 1) raf(step);
      else settle();
    };
    raf(step);
    stops.push(() => {
      done = true;
      settle();
    });
  };

  if (typeof IntersectionObserver === 'function') {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          io.unobserve(entry.target);
          if (entry.target.hasAttribute('data-scramble'))
            play(entry.target, SCRAMBLE_MS, (t, p) => scrambleFrame(t, p, Math.random));
          else play(entry.target, ODOMETER_MS, odometerFrame);
        }
      },
      { threshold: 0.6 },
    );
    host.querySelectorAll('[data-scramble], [data-odometer]').forEach((el) => io.observe(el));
    stops.push(() => io.disconnect());
  }

  const cards = Array.from(host.querySelectorAll<HTMLElement>('[data-stack]'));
  let queued = false;
  const shrink = (): void => {
    queued = false;
    cards.forEach((card, i) => {
      const next = cards[i + 1];
      if (next === undefined) return;
      const gap = next.getBoundingClientRect().top - card.getBoundingClientRect().top;
      card.style.scale = String(stackShrink(gap, win.innerHeight));
    });
  };
  if (cards.length > 1) {
    listen(win, 'scroll', () => {
      if (!queued) queued = raf(shrink) !== 0;
    });
    shrink();
    stops.push(() => cards.forEach((card) => (card.style.scale = '')));
  }

  if (env.cursor) {
    const dot = win.document.createElement('div');
    dot.className = 'cursor';
    dot.setAttribute('aria-hidden', 'true');
    // Follows the pointer through a short transition on `translate`; it grows over links, buttons and the slider.
    dot.style.cssText =
      'position:fixed;left:-9px;top:-9px;width:18px;height:18px;border-radius:50%;opacity:0;pointer-events:none;' +
      'z-index:60;background:var(--cc-color-on-block);mix-blend-mode:difference;transition:var(--cc-duration-fast) ' +
      'var(--cc-ease-out);transition-property:translate,scale';
    win.document.body.append(dot);
    host.classList.add('cc-cursor');
    listen(win, 'pointermove', (e) => {
      const { clientX, clientY, target } = e as PointerEvent;
      const big = target instanceof Element && target.closest('a, button, [role="slider"], [data-stack]') !== null;
      dot.style.translate = `${String(clientX)}px ${String(clientY)}px`;
      dot.style.scale = big ? '4.5' : '1';
      dot.style.opacity = '1';
    });
    for (const el of Array.from(host.querySelectorAll<HTMLElement>('[data-magnet]'))) {
      listen(el, 'pointermove', (e) => {
        const { x: mx, y: my } = magnetOffset(
          (e as PointerEvent).clientX,
          (e as PointerEvent).clientY,
          el.getBoundingClientRect(),
        );
        el.style.translate = `${String(mx)}px ${String(my)}px`;
      });
      listen(el, 'pointerleave', () => (el.style.translate = ''));
      stops.push(() => (el.style.translate = ''));
    }
    stops.push(() => {
      dot.remove();
      host.classList.remove('cc-cursor');
    });
  }

  return () => stops.splice(0).forEach((stop) => stop());
}
