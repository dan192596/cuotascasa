import { type EnvironmentProviders, makeEnvironmentProviders, type Signal, signal } from '@angular/core';
import { type DomainError, type LoanTerms, type LocalDate, makeLocalDate } from '@cuotascasa/domain';
import type { Uuid } from '@cuotascasa/schema';
import {
  DataError,
  type LoanProjection,
  type LoanProjectionService,
  type LoanValidation,
  type ScenarioComparison,
} from '../api.ts';
import { LOAN_PROJECTION_SERVICE } from '../tokens.ts';

/** Inert W0-05 stub; W3-12 replaces this file (same export) and deletes stub.spec.ts. */
export const CC_STUB = 'CC_STUB:W3-12';

const NULL_SIGNAL = signal(null).asReadonly();
const UNVALIDATED: LoanValidation = {
  status: 'UNVALIDATED',
  reportedBalanceId: null,
  k: null,
  realDelta: null,
  cause: null,
};

function deviceToday(): LocalDate {
  const now = new Date();
  return makeLocalDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

class InertLoanProjectionService implements LoanProjectionService {
  readonly ccStub = CC_STUB;
  readonly asOf = signal(deviceToday()).asReadonly();
  readonly totalsByCurrency = signal([]).asReadonly();
  private readonly projections = new Map<Uuid, LoanProjection>();

  forLoan(loanId: Uuid): LoanProjection {
    const known = this.projections.get(loanId);
    if (known) {
      return known;
    }
    const projection: LoanProjection = {
      loanId,
      error: NULL_SIGNAL,
      paths: NULL_SIGNAL,
      metrics: NULL_SIGNAL,
      yearlySubtotals: NULL_SIGNAL,
      asOf: this.asOf,
      currentInstallment: NULL_SIGNAL,
      balance: NULL_SIGNAL,
      percentPaid: NULL_SIGNAL,
      nextInstallmentTotal: NULL_SIGNAL,
      realEndDate: NULL_SIGNAL,
      activeScenarioEndDate: NULL_SIGNAL,
      validation: signal(UNVALIDATED).asReadonly(),
      suggestedPaid: signal(false).asReadonly(),
      cutoffK: signal(0).asReadonly(),
      paidInstallments: signal<ReadonlySet<number>>(new Set()).asReadonly(),
      realDeltaPerAnchor: signal([]).asReadonly(),
      realDeltaPerComponent: signal([]).asReadonly(),
    };
    this.projections.set(loanId, projection);
    return projection;
  }

  compareScenarios(): Signal<ScenarioComparison | null> {
    return NULL_SIGNAL;
  }

  checkRealWrite(): DomainError | null {
    return null;
  }

  toLoanTerms(): LoanTerms {
    throw new DataError('NOT_IMPLEMENTED', CC_STUB);
  }
}

/** W3-12: entities → domain inputs → memoized projections. The stub projects nothing. */
export function provideEngineFacade(): EnvironmentProviders {
  const service: LoanProjectionService = new InertLoanProjectionService();
  return makeEnvironmentProviders([{ provide: LOAN_PROJECTION_SERVICE, useValue: service }]);
}
