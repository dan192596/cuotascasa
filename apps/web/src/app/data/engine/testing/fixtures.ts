/**
 * Synthetic fixtures of the engine facade tests: the [ALG.EXAMPLE] loan of docs/algorithm.md and friends.
 * Test support only (`testing/`): no real loan data.
 */
import type { LoanDraft } from '../../api.ts';
import type { ActualPayment, Loan, LoanEvent, ReportedBalance, Scenario, ScenarioEvent } from '@cuotascasa/schema';

export const DEVICE_ID = '00000000-0000-4000-8000-000000000001';
const STAMP = '2026-01-01T00:00:00.000Z';

/** Deterministic synthetic UUID from a small number. */
export function uuid(n: number): string {
  return `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
}

const BASE = { createdAt: STAMP, updatedAt: STAMP, updatedByDevice: DEVICE_ID, deletedAt: null } as const;

/** [ALG.EXAMPLE]: 500000.00, 240 installments, i = 0.07, f = [0.01, 0.0026], END_OF_MONTH, FHA_GT_V1, two fixed charges. */
export function makeLoan(overrides: Partial<Loan> = {}): Loan {
  return {
    ...BASE,
    id: uuid(1),
    name: 'Casa sintetica',
    bank: 'Banco de prueba',
    principal: '500000.00',
    termMonths: 240,
    disbursementDate: '2025-01-15',
    firstDueDate: '2025-02-28',
    paymentDay: 'END_OF_MONTH',
    currency: 'GTQ',
    interestRate: '0.07',
    insuranceRates: ['0.01', '0.0026'],
    fixedCharges: [
      { label: 'IUSI', amount: '350.00', effectiveFrom: '2025-02-28' },
      { label: 'Seguro de danos', amount: '45.00', effectiveFrom: '2025-02-28' },
    ],
    roundingProfile: 'FHA_GT_V1',
    rateType: 'VARIABLE',
    templateRef: { id: 'fha-gt', version: 1 },
    status: 'active',
    ...overrides,
  };
}

/** A smaller GTQ loan for the multi-loan tests. */
export function makeSecondLoan(overrides: Partial<Loan> = {}): Loan {
  return makeLoan({
    id: uuid(2),
    name: 'Segunda sintetica',
    principal: '100000.00',
    termMonths: 120,
    interestRate: '0.06',
    insuranceRates: [],
    fixedCharges: [],
    roundingProfile: 'SIMPLE',
    paymentDay: 15,
    firstDueDate: '2025-02-15',
    ...overrides,
  });
}

export function makeBalance(overrides: Partial<ReportedBalance> & { id: string }): ReportedBalance {
  return {
    ...BASE,
    loanId: uuid(1),
    date: '2025-06-30',
    balance: '495834.02',
    source: 'OTHER',
    ...overrides,
  };
}

export function makePayment(overrides: Partial<ActualPayment> & { id: string }): ActualPayment {
  return {
    ...BASE,
    loanId: uuid(1),
    paidDate: '2025-02-28',
    installmentNumber: 1,
    total: '4658.47',
    ...overrides,
  };
}

export function makePrepayment(overrides: Partial<LoanEvent> & { id: string }): LoanEvent {
  return {
    ...BASE,
    loanId: uuid(1),
    date: '2026-01-15',
    type: 'Prepayment',
    amount: '20000.00',
    mode: 'REDUCE_TERM',
    ...overrides,
  } as LoanEvent;
}

export function makeRateChange(overrides: Partial<LoanEvent> & { id: string }): LoanEvent {
  return {
    ...BASE,
    loanId: uuid(1),
    date: '2026-06-30',
    type: 'RateChange',
    policy: 'RECALC_INSTALLMENT_KEEP_TERM',
    interestRate: '0.08',
    ...overrides,
  } as LoanEvent;
}

export function makeScenarioPrepayment(overrides: Partial<ScenarioEvent> & { id: string }): ScenarioEvent {
  return {
    date: '2027-01-15',
    type: 'Prepayment',
    amount: '10000.00',
    mode: 'REDUCE_TERM',
    deletedAt: null,
    ...overrides,
  } as ScenarioEvent;
}

export function makeScenario(overrides: Partial<Scenario> & { id: string }): Scenario {
  return { ...BASE, loanId: uuid(1), name: 'Escenario', events: [], ...overrides };
}

/** A Loan without id and stamps: what the wizard previews before saving. */
export function makeLoanDraft(overrides: Partial<Loan> = {}): LoanDraft {
  const loan = makeLoan(overrides);
  return {
    name: loan.name,
    bank: loan.bank,
    principal: loan.principal,
    termMonths: loan.termMonths,
    disbursementDate: loan.disbursementDate,
    firstDueDate: loan.firstDueDate,
    paymentDay: loan.paymentDay,
    currency: loan.currency,
    interestRate: loan.interestRate,
    insuranceRates: loan.insuranceRates,
    fixedCharges: loan.fixedCharges,
    roundingProfile: loan.roundingProfile,
    rateType: loan.rateType,
    templateRef: loan.templateRef,
    status: loan.status,
  };
}
