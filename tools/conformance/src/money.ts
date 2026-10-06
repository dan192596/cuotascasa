/** Two-decimal money strings as exact integer cents (bigint): the harness compares to the cent, never via `number`. */
const MONEY = /^-?\d+\.\d{2}$/;

/** Cents of a two-decimal string ('1234.56' → 123456n); null when the value is not in that format. */
export function moneyToCents(value: string): bigint | null {
  if (!MONEY.test(value)) return null;
  const cents = BigInt(value.replace('-', '').replace('.', ''));
  return value.startsWith('-') ? -cents : cents;
}

/** Two-decimal string of a cents amount (5n → '0.05', -120n → '-1.20'). */
export function centsToMoney(cents: bigint): string {
  const negative = cents < 0n;
  const digits = (negative ? -cents : cents).toString().padStart(3, '0');
  return `${negative ? '-' : ''}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}
