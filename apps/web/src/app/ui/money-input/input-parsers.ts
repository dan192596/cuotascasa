import { isLocalDate, moneyIsZero, parseLocalDate, parseMoney, percentToRate, ZERO_MONEY } from '@cuotascasa/domain';

/** Result shape that `transformedValue` expects from `parse`. */
export type TextParseResult = { readonly value: string } | { readonly error: { kind: string; message: string } };

export const MONEY_NOT_NUMBER_MESSAGE = 'Escribe solo números y punto decimal, sin letras. Ejemplo: 1,234.56.';
export const MONEY_DECIMALS_MESSAGE = 'Usa como máximo 2 decimales.';
export const DATE_FORMAT_MESSAGE = 'Escribe la fecha como dd/mm/aaaa.';
export const DATE_INVALID_MESSAGE = 'Esa fecha no existe en el calendario.';
export const RATE_NOT_NUMBER_MESSAGE = 'Escribe la tasa solo con números y punto decimal, sin letras. Ejemplo: 7.25.';
export const RATE_DECIMALS_MESSAGE = 'Usa como máximo 4 decimales.';
export const RATE_NEGATIVE_MESSAGE = 'La tasa no puede ser negativa.';

function fail(kind: string, message: string): TextParseResult {
  return { error: { kind, message } };
}

const MONEY_PREFIX = /^(?:US\$|Q)\s*/i;
/** Digits with optional thousands commas (each group of exactly 3) and an optional fraction of any length. */
const GROUPED_OR_PLAIN = /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?$/;

/**
 * Text typed by the user → canonical `Money` string. Accepts '1,234.56', 'Q1234.5', 'US$ 99' and '1234'; the amount
 * is validated and normalized by the domain's `parseMoney`, never converted through a JS number. '' means empty.
 */
export function parseMoneyText(text: string): TextParseResult {
  let rest = text.trim();
  if (rest === '') {
    return { value: '' };
  }
  const negative = rest.startsWith('-');
  if (negative) {
    rest = rest.slice(1).trimStart();
  }
  rest = rest.replace(MONEY_PREFIX, '');
  const match = GROUPED_OR_PLAIN.exec(rest);
  if (match === null) {
    return fail('money-not-number', MONEY_NOT_NUMBER_MESSAGE);
  }
  if ((match[1] ?? '').length > 2) {
    return fail('money-decimals', MONEY_DECIMALS_MESSAGE);
  }
  const amount = parseMoney(`${negative ? '-' : ''}${rest.replaceAll(',', '')}`);
  return { value: moneyIsZero(amount) ? ZERO_MONEY : amount };
}

const DATE_TEXT = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/** 'dd/mm/aaaa' typed by the user → `LocalDate` ('AAAA-MM-DD'), validated against the real calendar by the domain. */
export function parseDateText(text: string): TextParseResult {
  const trimmed = text.trim();
  if (trimmed === '') {
    return { value: '' };
  }
  const match = DATE_TEXT.exec(trimmed);
  if (match === null) {
    return fail('date-format', DATE_FORMAT_MESSAGE);
  }
  const [, day = '', month = '', year = ''] = match;
  const candidate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  return isLocalDate(candidate) ? { value: parseLocalDate(candidate) } : fail('date-invalid', DATE_INVALID_MESSAGE);
}

const PERCENT_TEXT = /^(\d+)(?:\.(\d+))?$/;

/** Percent typed by the user ('7.25', '7 %') → fraction string by exact decimal shift ('0.0725'). */
export function parseRateText(text: string): TextParseResult {
  let rest = text.trim();
  if (rest === '') {
    return { value: '' };
  }
  rest = rest.replace(/\s*%$/, '');
  const negative = rest.startsWith('-');
  const match = PERCENT_TEXT.exec(negative ? rest.slice(1) : rest);
  if (match === null) {
    return fail('rate-not-number', RATE_NOT_NUMBER_MESSAGE);
  }
  if (negative) {
    return fail('rate-negative', RATE_NEGATIVE_MESSAGE);
  }
  if ((match[2] ?? '').length > 4) {
    return fail('rate-decimals', RATE_DECIMALS_MESSAGE);
  }
  return { value: percentToRate(rest) };
}
