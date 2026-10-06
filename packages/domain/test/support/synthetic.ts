import { parseLocalDate } from '../../src/dates/index.ts';
import { parseMoney, parseRate } from '../../src/money/index.ts';
import type { PeriodState } from '../../src/types/engine.ts';
import type { DomainEventOf, DomainEventType } from '../../src/types/events.ts';
import type { LoanTerms } from '../../src/types/loan.ts';
import type { Schedule } from '../../src/types/schedule.ts';

const m = parseMoney;
const d = parseLocalDate;
const r = parseRate;

/** Condiciones sintéticas de [ALG.EXAMPLE]. Ningún dato real. */
export function syntheticTerms(): LoanTerms {
  return {
    principal: m('500000.00'),
    termMonths: 240,
    disbursementDate: d('2025-01-31'),
    firstDueDate: d('2025-02-28'),
    paymentDay: 'END_OF_MONTH',
    currency: 'GTQ',
    interestRate: r('0.07'),
    insuranceRates: [r('0.01'), r('0.0026')],
    fixedCharges: [
      { label: 'IUSI', amount: m('350.00'), effectiveFrom: d('2025-02-28') },
      { label: 'Seguro de daños', amount: m('45.00'), effectiveFrom: d('2025-02-28') },
    ],
    roundingProfile: 'FHA_GT_V1',
    rateType: 'VARIABLE',
  };
}

/** Estado inicial (k = 0) de [ALG.EXAMPLE]: level 4263.47 y plazo fijo de 240 cuotas. */
export function syntheticInitialState(): PeriodState {
  return {
    balance: m('500000.00'),
    interestRate: r('0.07'),
    insuranceRates: [r('0.01'), r('0.0026')],
    level: m('4263.47'),
    roundingProfile: 'FHA_GT_V1',
    k: 0,
    termMode: 'FIXED',
    term: 240,
  };
}

/** Un evento sintético por tipo, con valores de [ALG.EXAMPLE]. */
export const SYNTHETIC_EVENTS: { readonly [T in DomainEventType]: DomainEventOf<T> } = {
  ReportedBalance: {
    type: 'ReportedBalance',
    id: 'evt-anchor-1',
    date: d('2026-01-31'),
    balance: m('490000.00'),
    installmentNumber: 12,
  },
  RateChange: {
    type: 'RateChange',
    id: 'evt-rate-1',
    date: d('2026-01-15'),
    interestRate: r('0.075'),
    policy: 'RECALC_INSTALLMENT_KEEP_TERM',
  },
  FixedChargeChange: {
    type: 'FixedChargeChange',
    id: 'evt-fixed-1',
    date: d('2026-01-15'),
    fixedCharges: [{ label: 'IUSI', amount: m('360.00') }],
  },
  Prepayment: {
    type: 'Prepayment',
    id: 'evt-prepay-1',
    date: d('2026-01-15'),
    amount: m('20000.00'),
    mode: 'REDUCE_TERM',
  },
  AdvanceInstallments: { type: 'AdvanceInstallments', id: 'evt-advance-1', date: d('2026-01-15'), count: 6 },
  ActualPayment: {
    type: 'ActualPayment',
    id: 'evt-paid-1',
    date: d('2025-03-02'),
    installmentNumber: 1,
    total: m('4658.47'),
  },
};

/** Calendario sintético de una sola fila (cuota 1 de [ALG.EXAMPLE]); solo para invocar stubs. */
export function syntheticSchedule(): Schedule {
  const row = {
    k: 1,
    dueDate: d('2025-02-28'),
    opening: m('500000.00'),
    interest: m('2916.67'),
    insurance: m('525.00'),
    insuranceComponents: [m('416.67'), m('108.33')],
    capital: m('821.80'),
    fixedCharges: m('395.00'),
    total: m('4658.47'),
    closing: m('499178.20'),
    prepayment: m('0.00'),
    commission: m('0.00'),
    closingAfterPrepayment: m('499178.20'),
    level: m('4263.47'),
    isLast: false,
    payoff: false,
    paid: false,
  };
  return {
    currency: 'GTQ',
    roundingProfile: 'FHA_GT_V1',
    rows: [row],
    totals: {
      interest: m('2916.67'),
      insurance: m('525.00'),
      capital: m('821.80'),
      fixedCharges: m('395.00'),
      prepayments: m('0.00'),
      commissions: m('0.00'),
      total: m('4658.47'),
      totalPaid: m('4658.47'),
    },
    endDate: d('2025-02-28'),
    installmentCount: 1,
  };
}
