import { Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSaveNotice, SAVE_NOTICE_MS } from './save-notice.ts';

describe('createSaveNotice', () => {
  afterEach(() => vi.useRealTimers());

  const make = () => runInInjectionContext(TestBed.inject(Injector), () => createSaveNotice());

  it('shows a message and hides it after a few seconds', () => {
    vi.useFakeTimers();
    const notice = make();
    expect(notice.message()).toBeNull();
    notice.show('Se guardaron los cambios.');
    expect(notice.message()).toBe('Se guardaron los cambios.');
    vi.advanceTimersByTime(SAVE_NOTICE_MS - 1);
    expect(notice.message()).toBe('Se guardaron los cambios.');
    vi.advanceTimersByTime(1);
    expect(notice.message()).toBeNull();
  });

  it('hides at once on the next edit, and a new save restarts the timer', () => {
    vi.useFakeTimers();
    const notice = make();
    notice.show('Uno.');
    notice.hide();
    expect(notice.message()).toBeNull();
    notice.show('Dos.');
    vi.advanceTimersByTime(SAVE_NOTICE_MS - 10);
    notice.show('Tres.');
    vi.advanceTimersByTime(SAVE_NOTICE_MS - 10);
    expect(notice.message()).toBe('Tres.');
  });
});
