import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { DataError } from '../api.ts';
import {
  LOAN_EVENTS_STORE,
  LOANS_STORE,
  PAYMENTS_STORE,
  REPORTED_BALANCES_STORE,
  SCENARIOS_STORE,
  SETTINGS_STORE,
} from '../tokens.ts';
import { CC_STUB, provideStores } from './provide-stores.ts';

describe('provideStores (inert W0-05 stub, W3-11)', () => {
  it('returns empty, ready reads and rejects writes with DataError NOT_IMPLEMENTED', async () => {
    TestBed.configureTestingModule({ providers: [provideStores()] });
    const loans = TestBed.inject(LOANS_STORE);
    expect(CC_STUB).toBe('CC_STUB:W3-11');
    expect(loans.ready()).toBe(true);
    expect(loans.loans()).toEqual([]);
    expect(loans.loan('loan-1')()).toBeUndefined();
    expect(loans.isCurrencyLocked('loan-1')()).toBe(false);
    for (const token of [LOAN_EVENTS_STORE, REPORTED_BALANCES_STORE, PAYMENTS_STORE, SCENARIOS_STORE]) {
      expect(TestBed.inject(token).listByLoan('loan-1')()).toEqual([]);
    }
    expect(TestBed.inject(SCENARIOS_STORE).activeScenarioId('loan-1')()).toBeNull();
    expect(TestBed.inject(SETTINGS_STORE).theme()).toBe('system');
    await expect(loans.delete('loan-1')).rejects.toEqual(new DataError('NOT_IMPLEMENTED', CC_STUB));
  });
});
