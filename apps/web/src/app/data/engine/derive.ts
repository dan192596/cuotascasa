/**
 * Derived values of spec §9 as small pure functions (W3-12). No signals here: the service wires them.
 */
import {
  type Currency,
  CurrencyMismatchError,
  compareLocalDate,
  type LocalDate,
  type Money,
  moneyAdd,
  percentOf,
  moneySub,
  type ScheduleRow,
  ZERO_MONEY,
} from '@cuotascasa/domain';
import type { CurrencyTotals, PercentString } from '../api.ts';

/** Spec §9 percentPaid: (principal − balance) / principal × 100, HALF_UP to 1 decimal, clamped to 0–100. */
export function percentPaidOf(principal: Money, balance: Money): PercentString {
  const percent = percentOf(moneySub(principal, balance), principal, 1);
  if (percent.startsWith('-')) {
    return '0.0';
  }
  return Number.parseFloat(percent) > 100 ? '100.0' : percent;
}

/** Spec §9 «Cuota actual»: the first row due on or after asOf; null when asOf is after the last one. */
export function currentInstallmentOf(rows: readonly ScheduleRow[], asOf: LocalDate): ScheduleRow | null {
  return rows.find((row) => compareLocalDate(row.dueDate, asOf) >= 0) ?? null;
}

interface AnchorKey {
  readonly id: string;
  readonly k: number;
  readonly date: LocalDate;
}

/** Spec §9 «Estado de validación»: the anchor with the highest k; tie: later date, then greater id. */
export function latestAnchorOf<T extends AnchorKey>(anchors: readonly T[]): T | null {
  let latest: T | null = null;
  for (const anchor of anchors) {
    if (latest === null || isLater(anchor, latest)) {
      latest = anchor;
    }
  }
  return latest;
}

function isLater(candidate: AnchorKey, current: AnchorKey): boolean {
  if (candidate.k !== current.k) {
    return candidate.k > current.k;
  }
  const byDate = compareLocalDate(candidate.date, current.date);
  return byDate !== 0 ? byDate > 0 : candidate.id > current.id;
}

/** Spec §9 «Totales por moneda»: one currency only. Handing it a loan of another currency is a programming error. */
export class CurrencyTotalsAccumulator {
  private readonly currency: Currency;
  private loanCount = 0;
  private balance: Money = ZERO_MONEY;
  private nextInstallmentTotal: Money = ZERO_MONEY;

  constructor(currency: Currency) {
    this.currency = currency;
  }

  add(loanCurrency: Currency, balance: Money, nextInstallmentTotal: Money | null): void {
    if (loanCurrency !== this.currency) {
      throw new CurrencyMismatchError(this.currency, loanCurrency);
    }
    this.loanCount += 1;
    this.balance = moneyAdd(this.balance, balance);
    if (nextInstallmentTotal !== null) {
      this.nextInstallmentTotal = moneyAdd(this.nextInstallmentTotal, nextInstallmentTotal);
    }
  }

  toTotals(): CurrencyTotals {
    return {
      currency: this.currency,
      loanCount: this.loanCount,
      balance: this.balance,
      nextInstallmentTotal: this.nextInstallmentTotal,
    };
  }
}
