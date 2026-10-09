import ex00 from '../../../../../docs/specs/algorithm-examples/core/ex00-base-fha.json' with { type: 'json' };
import ex01 from '../../../../../docs/specs/algorithm-examples/core/ex01-simple-two-components.json' with { type: 'json' };
import ex02 from '../../../../../docs/specs/algorithm-examples/core/ex02-payment-days.json' with { type: 'json' };
import ex05a from '../../../../../docs/specs/algorithm-examples/core/ex05a-fixed-charge-effective-from.json' with { type: 'json' };
import ex13a from '../../../../../docs/specs/algorithm-examples/core/ex13a-yearly-subtotals.json' with { type: 'json' };
import ex14 from '../../../../../docs/specs/algorithm-examples/core/ex14-zero-rates.json' with { type: 'json' };
import ex15 from '../../../../../docs/specs/algorithm-examples/core/ex15-due-date-consistency.json' with { type: 'json' };
import ex17 from '../../../../../docs/specs/algorithm-examples/core/ex17-fha-half-cent-tie.json' with { type: 'json' };
import { parseLocalDate, parsePaymentDay } from '../../dates/index.ts';
import { parseMoney, parseRate } from '../../money/index.ts';
import type { LoanTerms } from '../../types/loan.ts';
import { CURRENCIES, RATE_TYPES, ROUNDING_PROFILES } from '../../types/primitives.ts';

/** Fila esperada de un ejemplo: subconjunto de `ScheduleRow` (docs/specs/algorithm-examples/INDEX.md). */
export interface ExpectedRow {
  readonly k: number;
  readonly dueDate: string;
  readonly opening: string;
  readonly level: string;
  readonly interest: string;
  readonly insurance: string;
  readonly insuranceComponents: readonly string[];
  readonly capital: string;
  readonly fixedCharges: string;
  readonly total: string;
  readonly closing: string;
  readonly prepayment: string;
  readonly commission: string;
  readonly paid: boolean;
}

export interface ExpectedSchedule {
  readonly installmentCount: number;
  readonly endDate: string;
  readonly rows: readonly ExpectedRow[];
  readonly totals: Readonly<Record<string, string>>;
  readonly yearly?: readonly Readonly<Record<string, string | number>>[];
}

export interface ExampleCase {
  readonly file: string;
  readonly id: string;
  readonly terms: LoanTerms;
  readonly expected: ExpectedSchedule | null;
  /** `{ type, rule }` de un caso que debe fallar. */
  readonly error: { readonly type: string; readonly rule: string } | null;
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
  readonly events: readonly unknown[];
  readonly expected: Partial<ExpectedSchedule> & { readonly error?: { type: string; rule: string } };
}

interface RawFile {
  readonly synthetic: true;
  readonly cases: readonly RawCase[];
}

/** Los ejemplos de `docs/specs/algorithm-examples/core/` (sin eventos), tal como están en disco. */
const CORE_FILES: ReadonlyArray<readonly [string, unknown]> = [
  ['ex00-base-fha.json', ex00],
  ['ex01-simple-two-components.json', ex01],
  ['ex02-payment-days.json', ex02],
  ['ex05a-fixed-charge-effective-from.json', ex05a],
  ['ex13a-yearly-subtotals.json', ex13a],
  ['ex14-zero-rates.json', ex14],
  ['ex15-due-date-consistency.json', ex15],
  ['ex17-fha-half-cent-tie.json', ex17],
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

/** Todos los casos `buildSchedule` sin eventos de `docs/specs/algorithm-examples/core/` ([ALG.PENDING] del motor). */
export function loadCoreExampleCases(): readonly ExampleCase[] {
  const cases: ExampleCase[] = [];
  for (const [file, content] of CORE_FILES) {
    const raw = content as RawFile;
    for (const item of raw.cases) {
      if (item.operation !== 'buildSchedule' || item.events.length !== 0) {
        throw new Error(`${file} / ${item.id}: core examples must be buildSchedule cases without events`);
      }
      const { error, ...schedule } = item.expected;
      cases.push({
        file,
        id: item.id,
        terms: toTerms(item.terms),
        expected: error === undefined ? (schedule as ExpectedSchedule) : null,
        error: error ?? null,
      });
    }
  }
  return cases;
}
