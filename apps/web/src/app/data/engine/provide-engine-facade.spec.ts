import { TestBed } from '@angular/core/testing';
import type { Clock } from '@cuotascasa/persistence';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoanProjectionService } from '../api.ts';
import { CLOCK } from '../data-layer.tokens.ts';
import {
  LOAN_EVENTS_STORE,
  LOAN_PROJECTION_SERVICE,
  LOANS_STORE,
  PAYMENTS_STORE,
  REPORTED_BALANCES_STORE,
  SCENARIOS_STORE,
} from '../tokens.ts';
import { FakeClock } from './testing/fake-stores.ts';
import { provideEngineFacade } from './provide-engine-facade.ts';

/** The factory only passes the stores through; no member is read while the facade is created. */
const STORES = [LOANS_STORE, LOAN_EVENTS_STORE, REPORTED_BALANCES_STORE, PAYMENTS_STORE, SCENARIOS_STORE].map(
  (token) => ({ provide: token, useValue: {} }),
);

const FIXED_CLOCK: Clock = { now: () => '2030-01-15T12:00:00.000Z', today: () => '2030-01-15' };

beforeEach(() => TestBed.resetTestingModule());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function setup(today: string): { clock: FakeClock; service: LoanProjectionService } {
  const clock = new FakeClock(today);
  TestBed.configureTestingModule({
    providers: [provideEngineFacade(), ...STORES, { provide: CLOCK, useValue: clock }],
  });
  return { clock, service: TestBed.inject(LOAN_PROJECTION_SERVICE) };
}

function setVisibility(state: 'visible' | 'hidden'): void {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state);
}

describe('provideEngineFacade()', () => {
  it('fails fast when no CLOCK is provided (W3-10 provides it with the data stores)', () => {
    TestBed.configureTestingModule({ providers: [provideEngineFacade(), ...STORES] });
    expect(() => TestBed.inject(LOAN_PROJECTION_SERVICE)).toThrow(/CLOCK|No provider/);
  });

  it('reads asOf from the injected CLOCK', () => {
    TestBed.configureTestingModule({
      providers: [provideEngineFacade(), ...STORES, { provide: CLOCK, useValue: FIXED_CLOCK }],
    });
    expect(TestBed.inject(LOAN_PROJECTION_SERVICE).asOf()).toBe('2030-01-15');
  });
});

describe('asOf follows the calendar', () => {
  it('re-reads the Clock when the page becomes visible again and on pageshow', () => {
    const { clock, service } = setup('2030-01-15');
    clock.setToday('2030-01-16');
    expect(service.asOf()).toBe('2030-01-15');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(service.asOf()).toBe('2030-01-16');
    clock.setToday('2030-01-17');
    window.dispatchEvent(new Event('pageshow'));
    expect(service.asOf()).toBe('2030-01-17');
  });

  it('does not change the value on the same day', () => {
    const { service } = setup('2030-01-15');
    const seen: string[] = [];
    const first = service.asOf();
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pageshow'));
    seen.push(service.asOf());
    expect(seen).toEqual([first]);
  });

  it('ignores a visibilitychange to hidden', () => {
    const { clock, service } = setup('2030-01-15');
    clock.setToday('2030-01-16');
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(service.asOf()).toBe('2030-01-15');
  });

  it('crosses local midnight while visible and reschedules the timer', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2030, 0, 15, 23, 59, 30));
    const { clock, service } = setup('2030-01-15');
    clock.setToday('2030-01-16');
    vi.advanceTimersByTime(29_000);
    expect(service.asOf()).toBe('2030-01-15');
    vi.advanceTimersByTime(2_000);
    expect(service.asOf()).toBe('2030-01-16');
    // rescheduled for the next midnight
    clock.setToday('2030-01-17');
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(service.asOf()).toBe('2030-01-17');
  });

  it('keeps no timer while hidden and re-arms it when visible again', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2030, 0, 15, 12, 0, 0));
    const { clock, service } = setup('2030-01-15');
    expect(vi.getTimerCount()).toBe(1);
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(vi.getTimerCount()).toBe(0);
    clock.setToday('2030-01-16');
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(service.asOf()).toBe('2030-01-16');
    expect(vi.getTimerCount()).toBe(1);
  });

  it('destroying the injector clears the timer and the listeners', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2030, 0, 15, 12, 0, 0));
    const remove = vi.spyOn(document, 'removeEventListener');
    const { clock, service } = setup('2030-01-15');
    expect(vi.getTimerCount()).toBe(1);
    TestBed.resetTestingModule();
    expect(vi.getTimerCount()).toBe(0);
    expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    clock.setToday('2030-01-16');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(service.asOf()).toBe('2030-01-15');
  });
});
