/**
 * The engine computation of one loan (W3-12): entities → domain → buildPaths + validation of the latest anchor.
 * Pure: no signals. A DomainError becomes data; anything else is a programming error and keeps propagating.
 */
import {
  buildPaths,
  DomainError,
  type DomainEvent,
  type LoanTerms,
  type Paths,
  type ReportedBalanceEvent,
  type TemplateValidationResult,
  validateAgainstReportedBalance,
} from '@cuotascasa/domain';
import type { ActualPayment, Loan, LoanEvent, ReportedBalance, Scenario } from '@cuotascasa/schema';
import { latestAnchorOf } from './derive.ts';
import {
  toActualPaymentEvent,
  toHypotheticalEvent,
  toLoanTerms,
  toRealLoanEvent,
  toReportedBalanceEvent,
} from './map-entities.ts';

/** The non-deleted records one loan's computation reads. */
export interface ProjectionInputs {
  readonly loan: Loan;
  readonly events: readonly LoanEvent[];
  readonly balances: readonly ReportedBalance[];
  readonly payments: readonly ActualPayment[];
  /** The active scenario, or null. */
  readonly scenario: Scenario | null;
}

/** The latest reported balance and its [ALG.VALIDATE] result. */
export interface LatestAnchor {
  readonly event: ReportedBalanceEvent;
  /** Null when the [ALG.VALIDATE] modeled path itself fails (a validation-only gap): UNVALIDATED, no cause. */
  readonly result: TemplateValidationResult | null;
}

export type Computation =
  | { readonly kind: 'failed'; readonly error: DomainError }
  | {
      readonly kind: 'ok';
      readonly terms: LoanTerms;
      readonly realEvents: readonly DomainEvent[];
      readonly paths: Paths;
      /** An error caused only by the active scenario: paths then hold original and real with scenario = null. */
      readonly scenarioError: DomainError | null;
      readonly anchorsById: ReadonlyMap<string, ReportedBalanceEvent>;
      readonly latestAnchor: LatestAnchor | null;
    };

/** Real events of a loan in domain form (anchors, payments, rate, charge, prepayment and advance events). */
export function toRealEvents(
  balances: readonly ReportedBalance[],
  payments: readonly ActualPayment[],
  events: readonly LoanEvent[],
): DomainEvent[] {
  return [
    ...balances.map(toReportedBalanceEvent),
    ...payments.map(toActualPaymentEvent),
    ...events.map(toRealLoanEvent),
  ];
}

/** The live (not deleted) hypothetical events of a scenario in domain form; null when it has none. */
export function toScenarioEvents(scenario: Scenario | null) {
  const live = scenario?.events.filter((event) => event.deletedAt === null) ?? [];
  return live.length === 0 ? null : live.map(toHypotheticalEvent);
}

/**
 * [ALG.VALIDATE] for one anchor. The modeled path keeps every later real event and can fail even when buildPaths
 * succeeded; that case yields null (UNVALIDATED) and never an error of the loan.
 */
export function validateAnchor(
  terms: LoanTerms,
  realEvents: readonly DomainEvent[],
  reported: ReportedBalanceEvent,
): TemplateValidationResult | null {
  try {
    return validateAgainstReportedBalance({ terms, realEvents, reported });
  } catch (error) {
    if (error instanceof DomainError) {
      return null;
    }
    throw error;
  }
}

function latestAnchorResult(
  terms: LoanTerms,
  realEvents: readonly DomainEvent[],
  paths: Paths,
  anchorsById: ReadonlyMap<string, ReportedBalanceEvent>,
): LatestAnchor | null {
  const keyed = paths.realDelta.perAnchor.map((delta) => ({
    id: delta.eventId,
    k: delta.k,
    date: (anchorsById.get(delta.eventId) as ReportedBalanceEvent).date,
  }));
  const latest = latestAnchorOf(keyed);
  if (latest === null) {
    return null;
  }
  const event = anchorsById.get(latest.id) as ReportedBalanceEvent;
  return { event, result: validateAnchor(terms, realEvents, event) };
}

/** [ALG.PATHS] with the D27 split between «the scenario failed» and «the loan failed». */
export function computeProjection(inputs: ProjectionInputs): Computation {
  try {
    const terms = toLoanTerms(inputs.loan);
    const realEvents = toRealEvents(inputs.balances, inputs.payments, inputs.events);
    let scenarioError: DomainError | null = null;
    let paths: Paths | null = null;
    if (inputs.scenario !== null) {
      try {
        const scenarioEvents = toScenarioEvents(inputs.scenario);
        if (scenarioEvents !== null) {
          paths = buildPaths({ terms, realEvents, scenarioEvents });
        }
      } catch (error) {
        if (!(error instanceof DomainError)) {
          throw error;
        }
        scenarioError = error;
      }
    }
    paths ??= buildPaths({ terms, realEvents, scenarioEvents: null });
    const anchorsById = new Map(
      realEvents
        .filter((event): event is ReportedBalanceEvent => event.type === 'ReportedBalance')
        .map((e) => [e.id, e]),
    );
    return {
      kind: 'ok',
      terms,
      realEvents,
      paths,
      scenarioError,
      anchorsById,
      latestAnchor: latestAnchorResult(terms, realEvents, paths, anchorsById),
    };
  } catch (error) {
    if (error instanceof DomainError) {
      return { kind: 'failed', error };
    }
    throw error;
  }
}

/** Dry run of a real path: the typed error `buildPaths` raises for these records, or null. Never schedules a scenario. */
export function dryRunRealPath(
  loan: Loan,
  records: { balances: readonly ReportedBalance[]; payments: readonly ActualPayment[]; events: readonly LoanEvent[] },
  extra: () => DomainEvent,
  replacedId: string | null,
): DomainError | null {
  try {
    const terms = toLoanTerms(loan);
    const kept = toRealEvents(records.balances, records.payments, records.events).filter((e) => e.id !== replacedId);
    buildPaths({ terms, realEvents: [...kept, extra()], scenarioEvents: null });
    return null;
  } catch (error) {
    if (error instanceof DomainError) {
      return error;
    }
    throw error;
  }
}
