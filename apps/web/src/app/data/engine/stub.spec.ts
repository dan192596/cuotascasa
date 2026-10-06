import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { LOAN_PROJECTION_SERVICE } from '../tokens.ts';
import { CC_STUB, provideEngineFacade } from './provide-engine-facade.ts';

describe('provideEngineFacade (inert W0-05 stub, W3-12)', () => {
  it('projects nothing: null values, UNVALIDATED, cutoffK 0 and no totals', () => {
    TestBed.configureTestingModule({ providers: [provideEngineFacade()] });
    const service = TestBed.inject(LOAN_PROJECTION_SERVICE);
    const projection = service.forLoan('loan-1');
    expect(CC_STUB).toBe('CC_STUB:W3-12');
    expect(service.forLoan('loan-1')).toBe(projection);
    expect(service.asOf()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(service.totalsByCurrency()).toEqual([]);
    expect(projection.paths()).toBeNull();
    expect(projection.balance()).toBeNull();
    expect(projection.validation().status).toBe('UNVALIDATED');
    expect(projection.cutoffK()).toBe(0);
    expect(projection.paidInstallments().size).toBe(0);
    expect(projection.suggestedPaid()).toBe(false);
    expect(service.compareScenarios('loan-1', [])()).toBeNull();
  });
});
