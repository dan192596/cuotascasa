import { formatNumber } from '@angular/common';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appConfig } from './app.config.ts';

describe('app.config.ts', () => {
  it('registers es-GT as LOCALE_ID (ADR-0011 decision 6)', () => {
    TestBed.configureTestingModule({ providers: appConfig.providers });
    expect(TestBed.inject(LOCALE_ID)).toBe('es-GT');
    expect(formatNumber(1234.5, 'es-GT', '1.2-2')).toBe('1,234.50');
  });

  it('runs without zone.js (ADR-0011 decision 2)', () => {
    expect(typeof (globalThis as { Zone?: unknown }).Zone).toBe('undefined');
  });
});

/** A fake ViewTransition: runs the update callback at once, like a browser would, and records skipTransition. */
interface FakeTransition {
  readonly skipTransition: ReturnType<typeof vi.fn>;
}

describe('route view transitions (W8-02)', () => {
  const transitions: FakeTransition[] = [];
  let startViewTransition: ReturnType<typeof vi.fn>;

  function stubBrowser(reducedMotion: boolean, finished?: Promise<void>): void {
    transitions.length = 0;
    startViewTransition = vi.fn((update: () => Promise<void>) => {
      const done = update();
      const transition: FakeTransition & Record<string, unknown> = {
        skipTransition: vi.fn(),
        updateCallbackDone: done,
        ready: Promise.resolve(),
        finished: finished ?? done,
      };
      transitions.push(transition);
      return transition;
    });
    Object.defineProperty(document, 'startViewTransition', { configurable: true, value: startViewTransition });
    // jsdom has no matchMedia: give the window a fake one that only answers the reduced-motion query.
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) =>
        ({ matches: reducedMotion && query === '(prefers-reduced-motion: reduce)', media: query }) as MediaQueryList,
    });
  }

  /** Navigates twice and returns how many transitions the first navigation started. */
  async function navigateTwice(): Promise<number> {
    TestBed.configureTestingModule({ providers: appConfig.providers });
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/ruta-sintetica-a');
    const afterFirst = startViewTransition.mock.calls.length;
    await router.navigateByUrl('/ruta-sintetica-b');
    return afterFirst;
  }

  afterEach(() => {
    Reflect.deleteProperty(document, 'startViewTransition');
    Reflect.deleteProperty(window, 'matchMedia');
  });

  // Must stay first: withViewTransitions keeps its "skip next" flag on the options object built once by appConfig, so
  // only the first router created in this file sees the initial navigation as initial.
  it('wraps navigations in a view transition, skipping only the initial one', async () => {
    stubBrowser(false);
    const startedByInitial = await navigateTwice();
    expect(startedByInitial).toBe(0);
    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(transitions.at(-1)?.skipTransition).not.toHaveBeenCalled();
  });

  it('skips the transition when the user prefers reduced motion', async () => {
    stubBrowser(true);
    await navigateTwice();
    expect(transitions.length).toBeGreaterThan(0);
    for (const transition of transitions) expect(transition.skipTransition).toHaveBeenCalledTimes(1);
  });

  it('skips an active transition on the first pointerdown, then stops listening when it settles (ADR-0026 §5.4)', async () => {
    let settle!: () => void;
    const finished = new Promise<void>((resolve) => (settle = resolve));
    stubBrowser(false, finished);
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    await navigateTwice();
    const transition = transitions.at(-1);
    expect(transition?.skipTransition).not.toHaveBeenCalled();
    const added = add.mock.calls.find(([type]) => type === 'pointerdown');
    expect(added?.[2]).toEqual({ capture: true });
    expect(document.documentElement.classList.contains('cc-view-transition')).toBe(true);

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(transition?.skipTransition).toHaveBeenCalledTimes(1);
    expect(remove.mock.calls.some(([type]) => type === 'pointerdown')).toBe(false);

    settle();
    await finished;
    await Promise.resolve();
    expect(remove.mock.calls.find(([type]) => type === 'pointerdown')?.[1]).toBe(added?.[1]);
    expect(document.documentElement.classList.contains('cc-view-transition')).toBe(false);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(transition?.skipTransition).toHaveBeenCalledTimes(1);
    add.mockRestore();
    remove.mockRestore();
  });

  it('never listens for presses when reduced motion already skipped the transition', async () => {
    stubBrowser(true);
    const add = vi.spyOn(document, 'addEventListener');
    await navigateTwice();
    expect(add.mock.calls.some(([type]) => type === 'pointerdown')).toBe(false);
    expect(document.documentElement.classList.contains('cc-view-transition')).toBe(false);
    add.mockRestore();
  });

  it('keeps the root class until the newest overlapping transition settles', async () => {
    const settlers: (() => void)[] = [];
    stubBrowser(false);
    startViewTransition.mockImplementation((update: () => Promise<void>) => {
      const done = update();
      const finished = new Promise<void>((resolve) => settlers.push(resolve));
      return { skipTransition: vi.fn(), updateCallbackDone: done, ready: Promise.resolve(), finished };
    });
    TestBed.configureTestingModule({ providers: appConfig.providers });
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/ruta-sintetica-a');
    await router.navigateByUrl('/ruta-sintetica-b');
    await router.navigateByUrl('/ruta-sintetica-c');
    // The initial-navigation skip was already used by an earlier test, so every navigation starts a transition.
    expect(settlers.length).toBe(3);
    const active = () => document.documentElement.classList.contains('cc-view-transition');
    expect(active()).toBe(true);
    settlers[0]?.();
    settlers[1]?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(active()).toBe(true);
    settlers[2]?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(active()).toBe(false);
  });
});
