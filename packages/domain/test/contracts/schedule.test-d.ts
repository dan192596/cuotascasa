import { describe, expectTypeOf, it } from 'vitest';
import type { DomainEvent, HypotheticalEvent, ReportedBalanceEvent } from '../../src/types/events.ts';
import type { LoanTerms } from '../../src/types/loan.ts';
import type { Currency, LocalDate, Money, RoundingProfile } from '../../src/types/primitives.ts';
import type {
  AnchorRealDelta,
  ComparisonMetrics,
  ComponentRealDelta,
  DeltaCause,
  GoalSeekRequest,
  GoalSeekResult,
  InfeasibleReason,
  PathKind,
  Paths,
  PathsInput,
  RealDelta,
  Schedule,
  ScheduleRow,
  ScheduleRun,
  ScheduleTotals,
  TemplateValidationRequest,
  TemplateValidationResult,
  TrafficLight,
  ValidationStatus,
  YearlySubtotal,
} from '../../src/types/schedule.ts';

describe('schedules, paths and results (contract)', () => {
  it('ScheduleRow exposes a paid flag per row ([ALG.ACTUAL])', () => {
    expectTypeOf<keyof ScheduleRow>().toEqualTypeOf<
      | 'k'
      | 'dueDate'
      | 'opening'
      | 'interest'
      | 'insurance'
      | 'insuranceComponents'
      | 'capital'
      | 'fixedCharges'
      | 'total'
      | 'closing'
      | 'prepayment'
      | 'commission'
      | 'closingAfterPrepayment'
      | 'level'
      | 'isLast'
      | 'payoff'
      | 'paid'
    >();
    expectTypeOf<ScheduleRow['paid']>().toEqualTypeOf<boolean>();
    expectTypeOf<ScheduleRow['k']>().toEqualTypeOf<number>();
    expectTypeOf<ScheduleRow['dueDate']>().toEqualTypeOf<LocalDate>();
    expectTypeOf<ScheduleRow['insuranceComponents']>().toEqualTypeOf<readonly Money[]>();
    expectTypeOf<ScheduleRow['closingAfterPrepayment']>().toEqualTypeOf<Money>();
  });

  it('Schedule carries its currency, rows, totals and end date', () => {
    expectTypeOf<Schedule>().toEqualTypeOf<{
      readonly currency: Currency;
      readonly roundingProfile: RoundingProfile;
      readonly rows: readonly ScheduleRow[];
      readonly totals: ScheduleTotals;
      readonly endDate: LocalDate;
      readonly installmentCount: number;
    }>();
    expectTypeOf<ScheduleTotals>().toEqualTypeOf<{
      readonly interest: Money;
      readonly insurance: Money;
      readonly capital: Money;
      readonly fixedCharges: Money;
      readonly prepayments: Money;
      readonly commissions: Money;
      readonly total: Money;
      readonly totalPaid: Money;
    }>();
    expectTypeOf<ScheduleRun>().toEqualTypeOf<{ readonly schedule: Schedule; readonly realDelta: RealDelta }>();
    expectTypeOf<Schedule['currency']>().toEqualTypeOf<Currency>();
    expectTypeOf<Schedule['rows']>().toEqualTypeOf<readonly ScheduleRow[]>();
    expectTypeOf<Schedule['endDate']>().toEqualTypeOf<LocalDate>();
    expectTypeOf<Schedule['totals']['totalPaid']>().toEqualTypeOf<Money>();
  });

  it('Paths exposes cutoffK and realDelta per anchor and per component ([ALG.PATHS.CUTOFF])', () => {
    expectTypeOf<PathKind>().toEqualTypeOf<'ORIGINAL' | 'REAL' | 'SCENARIO'>();
    expectTypeOf<keyof Paths>().toEqualTypeOf<'input' | 'original' | 'real' | 'scenario' | 'cutoffK' | 'realDelta'>();
    expectTypeOf<PathsInput>().toEqualTypeOf<{
      readonly terms: LoanTerms;
      readonly realEvents: readonly DomainEvent[];
      readonly scenarioEvents: readonly HypotheticalEvent[] | null;
    }>();
    expectTypeOf<AnchorRealDelta>().toEqualTypeOf<{
      readonly eventId: string;
      readonly k: number;
      readonly reported: Money;
      readonly projected: Money;
      readonly realDelta: Money;
    }>();
    expectTypeOf<Paths['cutoffK']>().toEqualTypeOf<number>();
    expectTypeOf<Paths['realDelta']>().toEqualTypeOf<RealDelta>();
    expectTypeOf<RealDelta['perAnchor']>().toEqualTypeOf<readonly AnchorRealDelta[]>();
    expectTypeOf<RealDelta['perComponent']>().toEqualTypeOf<readonly ComponentRealDelta[]>();
    expectTypeOf<AnchorRealDelta['realDelta']>().toEqualTypeOf<Money>();
    expectTypeOf<Paths['scenario']>().toEqualTypeOf<Schedule | null>();
  });

  it('ComponentRealDelta carries the four components of the breakdown ([ALG.ACTUAL])', () => {
    expectTypeOf<ComponentRealDelta>().toEqualTypeOf<{
      readonly eventId: string;
      readonly k: number;
      readonly capital: Money;
      readonly interest: Money;
      readonly insurance: Money;
      readonly fixedCharges: Money;
    }>();
  });

  it('ComparisonMetrics includes netSaving and the other [ALG.METRICS] values', () => {
    expectTypeOf<ComparisonMetrics>().toEqualTypeOf<{
      readonly currency: Currency;
      readonly interestSaved: Money;
      readonly monthsSaved: number;
      readonly baseEndDate: LocalDate;
      readonly endDate: LocalDate;
      readonly baseTotalPaid: Money;
      readonly totalPaid: Money;
      readonly netSaving: Money;
    }>();
    expectTypeOf<ComparisonMetrics['netSaving']>().toEqualTypeOf<Money>();
    expectTypeOf<ComparisonMetrics['interestSaved']>().toEqualTypeOf<Money>();
    expectTypeOf<ComparisonMetrics['monthsSaved']>().toEqualTypeOf<number>();
    expectTypeOf<ComparisonMetrics['endDate']>().toEqualTypeOf<LocalDate>();
    expectTypeOf<ComparisonMetrics['totalPaid']>().toEqualTypeOf<Money>();
  });

  it('YearlySubtotal sums exactly the [ALG.YEARLY] columns per calendar year, commissions included', () => {
    expectTypeOf<keyof YearlySubtotal>().toEqualTypeOf<
      'year' | 'capital' | 'interest' | 'insurance' | 'fixedCharges' | 'prepayments' | 'commissions' | 'total'
    >();
    expectTypeOf<YearlySubtotal['year']>().toEqualTypeOf<number>();
    expectTypeOf<YearlySubtotal['commissions']>().toEqualTypeOf<Money>();
    expectTypeOf<YearlySubtotal['total']>().toEqualTypeOf<Money>();
  });

  it('GoalSeekResult is ALREADY_MET | FOUND{amount, metrics, isPayoff} | INFEASIBLE{payoffAmount, reason}', () => {
    expectTypeOf<GoalSeekResult>().toEqualTypeOf<
      | { readonly kind: 'ALREADY_MET' }
      | {
          readonly kind: 'FOUND';
          readonly amount: Money;
          readonly metrics: ComparisonMetrics;
          readonly isPayoff: boolean;
        }
      | { readonly kind: 'INFEASIBLE'; readonly payoffAmount: Money; readonly reason: InfeasibleReason }
    >();
    expectTypeOf<InfeasibleReason>().toEqualTypeOf<'GOAL_DATE_BEFORE_PREPAYMENT'>();
    expectTypeOf<keyof GoalSeekRequest>().toEqualTypeOf<'basePath' | 'prepaymentDate' | 'goal'>();
    expectTypeOf<GoalSeekRequest['prepaymentDate']>().toEqualTypeOf<LocalDate>();
    expectTypeOf<GoalSeekRequest['basePath']>().toEqualTypeOf<'REAL' | 'SCENARIO'>();
    expectTypeOf<GoalSeekRequest['goal']>().toEqualTypeOf<
      | { readonly kind: 'FINISH_BY'; readonly date: LocalDate }
      | { readonly kind: 'MAX_INSTALLMENT'; readonly amount: Money }
    >();
  });

  it('TemplateValidationResult is GREEN without cause, AMBER or RED with a closed cause ([ALG.VALIDATE])', () => {
    expectTypeOf<keyof TemplateValidationResult>().toEqualTypeOf<
      'k' | 'reported' | 'modeled' | 'realDelta' | 'status' | 'cause'
    >();
    expectTypeOf<TemplateValidationRequest>().toEqualTypeOf<{
      readonly terms: LoanTerms;
      readonly realEvents: readonly DomainEvent[];
      readonly reported: ReportedBalanceEvent;
    }>();
    expectTypeOf<TrafficLight>().toEqualTypeOf<'GREEN' | 'AMBER' | 'RED'>();
    expectTypeOf<ValidationStatus>().toEqualTypeOf<'GREEN' | 'AMBER' | 'RED' | 'UNVALIDATED'>();
    expectTypeOf<TemplateValidationResult['status']>().toEqualTypeOf<TrafficLight>();
    expectTypeOf<Extract<TemplateValidationResult, { status: 'GREEN' }>['cause']>().toEqualTypeOf<null>();
    expectTypeOf<Exclude<TemplateValidationResult, { status: 'GREEN' }>['cause']>().toEqualTypeOf<DeltaCause>();
    expectTypeOf<DeltaCause>().toEqualTypeOf<
      | 'INSTALLMENT_MISALIGNMENT'
      | 'UNKNOWN'
      | 'RATE_MISMATCH'
      | 'INSURANCE_RATE_MISMATCH'
      | 'ROUNDING_PROFILE'
      | 'MISSING_EVENT'
    >();
    expectTypeOf<TemplateValidationResult['realDelta']>().toEqualTypeOf<Money>();
  });
});
