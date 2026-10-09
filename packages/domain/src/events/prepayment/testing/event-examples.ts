import ex00 from '../../../../../../docs/specs/algorithm-examples/events/ex00-base-prepayments.json' with { type: 'json' };
import ex06 from '../../../../../../docs/specs/algorithm-examples/events/ex06-commissions-payoff.json' with { type: 'json' };
import { parseLocalDate, parsePaymentDay } from '../../../dates/index.ts';
import { parseMoney, parseRate } from '../../../money/index.ts';
import type { AdvanceInstallmentsEvent, PrepaymentEvent } from '../../../types/events.ts';
import type { LoanTerms } from '../../../types/loan.ts';
import { CURRENCIES, RATE_TYPES, ROUNDING_PROFILES } from '../../../types/primitives.ts';

/** Fila esperada de un ejemplo (subconjunto de `ScheduleRow`). */
export type ExpectedRow = Readonly<Record<string, string | number | boolean | readonly string[]>>;

export interface EventExampleCase {
  readonly file: string;
  readonly id: string;
  readonly terms: LoanTerms;
  readonly events: readonly (PrepaymentEvent | AdvanceInstallmentsEvent)[];
  readonly expected: {
    readonly installmentCount: number;
    readonly endDate: string;
    readonly rows: readonly ExpectedRow[];
    readonly totals: Readonly<Record<string, string>>;
  };
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

interface RawEvent {
  readonly id: string;
  readonly type: string;
  readonly date: string;
  readonly amount?: string;
  readonly mode?: string;
  readonly count?: number;
  readonly commission?: { kind: string; amount?: string; rate?: string };
}

interface RawCase {
  readonly id: string;
  readonly operation: string;
  readonly terms: RawTerms;
  readonly events: readonly RawEvent[];
  readonly expected: EventExampleCase['expected'];
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

function toEvent(raw: RawEvent): PrepaymentEvent | AdvanceInstallmentsEvent {
  if (raw.type === 'AdvanceInstallments') {
    if (typeof raw.count !== 'number') {
      throw new Error(`AdvanceInstallments ${raw.id} needs a numeric count`);
    }
    return { type: 'AdvanceInstallments', id: raw.id, date: parseLocalDate(raw.date), count: raw.count };
  }
  if (raw.type !== 'Prepayment') {
    throw new Error(`Unexpected event type: ${raw.type}`);
  }
  const base = {
    type: 'Prepayment',
    id: raw.id,
    date: parseLocalDate(raw.date),
    amount: parseMoney(raw.amount),
    mode: pick(['REDUCE_TERM', 'REDUCE_INSTALLMENT'] as const, String(raw.mode)),
  } as const;
  const { commission } = raw;
  if (commission === undefined) {
    return base;
  }
  return commission.kind === 'FLAT'
    ? { ...base, commission: { kind: 'FLAT', amount: parseMoney(commission.amount) } }
    : { ...base, commission: { kind: 'PERCENT', rate: parseRate(commission.rate) } };
}

const FILES: ReadonlyArray<readonly [string, unknown]> = [
  ['ex00-base-prepayments.json', ex00],
  ['ex06-commissions-payoff.json', ex06],
];

/** Casos `buildSchedule` de los ejemplos con solo `Prepayment` y `AdvanceInstallments` (W2-04). */
export function loadPrepaymentExampleCases(): readonly EventExampleCase[] {
  return FILES.flatMap(([file, content]) =>
    (content as { cases: readonly RawCase[] }).cases.map((item) => {
      if (item.operation !== 'buildSchedule' || 'error' in item.expected) {
        throw new Error(`${file} / ${item.id}: expected a buildSchedule case that returns a schedule`);
      }
      return {
        file,
        id: item.id,
        terms: toTerms(item.terms),
        events: item.events.map(toEvent),
        expected: item.expected,
      };
    }),
  );
}
