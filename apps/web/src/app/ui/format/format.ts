import {
  CURRENCIES,
  type Currency,
  InvalidInputError,
  type LocalDate,
  localDateParts,
  type Money,
  moneyIsNegative,
  parseLocalDate,
  parseMoney,
  parseRate,
  type Rate,
} from '@cuotascasa/domain';

const SYMBOLS: Readonly<Record<Currency, string>> = { GTQ: 'Q', USD: 'US$' };

/** Inserts a comma every three digits of an unsigned integer string ('1234567' → '1,234,567'). */
export function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+$)/g, ',');
}

/**
 * Decimal money string → 'Q 1,234.56' / 'US$ 1,234.56'. Pure string work: the amount never becomes a JS number.
 * Negatives put the sign before the symbol ('-Q 1,234.50'); zero never carries a sign.
 */
export function formatMoney(value: string, currency: Currency): string {
  if (!CURRENCIES.includes(currency)) {
    throw new InvalidInputError('INVALID_MONEY', 'Unknown currency');
  }
  const canonical: Money = parseMoney(value);
  const negative = moneyIsNegative(canonical);
  const [whole = '0', cents = '00'] = canonical.replace('-', '').split('.');
  return `${negative ? '-' : ''}${SYMBOLS[currency]} ${groupThousands(whole)}.${cents}`;
}

/** Plain grouped amount without symbol ('1234.5' → '1,234.50'); used to show a stored value inside an input. */
export function formatMoneyPlain(value: string): string {
  const canonical: Money = parseMoney(value);
  const [whole = '0', cents = '00'] = canonical.replace('-', '').split('.');
  return `${moneyIsNegative(canonical) ? '-' : ''}${groupThousands(whole)}.${cents}`;
}

/** 'AAAA-MM-DD' → 'dd/mm/aaaa'. */
export function formatLocalDate(value: string): string {
  const date: LocalDate = parseLocalDate(value);
  const { year, month, day } = localDateParts(date);
  const pad = (part: number, width: number) => String(part).padStart(width, '0');
  return `${pad(day, 2)}/${pad(month, 2)}/${pad(year, 4)}`;
}

/**
 * Exact decimal-point shift of a rate string by two places, by digit manipulation only ('0.0126' → '1.26',
 * '0.00583333' → '0.583333'). Trailing zeros of the fraction are dropped. Never routes through a JS number.
 */
export function shiftRateToPercent(rate: string): string {
  const [whole = '0', fraction = ''] = parseRate(rate as Rate).split('.');
  const digits = fraction.padEnd(2, '0');
  const integer = `${whole}${digits.slice(0, 2)}`.replace(/^0+(?=\d)/, '');
  const decimals = digits.slice(2).replace(/0+$/, '');
  return decimals === '' ? integer : `${integer}.${decimals}`;
}

/** Stored fraction → percent text with at least 2 decimals and no symbol ('0.0126' → '1.26', '0.07' → '7.00'). */
export function formatPercent(rate: string): string {
  const [whole = '0', fraction = ''] = shiftRateToPercent(rate).split('.');
  return `${whole}.${fraction.padEnd(2, '0')}`;
}
