import { TestBed } from '@angular/core/testing';
import type { Clock } from '@cuotascasa/persistence';
import { beforeEach, describe, expect, it } from 'vitest';
import { CLOCK } from '../data-layer.tokens.ts';
import {
  LOAN_EVENTS_STORE,
  LOAN_PROJECTION_SERVICE,
  LOANS_STORE,
  PAYMENTS_STORE,
  REPORTED_BALANCES_STORE,
  SCENARIOS_STORE,
} from '../tokens.ts';
import { provideEngineFacade } from './provide-engine-facade.ts';

/** The factory only passes the stores through; no member is read while the facade is created. */
const STORES = [LOANS_STORE, LOAN_EVENTS_STORE, REPORTED_BALANCES_STORE, PAYMENTS_STORE, SCENARIOS_STORE].map(
  (token) => ({ provide: token, useValue: {} }),
);

const FIXED_CLOCK: Clock = { now: () => '2030-01-15T12:00:00.000Z', today: () => '2030-01-15' };

beforeEach(() => TestBed.resetTestingModule());

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
