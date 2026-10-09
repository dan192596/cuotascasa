import ex12 from '../../../../../docs/specs/algorithm-examples/events/ex12-validation-traffic-light.json' with { type: 'json' };
import { parseLocalDate, parsePaymentDay } from '../../dates/index.ts';
import { parseMoney, parseRate } from '../../money/index.ts';
import type { ReportedBalanceEvent } from '../../types/events.ts';
import type { LoanTerms } from '../../types/loan.ts';
import { CURRENCIES, RATE_TYPES, ROUNDING_PROFILES } from '../../types/primitives.ts';

interface RawTerms {
  readonly principal: string;
  readonly termMonths: number;
  readonly disbursementDate: string;
  readonly firstDueDate: string;
  readonly paymentDay: number | string;
  readonly currency: string;
  readonly interestRate: string;
  readonly insuranceRates: readonly string[];
  readonly fixedCharges: readonly { label: string; amount: string; effectiveFrom: string }[];
  readonly roundingProfile: string;
  readonly rateType: string;
}

interface RawReported {
  readonly id: string;
  readonly date: string;
  readonly balance: string;
  readonly installmentNumber?: number;
}

interface RawCase {
  readonly id: string;
  readonly terms: RawTerms;
  readonly realEvents: readonly (RawReported & { readonly type: 'ReportedBalance' })[];
  readonly reported: RawReported;
  readonly expected: {
    readonly k?: number;
    readonly reported?: string;
    readonly modeled?: string;
    readonly realDelta?: string;
    readonly status?: string;
    readonly cause?: string | null;
    readonly error?: { readonly type: string; readonly rule: string; readonly k?: number };
  };
}

export interface ValidationExampleCase {
  readonly id: string;
  readonly terms: LoanTerms;
  readonly realEvents: readonly ReportedBalanceEvent[];
  readonly reported: ReportedBalanceEvent;
  readonly expected: RawCase['expected'];
}

function pick<T extends string>(allowed: readonly T[], value: string): T {
  const found = allowed.find((candidate) => candidate === value);
  if (found === undefined) {
    throw new Error(`Unexpected value in example: ${value}`);
  }
  return found;
}

function toTerms(raw: RawTerms): LoanTerms {
  return {
    principal: parseMoney(raw.principal),
    termMonths: raw.termMonths,
    disbursementDate: parseLocalDate(raw.disbursementDate),
    firstDueDate: parseLocalDate(raw.firstDueDate),
    paymentDay: parsePaymentDay(raw.paymentDay),
    currency: pick(CURRENCIES, raw.currency),
    interestRate: parseRate(raw.interestRate),
    insuranceRates: raw.insuranceRates.map((rate) => parseRate(rate)),
    fixedCharges: raw.fixedCharges.map((charge) => ({
      label: charge.label,
      amount: parseMoney(charge.amount),
      effectiveFrom: parseLocalDate(charge.effectiveFrom),
    })),
    roundingProfile: pick(ROUNDING_PROFILES, raw.roundingProfile),
    rateType: pick(RATE_TYPES, raw.rateType),
  };
}

function toReported(raw: RawReported): ReportedBalanceEvent {
  return {
    type: 'ReportedBalance',
    id: raw.id,
    date: parseLocalDate(raw.date),
    balance: parseMoney(raw.balance),
    ...(raw.installmentNumber === undefined ? {} : { installmentNumber: raw.installmentNumber }),
  };
}

/** Los casos de `docs/specs/algorithm-examples/events/ex12-validation-traffic-light.json`, tal como están en disco. */
export function loadValidationExampleCases(): readonly ValidationExampleCase[] {
  return (ex12 as unknown as { readonly cases: readonly RawCase[] }).cases.map((item) => ({
    id: item.id,
    terms: toTerms(item.terms),
    realEvents: item.realEvents.map(toReported),
    reported: toReported(item.reported),
    expected: item.expected,
  }));
}
