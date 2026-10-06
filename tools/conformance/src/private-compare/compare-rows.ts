import type { ExpectedRow } from '@cuotascasa/schema';
import { moneyToCents } from '../money.ts';

export interface RowComparison {
  /** Positions k = 1 … max(n expected, n computed) where a row is missing on one side or any field differs. */
  readonly mismatchedRows: number;
  /** Largest |expected − computed| over the money fields of the rows present on both sides; 0 if none. */
  readonly maxAbsDiffCents: bigint;
}

const MONEY_FIELDS = [
  'opening',
  'level',
  'interest',
  'insurance',
  'capital',
  'fixedCharges',
  'prepayment',
  'commission',
  'total',
  'closing',
] as const;

function absDiff(expected: string, actual: string): bigint | null {
  const e = moneyToCents(expected);
  const a = moneyToCents(actual);
  if (e === null || a === null) return null;
  return e > a ? e - a : a - e;
}

function compareRow(expected: ExpectedRow, actual: ExpectedRow): { differs: boolean; maxCents: bigint } {
  let differs = expected.k !== actual.k || expected.dueDate !== actual.dueDate || expected.paid !== actual.paid;
  let maxCents = 0n;
  const note = (e: string, a: string): void => {
    const diff = absDiff(e, a);
    if (diff === null) differs = true;
    else {
      if (diff > 0n) differs = true;
      if (diff > maxCents) maxCents = diff;
    }
  };
  for (const field of MONEY_FIELDS) note(expected[field], actual[field]);
  if (expected.insuranceComponents.length !== actual.insuranceComponents.length) differs = true;
  else expected.insuranceComponents.forEach((value, index) => note(value, actual.insuranceComponents[index] ?? ''));
  return { differs, maxCents };
}

/** Row-by-row comparison of tools/oracle/FORMAT.md §8.3 (the same rules as the oracle's `compare`). */
export function compareRows(expected: readonly ExpectedRow[], actual: readonly ExpectedRow[]): RowComparison {
  let mismatchedRows = 0;
  let maxAbsDiffCents = 0n;
  const positions = Math.max(expected.length, actual.length);
  for (let index = 0; index < positions; index += 1) {
    const e = expected[index];
    const a = actual[index];
    if (e === undefined || a === undefined) {
      mismatchedRows += 1;
      continue;
    }
    const result = compareRow(e, a);
    if (result.differs) mismatchedRows += 1;
    if (result.maxCents > maxAbsDiffCents) maxAbsDiffCents = result.maxCents;
  }
  return { mismatchedRows, maxAbsDiffCents };
}
