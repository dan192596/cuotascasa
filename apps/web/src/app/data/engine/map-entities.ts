/**
 * Entity → domain mapping of the engine facade (W3-12, spec §9). Pure functions: strings are parsed into the domain's
 * branded types by the domain's own parsers, so a malformed record surfaces as the domain's InvalidInputError.
 * Drafts (no id, no stamps) map like stored records, which is what the wizard preview and the dry run need.
 */
import {
  type ActualPaymentEvent,
  assertFirstDueDateConsistent,
  type Commission,
  compareMoney,
  CURRENCIES,
  type DomainEvent,
  type FixedCharge,
  type HypotheticalEvent,
  InvalidInputError,
  type LoanTerms,
  parseLocalDate,
  parseMoney,
  parsePaymentDay,
  parseRate,
  RATE_TYPES,
  type RateChangeEvent,
  type ReportedBalanceEvent,
  ROUNDING_PROFILES,
  ZERO_MONEY,
} from '@cuotascasa/domain';
import type { ScenarioEvent } from '@cuotascasa/schema';
import type { ActualPaymentUpdate, LoanDraft, LoanEventUpdate, ReportedBalanceUpdate } from '../api.ts';

/** [ALG.TERMS] The loan (or an unsaved draft) as validated domain conditions. Throws InvalidInputError. */
export function toLoanTerms(loan: LoanDraft): LoanTerms {
  const principal = parseMoney(loan.principal);
  if (compareMoney(principal, ZERO_MONEY) <= 0) {
    throw new InvalidInputError('INVALID_TERMS', 'principal must be greater than zero');
  }
  if (!Number.isSafeInteger(loan.termMonths) || loan.termMonths < 1) {
    throw new InvalidInputError('INVALID_TERMS', 'termMonths must be an integer >= 1');
  }
  if (!CURRENCIES.includes(loan.currency)) {
    throw new InvalidInputError('INVALID_TERMS', 'currency must be GTQ or USD');
  }
  if (!ROUNDING_PROFILES.includes(loan.roundingProfile)) {
    throw new InvalidInputError('INVALID_TERMS', 'roundingProfile must be FHA_GT_V1 or SIMPLE');
  }
  if (!RATE_TYPES.includes(loan.rateType)) {
    throw new InvalidInputError('INVALID_TERMS', 'rateType must be FIXED or VARIABLE');
  }
  const paymentDay = parsePaymentDay(loan.paymentDay);
  const firstDueDate = parseLocalDate(loan.firstDueDate);
  assertFirstDueDateConsistent(firstDueDate, paymentDay);
  const fixedCharges: FixedCharge[] = loan.fixedCharges.map((charge) => ({
    label: charge.label,
    amount: parseMoney(charge.amount),
    effectiveFrom: parseLocalDate(charge.effectiveFrom),
  }));
  return {
    principal,
    termMonths: loan.termMonths,
    disbursementDate: parseLocalDate(loan.disbursementDate),
    firstDueDate,
    paymentDay,
    currency: loan.currency,
    interestRate: parseRate(loan.interestRate),
    insuranceRates: loan.insuranceRates.map((value) => parseRate(value)),
    fixedCharges,
    roundingProfile: loan.roundingProfile,
    rateType: loan.rateType,
  };
}

/** [ALG.ANCHOR] A ReportedBalance as the domain anchor. `reportedRate` and `totalInstallment` are informative. */
export function toReportedBalanceEvent(balance: ReportedBalanceUpdate): ReportedBalanceEvent {
  return {
    type: 'ReportedBalance',
    id: balance.id,
    date: parseLocalDate(balance.date),
    balance: parseMoney(balance.balance),
    ...(balance.installmentNumber === undefined ? {} : { installmentNumber: balance.installmentNumber }),
    ...(balance.reportedRate === undefined ? {} : { reportedRate: parseRate(balance.reportedRate) }),
    ...(balance.totalInstallment === undefined ? {} : { totalInstallment: parseMoney(balance.totalInstallment) }),
  };
}

/** [ALG.ACTUAL] An ActualPayment as the domain event: `paidDate` is the event date. */
export function toActualPaymentEvent(payment: ActualPaymentUpdate): ActualPaymentEvent {
  const { breakdown } = payment;
  return {
    type: 'ActualPayment',
    id: payment.id,
    date: parseLocalDate(payment.paidDate),
    installmentNumber: payment.installmentNumber,
    total: parseMoney(payment.total),
    ...(breakdown === undefined
      ? {}
      : {
          breakdown: {
            capital: parseMoney(breakdown.capital),
            interest: parseMoney(breakdown.interest),
            insurance: parseMoney(breakdown.insurance),
            fixedCharges: parseMoney(breakdown.fixedCharges),
          },
        }),
  };
}

function toCommission(
  commission: { readonly kind: 'FLAT'; readonly amount: string } | { readonly kind: 'PERCENT'; readonly rate: string },
): Commission {
  return commission.kind === 'FLAT'
    ? { kind: 'FLAT', amount: parseMoney(commission.amount) }
    : { kind: 'PERCENT', rate: parseRate(commission.rate) };
}

function toRateChange(event: Extract<LoanEventUpdate | ScenarioEvent, { type: 'RateChange' }>): RateChangeEvent {
  const base = {
    type: 'RateChange' as const,
    id: event.id,
    date: parseLocalDate(event.date),
    ...(event.interestRate === undefined ? {} : { interestRate: parseRate(event.interestRate) }),
    ...(event.insuranceRates === undefined
      ? {}
      : { insuranceRates: event.insuranceRates.map((value) => parseRate(value)) }),
  };
  if (event.policy !== 'BANK_INSTALLMENT') {
    return { ...base, policy: event.policy };
  }
  if (event.bankInstallment === undefined) {
    throw new InvalidInputError('INVALID_EVENT', 'BANK_INSTALLMENT requires bankInstallment', { eventId: event.id });
  }
  return { ...base, policy: event.policy, bankInstallment: parseMoney(event.bankInstallment) };
}

/**
 * A real LoanEvent or a Scenario event as a hypothetical-capable domain event. `deletedAt` and `note` of a scenario
 * event are not carried: the caller filters tombstones first.
 */
export function toHypotheticalEvent(event: LoanEventUpdate | ScenarioEvent): HypotheticalEvent {
  switch (event.type) {
    case 'RateChange':
      return toRateChange(event);
    case 'FixedChargeChange':
      return {
        type: 'FixedChargeChange',
        id: event.id,
        date: parseLocalDate(event.date),
        fixedCharges: event.fixedCharges.map((charge) => ({ label: charge.label, amount: parseMoney(charge.amount) })),
      };
    case 'Prepayment':
      return {
        type: 'Prepayment',
        id: event.id,
        date: parseLocalDate(event.date),
        amount: parseMoney(event.amount),
        mode: event.mode,
        ...(event.commission === undefined ? {} : { commission: toCommission(event.commission) }),
      };
    case 'AdvanceInstallments':
      return { type: 'AdvanceInstallments', id: event.id, date: parseLocalDate(event.date), count: event.count };
  }
}

/** A real LoanEvent (or its next version) as a domain event. */
export function toRealLoanEvent(event: LoanEventUpdate): DomainEvent {
  return toHypotheticalEvent(event);
}
