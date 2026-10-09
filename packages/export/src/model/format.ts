import type { Currency, LocalDate } from '@cuotascasa/domain';

/** `AAAA-MM-DD` → `dd/mm/aaaa` (formato de fechas del producto). */
export function formatLocalDate(date: LocalDate): string {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

/** Rótulo de moneda para encabezados y títulos. */
export function currencyLabelOf(currency: Currency): string {
  return currency === 'USD' ? 'US$' : 'Q';
}
