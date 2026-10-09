import ex03 from '../../../../../../docs/specs/algorithm-examples/events/ex03-rate-change-policies.json' with { type: 'json' };
import ex05b from '../../../../../../docs/specs/algorithm-examples/events/ex05b-fixed-charge-change.json' with { type: 'json' };
import { parseLocalDate, parsePaymentDay } from '../../../dates/index.ts';
import { parseMoney, parseRate } from '../../../money/index.ts';
import type { FixedChargeChangeEvent, RateChangeEvent } from '../../../types/events.ts';
import type { LoanTerms } from '../../../types/loan.ts';
import { CURRENCIES, RATE_TYPES, ROUNDING_PROFILES } from '../../../types/primitives.ts';

/** Fila esperada: subconjunto de `ScheduleRow` (docs/specs/algorithm-examples/INDEX.md). */
export type ExpectedRow = Readonly<Record<string, string | number | boolean | readonly string[]>> & {
  readonly k: number;
};

export interface ExpectedSchedule {
  readonly installmentCount: number;
  readonly endDate: string;
  readonly rows: readonly ExpectedRow[];
  readonly totals: Readonly<Record<string, string>>;
}

export interface EventExampleCase {
  readonly file: string;
  readonly id: string;
  readonly terms: LoanTerms;
  readonly events: readonly (RateChangeEvent | FixedChargeChangeEvent)[];
  readonly expected: ExpectedSchedule | null;
  readonly error: { readonly type: string; readonly rule: string; readonly k?: number } | null;
}

interface RawEvent {
  readonly id: string;
  readonly type: string;
  readonly date: string;
  readonly policy?: string;
  readonly interestRate?: string;
  readonly insuranceRates?: readonly string[];
  readonly bankInstallment?: string;
  readonly fixedCharges?: readonly { label: string; amount: string }[];
}

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

interface RawCase {
  readonly id: string;
  readonly operation: string;
  readonly terms: RawTerms;
  readonly events: readonly RawEvent[];
  readonly expected: Partial<ExpectedSchedule> & { readonly error?: { type: string; rule: string; k?: number } };
}

const FILES: ReadonlyArray<readonly [string, unknown]> = [
  ['ex03-rate-change-policies.json', ex03],
  ['ex05b-fixed-charge-change.json', ex05b],
];

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

function toEvent(raw: RawEvent): RateChangeEvent | FixedChargeChangeEvent {
  const base = { id: raw.id, date: parseLocalDate(raw.date) };
  if (raw.type === 'FixedChargeChange') {
    return {
      ...base,
      type: 'FixedChargeChange',
      fixedCharges: (raw.fixedCharges ?? []).map((line) => ({ label: line.label, amount: parseMoney(line.amount) })),
    };
  }
  const rates = {
    ...(raw.interestRate === undefined ? {} : { interestRate: parseRate(raw.interestRate) }),
    ...(raw.insuranceRates === undefined ? {} : { insuranceRates: raw.insuranceRates.map((rate) => parseRate(rate)) }),
  };
  if (raw.policy === 'BANK_INSTALLMENT' && raw.bankInstallment !== undefined) {
    return {
      ...base,
      ...rates,
      type: 'RateChange',
      policy: 'BANK_INSTALLMENT',
      bankInstallment: parseMoney(raw.bankInstallment),
    };
  }
  if (raw.policy === 'RECALC_INSTALLMENT_KEEP_TERM' || raw.policy === 'KEEP_INSTALLMENT_ADJUST_TERM') {
    return { ...base, ...rates, type: 'RateChange', policy: raw.policy };
  }
  throw new Error(`Unexpected event in example: ${raw.type} ${raw.policy ?? ''}`);
}

/** Los casos `buildSchedule` de ex03 (políticas de `RateChange`) y ex05b (`FixedChargeChange`). */
export function loadEventExampleCases(): readonly EventExampleCase[] {
  const cases: EventExampleCase[] = [];
  for (const [file, content] of FILES) {
    for (const item of (content as { cases: readonly RawCase[] }).cases) {
      const { error, ...schedule } = item.expected;
      cases.push({
        file,
        id: item.id,
        terms: toTerms(item.terms),
        events: item.events.map(toEvent),
        expected: error === undefined ? (schedule as ExpectedSchedule) : null,
        error: error ?? null,
      });
    }
  }
  return cases;
}
