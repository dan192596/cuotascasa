import { parseLocalDate } from '../../dates/index.ts';
import { createEngineContext } from '../../engine-context.ts';
import { parseMoney, parseRate } from '../../money/index.ts';
import type { EngineContext, EventHandlerRegistry } from '../../types/engine.ts';
import type {
  ActualPaymentEvent,
  AdvanceInstallmentsEvent,
  FixedChargeChangeEvent,
  PrepaymentEvent,
  RateChangeEvent,
  ReportedBalanceEvent,
} from '../../types/events.ts';
import type { LoanTerms } from '../../types/loan.ts';

const m = parseMoney;
const d = parseLocalDate;

/** Préstamo sintético corto: 12 cuotas de fin de mes desde 2026-01-31, un solo componente de seguro. */
export function shortTerms(overrides: Partial<LoanTerms> = {}): LoanTerms {
  return {
    principal: m('1200.00'),
    termMonths: 12,
    disbursementDate: d('2025-12-31'),
    firstDueDate: d('2026-01-31'),
    paymentDay: 'END_OF_MONTH',
    currency: 'GTQ',
    interestRate: parseRate('0.12'),
    insuranceRates: [parseRate('0.01')],
    fixedCharges: [],
    roundingProfile: 'FHA_GT_V1',
    rateType: 'FIXED',
    ...overrides,
  };
}

export const prepayment = (id: string, date: string, amount = '100.00'): PrepaymentEvent => ({
  type: 'Prepayment',
  id,
  date: d(date),
  amount: m(amount),
  mode: 'REDUCE_TERM',
});

export const advance = (id: string, date: string, count = 1): AdvanceInstallmentsEvent => ({
  type: 'AdvanceInstallments',
  id,
  date: d(date),
  count,
});

export const reported = (
  id: string,
  date: string,
  balance: string,
  installmentNumber?: number,
): ReportedBalanceEvent => ({
  type: 'ReportedBalance',
  id,
  date: d(date),
  balance: m(balance),
  ...(installmentNumber === undefined ? {} : { installmentNumber }),
});

export const rateChange = (id: string, date: string): RateChangeEvent => ({
  type: 'RateChange',
  id,
  date: d(date),
  interestRate: parseRate('0.10'),
  policy: 'RECALC_INSTALLMENT_KEEP_TERM',
});

export const fixedChange = (id: string, date: string, amount = '20.00'): FixedChargeChangeEvent => ({
  type: 'FixedChargeChange',
  id,
  date: d(date),
  fixedCharges: [{ label: 'IUSI', amount: m(amount) }],
});

export const actualPayment = (id: string, date: string, installmentNumber: number): ActualPaymentEvent => ({
  type: 'ActualPayment',
  id,
  date: d(date),
  installmentNumber,
  total: m('1.00'),
});

/** Contexto con handlers de prueba: cada uno anota `<id>@<k>` en `log` y devuelve el estado sin cambios. */
export function recordingContext(log: string[], overrides: Partial<EventHandlerRegistry> = {}): EngineContext {
  const record = (input: { readonly event: { readonly id: string }; readonly k: number }) => {
    log.push(`${input.event.id}@${String(input.k)}`);
  };
  const registry: EventHandlerRegistry = {
    ReportedBalance: (input) => {
      record(input);
      return { state: input.state };
    },
    RateChange: (input) => {
      record(input);
      return { state: input.state };
    },
    FixedChargeChange: (input) => {
      record(input);
      return { state: input.state };
    },
    Prepayment: (input) => {
      record(input);
      return { state: input.state };
    },
    AdvanceInstallments: (input) => {
      record(input);
      return { state: input.state };
    },
    ActualPayment: (input) => {
      record(input);
      return { state: input.state };
    },
    ...overrides,
  };
  return createEngineContext({ registry });
}
