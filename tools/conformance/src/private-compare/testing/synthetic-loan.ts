import { EXPECTED_CSV_HEADER, type ExpectedRow, type FixtureInputs } from '@cuotascasa/schema';

/** Last day of the month that is `offset` months after February 2025 (END_OF_MONTH due dates). */
function endOfMonth(offset: number): string {
  const monthIndex = 1 + offset; // 0-based month index from January 2025
  const year = 2025 + Math.floor(monthIndex / 12);
  const month = (monthIndex % 12) + 1;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 31;
  return `${String(year)}-${String(month).padStart(2, '0')}-${String(days)}`;
}

/**
 * Synthetic zero-rate loan ([ALG.ZERO]) with a distinctive number of installments: `count` × 200.00, paid in `count`
 * installments of 200.00. Only for the private-compare tests; no value comes from a real loan.
 */
export function syntheticLoan(count: number): { inputs: FixtureInputs; rows: ExpectedRow[] } {
  const rows = Array.from({ length: count }, (_, index): ExpectedRow => {
    const opening = 200 * (count - index);
    return {
      k: index + 1,
      dueDate: endOfMonth(index),
      opening: `${String(opening)}.00`,
      level: '200.00',
      interest: '0.00',
      insurance: '0.00',
      insuranceComponents: [],
      capital: '200.00',
      fixedCharges: '0.00',
      prepayment: '0.00',
      commission: '0.00',
      total: '200.00',
      closing: `${String(opening - 200)}.00`,
      paid: false,
    };
  });
  const inputs: FixtureInputs = {
    terms: {
      principal: `${String(200 * count)}.00`,
      termMonths: count,
      disbursementDate: '2025-01-01',
      firstDueDate: '2025-02-28',
      paymentDay: 'END_OF_MONTH',
      currency: 'GTQ',
      interestRate: '0.0000',
      insuranceRates: [],
      fixedCharges: [],
      roundingProfile: 'FHA_GT_V1',
    },
    events: [],
  };
  return { inputs, rows };
}

/** a-expected.csv text in the private schema of tools/oracle/FORMAT.md §9. */
export function toExpectedCsv(rows: readonly ExpectedRow[], header: string = EXPECTED_CSV_HEADER): string {
  const lines = rows.map((row) =>
    [
      row.k,
      row.dueDate,
      row.opening,
      row.level,
      row.interest,
      row.insurance,
      row.insuranceComponents.join(';'),
      row.capital,
      row.fixedCharges,
      row.prepayment,
      row.commission,
      row.total,
      row.closing,
      row.paid,
    ].join(','),
  );
  return `${[header, ...lines].join('\n')}\n`;
}
