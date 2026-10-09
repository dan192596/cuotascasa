import { centsToMoney } from '../money.ts';
import type { RowComparison } from './compare-rows.ts';

/** Exactly the three labeled lines of tools/oracle/FORMAT.md §8.3; never the total row count, amounts or terms. */
export function formatResultLines(result: RowComparison): string {
  return [
    `allRowsMatched: ${result.mismatchedRows === 0 ? 'yes' : 'no'}`,
    `mismatchedRows: ${String(result.mismatchedRows)}`,
    `maxAbsDiff: ${centsToMoney(result.maxAbsDiffCents)}`,
  ]
    .map((line) => `${line}\n`)
    .join('');
}

/**
 * The validation-log line of tools/oracle/FORMAT.md §8.4, with `motor <sha>` (the TypeScript engine).
 * Only sí or no: no mismatch count and no max difference, which could reveal the real term or an amount.
 */
export function formatLogLine(input: { date: string; sha: string; label: string; result: RowComparison }): string {
  const matched = input.result.mismatchedRows === 0 ? 'sí' : 'no';
  return `${input.date} · motor ${input.sha} · préstamo ${input.label} · todas las filas coinciden: ${matched}\n`;
}
