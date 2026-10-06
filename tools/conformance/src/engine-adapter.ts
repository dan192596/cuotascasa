/**
 * Bridge between the oracle fixture contract (@cuotascasa/schema, tools/oracle/FORMAT.md) and the public engine API
 * (@cuotascasa/domain). It renames the one field where the two frozen contracts differ (ActualPayment.paidDate → date)
 * and brands every value through the domain parsers. Opus-frozen (W0-06).
 */
import { buildPaths, buildSchedule, parseLocalDate, parseMoney, parsePaymentDay, parseRate } from '@cuotascasa/domain';
import type {
  Commission,
  DomainEvent,
  LoanTerms,
  Paths,
  PathsInput,
  RateChangeEvent,
  Schedule,
  ScheduleRow,
} from '@cuotascasa/domain';
import type {
  ExpectedAnchor,
  ExpectedPayment,
  ExpectedRow,
  ExpectedSummary,
  FixtureEvent,
  FixtureInputs,
  FixtureTerms,
} from '@cuotascasa/schema';

/** What the engine computed for a fixture, in the shape of `fixture.expected`. */
export interface ComputedFixtureResult {
  readonly rows: readonly ExpectedRow[];
  readonly anchors: readonly ExpectedAnchor[];
  readonly payments: readonly ExpectedPayment[];
  readonly summary: ExpectedSummary;
}

/** Runs one fixture's inputs through an engine. */
export type FixtureEngine = (inputs: FixtureInputs) => ComputedFixtureResult;

/** The two public entry points the harness calls. */
export interface PublicEngineApi {
  readonly buildSchedule: (terms: LoanTerms, events: readonly DomainEvent[]) => Schedule;
  readonly buildPaths: (input: PathsInput) => Paths;
}

/** The real public API of @cuotascasa/domain (the default engine). */
export const PUBLIC_ENGINE_API: PublicEngineApi = { buildSchedule, buildPaths };

export function toLoanTerms(terms: FixtureTerms): LoanTerms {
  return {
    principal: parseMoney(terms.principal),
    termMonths: terms.termMonths,
    disbursementDate: parseLocalDate(terms.disbursementDate),
    firstDueDate: parseLocalDate(terms.firstDueDate),
    paymentDay: parsePaymentDay(terms.paymentDay),
    currency: terms.currency,
    interestRate: parseRate(terms.interestRate),
    insuranceRates: terms.insuranceRates.map((rate) => parseRate(rate)),
    fixedCharges: terms.fixedCharges.map((charge) => ({
      label: charge.label,
      amount: parseMoney(charge.amount),
      effectiveFrom: parseLocalDate(charge.effectiveFrom),
    })),
    roundingProfile: terms.roundingProfile,
    // [ALG.TERMS]: informative only, the engine ignores it; fixtures do not carry it.
    rateType: 'FIXED',
  };
}

function toCommission(commission: { kind: 'FLAT'; amount: string } | { kind: 'PERCENT'; rate: string }): Commission {
  return commission.kind === 'FLAT'
    ? { kind: 'FLAT', amount: parseMoney(commission.amount) }
    : { kind: 'PERCENT', rate: parseRate(commission.rate) };
}

function toRateChange(event: Extract<FixtureEvent, { type: 'RateChange' }>): RateChangeEvent {
  const base = {
    type: 'RateChange' as const,
    id: event.id,
    date: parseLocalDate(event.date),
    ...(event.interestRate === undefined ? {} : { interestRate: parseRate(event.interestRate) }),
    ...(event.insuranceRates === undefined
      ? {}
      : { insuranceRates: event.insuranceRates.map((rate) => parseRate(rate)) }),
  };
  return event.policy === 'BANK_INSTALLMENT'
    ? { ...base, policy: 'BANK_INSTALLMENT', bankInstallment: parseMoney(event.bankInstallment) }
    : { ...base, policy: event.policy };
}

export function toDomainEvent(event: FixtureEvent): DomainEvent {
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
    case 'ReportedBalance':
      return {
        type: 'ReportedBalance',
        id: event.id,
        date: parseLocalDate(event.date),
        balance: parseMoney(event.balance),
        ...(event.installmentNumber === undefined ? {} : { installmentNumber: event.installmentNumber }),
      };
    case 'ActualPayment':
      return {
        type: 'ActualPayment',
        id: event.id,
        date: parseLocalDate(event.paidDate),
        installmentNumber: event.installmentNumber,
        total: parseMoney(event.total),
        ...(event.breakdown === undefined
          ? {}
          : {
              breakdown: {
                capital: parseMoney(event.breakdown.capital),
                interest: parseMoney(event.breakdown.interest),
                insurance: parseMoney(event.breakdown.insurance),
                fixedCharges: parseMoney(event.breakdown.fixedCharges),
              },
            }),
      };
  }
}

/** A schedule row as a fixture row, with the keys in EXPECTED_ROW_COLUMNS order. */
export function toExpectedRow(row: ScheduleRow): ExpectedRow {
  return {
    k: row.k,
    dueDate: row.dueDate,
    opening: row.opening,
    level: row.level,
    interest: row.interest,
    insurance: row.insurance,
    insuranceComponents: [...row.insuranceComponents],
    capital: row.capital,
    fixedCharges: row.fixedCharges,
    prepayment: row.prepayment,
    commission: row.commission,
    total: row.total,
    closing: row.closing,
    paid: row.paid,
  };
}

export function toExpectedSummary(schedule: Schedule): ExpectedSummary {
  return {
    installments: schedule.installmentCount,
    endDate: schedule.endDate,
    totalInterest: schedule.totals.interest,
    totalInsurance: schedule.totals.insurance,
    totalCapital: schedule.totals.capital,
    totalFixedCharges: schedule.totals.fixedCharges,
    totalPrepayments: schedule.totals.prepayments,
    totalCommissions: schedule.totals.commissions,
    totalPaid: schedule.totals.totalPaid,
  };
}

/**
 * The engine the harness and private-compare run. Fixtures without ReportedBalance or ActualPayment use buildSchedule
 * only (so 'core' conformance needs W1-01 and nothing else); the others use buildPaths for the anchors and payments.
 */
export function createPublicEngine(api: PublicEngineApi = PUBLIC_ENGINE_API): FixtureEngine {
  return (inputs) => {
    const terms = toLoanTerms(inputs.terms);
    const events = inputs.events.map(toDomainEvent);
    const needsPaths = inputs.events.some(
      (event) => event.type === 'ReportedBalance' || event.type === 'ActualPayment',
    );
    if (!needsPaths) {
      const schedule = api.buildSchedule(terms, events);
      return {
        rows: schedule.rows.map(toExpectedRow),
        anchors: [],
        payments: [],
        summary: toExpectedSummary(schedule),
      };
    }
    const paths = api.buildPaths({ terms, realEvents: events, scenarioEvents: null });
    const anchorIds = inputs.events.filter((event) => event.type === 'ReportedBalance').map((event) => event.id);
    const anchors = [
      ...anchorIds.flatMap((id) => paths.realDelta.perAnchor.filter((anchor) => anchor.eventId === id)),
      ...paths.realDelta.perAnchor.filter((anchor) => !anchorIds.includes(anchor.eventId)),
    ].map((anchor) => ({ eventId: anchor.eventId, k: anchor.k, realDelta: anchor.realDelta }));
    const payments = inputs.events.flatMap((event) => {
      if (event.type !== 'ActualPayment') return [];
      const delta = paths.realDelta.perComponent.find((component) => component.eventId === event.id);
      return [
        {
          eventId: event.id,
          k: delta?.k ?? event.installmentNumber,
          componentDeltas:
            delta === undefined
              ? null
              : {
                  capital: delta.capital,
                  interest: delta.interest,
                  insurance: delta.insurance,
                  fixedCharges: delta.fixedCharges,
                },
        },
      ];
    });
    return { rows: paths.real.rows.map(toExpectedRow), anchors, payments, summary: toExpectedSummary(paths.real) };
  };
}
