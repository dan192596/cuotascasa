import { EXPECTED_CSV_HEADER, EXPECTED_ROW_COLUMNS, expectedRowSchema, type ExpectedRow } from '@cuotascasa/schema';

/** Closed list of error codes; the CLI prints only `error: <code>`, never a value or a row number. */
export const PRIVATE_COMPARE_ERROR_CODES = ['usage', 'terms-invalid', 'csv-header', 'csv-row', 'engine'] as const;
export type PrivateCompareErrorCode = (typeof PRIVATE_COMPARE_ERROR_CODES)[number];

export class PrivateCompareError extends Error {
  readonly code: PrivateCompareErrorCode;

  constructor(code: PrivateCompareErrorCode) {
    super(code);
    this.name = 'PrivateCompareError';
    this.code = code;
  }
}

const POSITIVE_INTEGER = /^[1-9]\d*$/;
const BOM = String.fromCharCode(0xfeff);

/**
 * Parses a-expected.csv (tools/oracle/FORMAT.md §9): UTF-8 without BOM, ',' separator, '\n' (or '\r\n') line ends,
 * no quotes and no empty lines except one final line break; the first line is exactly EXPECTED_CSV_HEADER; one row
 * per installment in k order; insuranceComponents joined by ';'. Throws PrivateCompareError('csv-header' | 'csv-row').
 */
export function parseExpectedCsv(text: string): ExpectedRow[] {
  if (text.startsWith(BOM)) throw new PrivateCompareError('csv-header');
  const lines = text.replaceAll('\r\n', '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  const [header, ...body] = lines;
  if (header !== EXPECTED_CSV_HEADER) throw new PrivateCompareError('csv-header');
  if (body.length === 0) throw new PrivateCompareError('csv-row');
  return body.map((line, index) => {
    const cells = line.split(',');
    if (line.includes('"') || cells.length !== EXPECTED_ROW_COLUMNS.length) throw new PrivateCompareError('csv-row');
    const value = Object.fromEntries(EXPECTED_ROW_COLUMNS.map((column, position) => [column, cells[position] ?? '']));
    const k = value['k'] ?? '';
    const paid = value['paid'];
    if (!POSITIVE_INTEGER.test(k) || Number(k) !== index + 1 || (paid !== 'true' && paid !== 'false')) {
      throw new PrivateCompareError('csv-row');
    }
    const components = value['insuranceComponents'] ?? '';
    const parsed = expectedRowSchema.safeParse({
      ...value,
      k: Number(k),
      insuranceComponents: components === '' ? [] : components.split(';'),
      paid: paid === 'true',
    });
    if (!parsed.success) throw new PrivateCompareError('csv-row');
    return parsed.data;
  });
}
