/**
 * The LoanProjectionService implementation (W3-12): entities → domain → memoized projections (spec §9).
 */
import { computed, type Signal, untracked } from '@angular/core';
import {
  buildPaths,
  compareSchedules,
  CURRENCIES,
  type Currency,
  DomainError,
  type DomainEvent,
  type LoanTerms,
  type LocalDate,
  parseLocalDate,
} from '@cuotascasa/domain';
import type { Clock } from '@cuotascasa/persistence';
import type { Uuid } from '@cuotascasa/schema';
import type {
  CurrencyTotals,
  LoanDraft,
  LoanEventsStore,
  LoanProjection,
  LoanProjectionService,
  LoansStore,
  PaymentsStore,
  RealRecordWrite,
  ReportedBalancesStore,
  ScenarioComparison,
  ScenarioComparisonEntry,
  ScenariosStore,
} from '../api.ts';
import { dryRunRealPath, toScenarioEvents } from './compute-projection.ts';
import { CurrencyTotalsAccumulator } from './derive.ts';
import { LoanProjectionImpl } from './loan-projection.ts';
import { toActualPaymentEvent, toLoanTerms, toRealLoanEvent, toReportedBalanceEvent } from './map-entities.ts';

export interface EngineFacadeDeps {
  readonly loans: LoansStore;
  readonly events: LoanEventsStore;
  readonly balances: ReportedBalancesStore;
  readonly payments: PaymentsStore;
  readonly scenarios: ScenariosStore;
  /** Read on every evaluation of asOf; provideEngineFacade() injects the CLOCK eagerly (W3 close). */
  readonly clock: () => Clock;
}

/** Spec §9 «Proyecciones»: original, real and at most this many scenarios. */
const MAX_COMPARED_SCENARIOS = 3;
/** Id of the record of a dry run that has none yet. */
/** The nil UUID sorts before every UUID, so a draft never wins an id tie-break against a stored record. */
const DRY_RUN_ID = '00000000-0000-0000-0000-000000000000';

export class EngineFacade implements LoanProjectionService {
  readonly asOf: Signal<LocalDate>;
  readonly totalsByCurrency: Signal<readonly CurrencyTotals[]>;
  private readonly deps: EngineFacadeDeps;
  private readonly projections = new Map<Uuid, LoanProjectionImpl>();
  private readonly comparisons = new Map<string, Signal<ScenarioComparison | null>>();

  constructor(deps: EngineFacadeDeps) {
    this.deps = deps;
    this.asOf = computed(() => parseLocalDate(deps.clock().today()));
    this.totalsByCurrency = computed(() => this.sumActiveLoans());
  }

  forLoan(loanId: Uuid): LoanProjection {
    return this.implOf(loanId);
  }

  compareScenarios(loanId: Uuid, scenarioIds: readonly Uuid[]): Signal<ScenarioComparison | null> {
    const ids = [...new Set(scenarioIds)].slice(0, MAX_COMPARED_SCENARIOS);
    const key = `${loanId}|${ids.join(',')}`;
    let comparison = this.comparisons.get(key);
    if (comparison === undefined) {
      comparison = computed(() => this.compare(loanId, ids));
      this.comparisons.set(key, comparison);
    }
    return comparison;
  }

  /**
   * Returns null while the stores load or for an unknown loan. A loan that already has an engine error returns that
   * error for any write. UI maps errors by type or code and never renders `.message`: domain messages contain amounts.
   */
  checkRealWrite(loanId: Uuid, write: RealRecordWrite): DomainError | null {
    const inputs = untracked(this.implOf(loanId).inputs);
    if (inputs === null) {
      return null;
    }
    const replacedId = 'id' in write.record ? write.record.id : null;
    const toEvent = (): DomainEvent => {
      const id = replacedId ?? DRY_RUN_ID;
      switch (write.entity) {
        case 'ReportedBalance':
          return toReportedBalanceEvent({ ...write.record, id });
        case 'ActualPayment':
          return toActualPaymentEvent({ ...write.record, id });
        case 'LoanEvent':
          return toRealLoanEvent({ ...write.record, id } as Parameters<typeof toRealLoanEvent>[0]);
      }
    };
    return dryRunRealPath(inputs.loan, inputs, toEvent, replacedId);
  }

  toLoanTerms(loan: LoanDraft): LoanTerms {
    return toLoanTerms(loan);
  }

  private implOf(loanId: Uuid): LoanProjectionImpl {
    let projection = this.projections.get(loanId);
    if (projection === undefined) {
      const { loans, events, balances, payments, scenarios } = this.deps;
      projection = new LoanProjectionImpl(
        loanId,
        {
          ready: computed(
            () => loans.ready() && events.ready() && balances.ready() && payments.ready() && scenarios.ready(),
          ),
          loan: loans.loan(loanId),
          events: events.listByLoan(loanId),
          balances: balances.listByLoan(loanId),
          payments: payments.listByLoan(loanId),
          scenarios: scenarios.listByLoan(loanId),
          activeScenarioId: scenarios.activeScenarioId(loanId),
        },
        this.asOf,
      );
      this.projections.set(loanId, projection);
    }
    return projection;
  }

  /** Spec §9 «Totales por moneda»: active loans only; a loan whose balance is null is left out. */
  private sumActiveLoans(): readonly CurrencyTotals[] {
    const byCurrency = new Map<Currency, CurrencyTotalsAccumulator>();
    for (const loan of this.deps.loans.loans()) {
      if (loan.status !== 'active' || loan.deletedAt !== null) {
        continue;
      }
      const projection = this.implOf(loan.id);
      const balance = projection.balance();
      if (balance === null) {
        continue;
      }
      let totals = byCurrency.get(loan.currency);
      if (totals === undefined) {
        totals = new CurrencyTotalsAccumulator(loan.currency);
        byCurrency.set(loan.currency, totals);
      }
      totals.add(loan.currency, balance, projection.nextInstallmentTotal());
    }
    return CURRENCIES.flatMap((currency) => byCurrency.get(currency)?.toTotals() ?? []);
  }

  private compare(loanId: Uuid, ids: readonly Uuid[]): ScenarioComparison | null {
    const projection = this.implOf(loanId);
    const computation = projection.computation();
    if (computation?.kind !== 'ok') {
      return null;
    }
    const { terms, realEvents, paths } = computation;
    const scenarios = projection.scenarios();
    const entries: ScenarioComparisonEntry[] = [];
    const failed: { scenarioId: Uuid; error: DomainError }[] = [];
    for (const id of ids) {
      const scenario = scenarios.find((candidate) => candidate.id === id);
      if (scenario === undefined) {
        continue;
      }
      try {
        const scenarioEvents = toScenarioEvents(scenario) ?? [];
        const schedule = buildPaths({ terms, realEvents, scenarioEvents }).scenario;
        if (schedule !== null) {
          entries.push({
            scenarioId: id,
            name: scenario.name,
            schedule,
            metrics: compareSchedules(paths.real, schedule),
          });
        }
      } catch (error) {
        if (!(error instanceof DomainError)) {
          throw error;
        }
        failed.push({ scenarioId: id, error });
      }
    }
    return { original: paths.original, real: paths.real, scenarios: entries, failed };
  }
}
