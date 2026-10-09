/**
 * Memoized projection of one loan (W3-12, spec §9). Every member is a `computed` over the stores' signals, so it
 * recomputes only when an input of this loan changes. Engine errors never throw: they surface in `error`.
 */
import { computed, type Signal } from '@angular/core';
import {
  compareSchedules,
  type ComponentRealDelta,
  type DomainError,
  type LocalDate,
  type Money,
  type Paths,
  type ScheduleRow,
  validateAgainstReportedBalance,
  yearlySubtotals,
  ZERO_MONEY,
  compareLocalDate,
} from '@cuotascasa/domain';
import type { ActualPayment, Loan, LoanEvent, ReportedBalance, Scenario, Uuid } from '@cuotascasa/schema';
import type {
  AnchorDelta,
  LoanMetrics,
  LoanProjection,
  LoanValidation,
  PathYearlySubtotals,
  PercentString,
} from '../api.ts';
import { type Computation, computeProjection, type ProjectionInputs } from './compute-projection.ts';
import { currentInstallmentOf, percentPaidOf } from './derive.ts';

/** The store signals one projection reads. */
export interface ProjectionSources {
  readonly ready: Signal<boolean>;
  readonly loan: Signal<Loan | undefined>;
  readonly events: Signal<readonly LoanEvent[]>;
  readonly balances: Signal<readonly ReportedBalance[]>;
  readonly payments: Signal<readonly ActualPayment[]>;
  readonly scenarios: Signal<readonly Scenario[]>;
  readonly activeScenarioId: Signal<Uuid | null>;
}

const UNVALIDATED: LoanValidation = {
  status: 'UNVALIDATED',
  reportedBalanceId: null,
  k: null,
  realDelta: null,
  cause: null,
};
const NO_PAID: ReadonlySet<number> = new Set();
const NO_ANCHORS: readonly AnchorDelta[] = [];
const NO_COMPONENTS: readonly ComponentRealDelta[] = [];

/** Same elements in the same order: the real stores may hand out a fresh array when an unrelated loan changes. */
function sameElements<T>(a: readonly T[], b: readonly T[]): boolean {
  return a === b || (a.length === b.length && a.every((item, index) => item === b[index]));
}

function live<T extends { readonly deletedAt: string | null }>(records: readonly T[]): readonly T[] {
  return records.filter((record) => record.deletedAt === null);
}

export class LoanProjectionImpl implements LoanProjection {
  readonly loanId: Uuid;
  /** The non-deleted records of this loan, or null while loading or when the store does not know the loan. */
  readonly inputs: Signal<ProjectionInputs | null>;
  readonly scenarios: Signal<readonly Scenario[]>;
  readonly computation: Signal<Computation | null>;
  readonly error: Signal<DomainError | null>;
  readonly paths: Signal<Paths | null>;
  readonly metrics: Signal<LoanMetrics | null>;
  readonly yearlySubtotals: Signal<PathYearlySubtotals | null>;
  readonly asOf: Signal<LocalDate>;
  readonly currentInstallment: Signal<ScheduleRow | null>;
  readonly balance: Signal<Money | null>;
  readonly percentPaid: Signal<PercentString | null>;
  readonly nextInstallmentTotal: Signal<Money | null>;
  readonly realEndDate: Signal<LocalDate | null>;
  readonly activeScenarioEndDate: Signal<LocalDate | null>;
  readonly validation: Signal<LoanValidation>;
  readonly suggestedPaid: Signal<boolean>;
  readonly cutoffK: Signal<number>;
  readonly paidInstallments: Signal<ReadonlySet<number>>;
  readonly realDeltaPerAnchor: Signal<readonly AnchorDelta[]>;
  readonly realDeltaPerComponent: Signal<readonly ComponentRealDelta[]>;

  constructor(loanId: Uuid, sources: ProjectionSources, asOf: Signal<LocalDate>) {
    this.loanId = loanId;
    this.asOf = asOf;
    const equal = sameElements;
    const events = computed(() => live(sources.events()), { equal });
    const balances = computed(() => live(sources.balances()), { equal });
    const payments = computed(() => live(sources.payments()), { equal });
    this.scenarios = computed(() => live(sources.scenarios()), { equal });
    const scenario = computed(() => {
      const id = sources.activeScenarioId();
      return id === null ? null : (this.scenarios().find((candidate) => candidate.id === id) ?? null);
    });
    const loan = computed(() => {
      const found = sources.ready() ? sources.loan() : undefined;
      return found !== undefined && found.deletedAt === null ? found : undefined;
    });
    this.inputs = computed(() => {
      const current = loan();
      return current === undefined
        ? null
        : { loan: current, events: events(), balances: balances(), payments: payments(), scenario: scenario() };
    });
    this.computation = computed(() => {
      const current = this.inputs();
      return current === null ? null : computeProjection(current);
    });

    const okOf = (): Extract<Computation, { kind: 'ok' }> | null => {
      const current = this.computation();
      return current?.kind === 'ok' ? current : null;
    };
    this.error = computed(() => {
      const current = this.computation();
      if (current === null) {
        return null;
      }
      return current.kind === 'failed' ? current.error : current.scenarioError;
    });
    this.paths = computed(() => okOf()?.paths ?? null);
    this.metrics = computed(() => {
      const paths = this.paths();
      return paths === null
        ? null
        : {
            realVsOriginal: compareSchedules(paths.original, paths.real),
            activeScenarioVsReal: paths.scenario === null ? null : compareSchedules(paths.real, paths.scenario),
          };
    });
    this.yearlySubtotals = computed(() => {
      const paths = this.paths();
      return paths === null
        ? null
        : {
            original: yearlySubtotals(paths.original),
            real: yearlySubtotals(paths.real),
            scenario: paths.scenario === null ? null : yearlySubtotals(paths.scenario),
          };
    });
    this.currentInstallment = computed(() => {
      const paths = this.paths();
      return paths === null ? null : currentInstallmentOf(paths.real.rows, this.asOf());
    });
    this.balance = computed(() => (this.paths() === null ? null : (this.currentInstallment()?.opening ?? ZERO_MONEY)));
    this.percentPaid = computed(() => {
      const current = okOf();
      const balance = this.balance();
      return current === null || balance === null ? null : percentPaidOf(current.terms.principal, balance);
    });
    this.nextInstallmentTotal = computed(() => this.currentInstallment()?.total ?? null);
    this.realEndDate = computed(() => this.paths()?.real.endDate ?? null);
    this.activeScenarioEndDate = computed(() => this.paths()?.scenario?.endDate ?? null);
    this.validation = computed(() => {
      const latest = okOf()?.latestAnchor ?? null;
      return latest === null
        ? UNVALIDATED
        : {
            status: latest.result.status,
            reportedBalanceId: latest.event.id,
            k: latest.result.k,
            realDelta: latest.result.realDelta,
            cause: latest.result.cause,
          };
    });
    this.suggestedPaid = computed(() => {
      const current = okOf();
      if (current === null) {
        return false;
      }
      return (
        compareLocalDate(this.asOf(), current.paths.real.endDate) > 0 ||
        current.latestAnchor?.event.balance === ZERO_MONEY
      );
    });
    this.cutoffK = computed(() => this.paths()?.cutoffK ?? 0);
    this.paidInstallments = computed(() => {
      const paths = this.paths();
      return paths === null ? NO_PAID : new Set(paths.real.rows.filter((row) => row.paid).map((row) => row.k));
    });
    this.realDeltaPerAnchor = computed(() => {
      const current = okOf();
      if (current === null) {
        return NO_ANCHORS;
      }
      // buildPaths already accepted every anchor, so validating each one against its own k cannot raise.
      return current.paths.realDelta.perAnchor.map((delta) => {
        const result = validateAgainstReportedBalance({
          terms: current.terms,
          realEvents: current.realEvents,
          reported: current.anchorsById.get(delta.eventId)!,
        });
        return { ...delta, status: result.status, cause: result.cause };
      });
    });
    this.realDeltaPerComponent = computed(() => okOf()?.paths.realDelta.perComponent ?? NO_COMPONENTS);
  }
}
