import { describe, expectTypeOf, it } from 'vitest';
import * as goalSeekDir from '../../src/goal-seek/index.ts';
import * as api from '../../src/index.ts';
import * as pathsDir from '../../src/paths/index.ts';
import * as scheduleDir from '../../src/schedule/index.ts';
import * as templatesDir from '../../src/templates/index.ts';
import type {
  BuildPathsFn,
  BuildScheduleFn,
  CompareSchedulesFn,
  DeriveFixedChargesFn,
  EngineContext,
  GoalSeekFn,
  InstantiateTemplateFn,
  LevelPaymentFn,
  ListTemplatesFn,
  ProjectCapitalFn,
  RemainingTermFn,
  RunScheduleFn,
  ScheduleOptions,
  ValidateAgainstReportedBalanceFn,
  YearlySubtotalsFn,
} from '../../src/types/engine.ts';
import type { DomainEvent } from '../../src/types/events.ts';
import type { LoanTerms } from '../../src/types/loan.ts';
import type { Money, Rate } from '../../src/types/primitives.ts';
import type {
  GoalSeekRequest,
  GoalSeekResult,
  Paths,
  PathsInput,
  Schedule,
  ScheduleRun,
  TemplateValidationRequest,
  TemplateValidationResult,
} from '../../src/types/schedule.ts';
import * as validationDir from '../../src/validation/index.ts';

describe('card-owned directories keep the frozen signatures', () => {
  it('schedule/ (W1-01)', () => {
    expectTypeOf(scheduleDir.runSchedule).toEqualTypeOf<RunScheduleFn>();
    expectTypeOf(scheduleDir.buildSchedule).toEqualTypeOf<BuildScheduleFn>();
    expectTypeOf(scheduleDir.levelPayment).toEqualTypeOf<LevelPaymentFn>();
    expectTypeOf(scheduleDir.remainingTerm).toEqualTypeOf<RemainingTermFn>();
    expectTypeOf(scheduleDir.projectCapital).toEqualTypeOf<ProjectCapitalFn>();
    expectTypeOf(scheduleDir.yearlySubtotals).toEqualTypeOf<YearlySubtotalsFn>();
  });

  it('paths/ (W2-05), templates/ and validation/ (W2-07), goal-seek/ (W3-03)', () => {
    expectTypeOf(pathsDir.buildPaths).toEqualTypeOf<BuildPathsFn>();
    expectTypeOf(pathsDir.compareSchedules).toEqualTypeOf<CompareSchedulesFn>();
    expectTypeOf(templatesDir.listTemplates).toEqualTypeOf<ListTemplatesFn>();
    expectTypeOf(templatesDir.instantiateTemplate).toEqualTypeOf<InstantiateTemplateFn>();
    expectTypeOf(templatesDir.deriveFixedCharges).toEqualTypeOf<DeriveFixedChargesFn>();
    expectTypeOf(validationDir.validateAgainstReportedBalance).toEqualTypeOf<ValidateAgainstReportedBalanceFn>();
    expectTypeOf(goalSeekDir.goalSeek).toEqualTypeOf<GoalSeekFn>();
  });
});

describe('@cuotascasa/domain public API signatures', () => {
  it('engine entry points take an optional EngineContext, and the schedule ones optional ScheduleOptions', () => {
    expectTypeOf(api.buildSchedule).toEqualTypeOf<
      (terms: LoanTerms, events?: readonly DomainEvent[], ctx?: EngineContext, options?: ScheduleOptions) => Schedule
    >();
    expectTypeOf(api.runSchedule).toEqualTypeOf<
      (terms: LoanTerms, events?: readonly DomainEvent[], ctx?: EngineContext, options?: ScheduleOptions) => ScheduleRun
    >();
    expectTypeOf(api.buildPaths).toEqualTypeOf<(input: PathsInput, ctx?: EngineContext) => Paths>();
    expectTypeOf(api.goalSeek).toEqualTypeOf<
      (paths: Paths, request: GoalSeekRequest, ctx?: EngineContext) => GoalSeekResult
    >();
    expectTypeOf(api.validateAgainstReportedBalance).toEqualTypeOf<
      (request: TemplateValidationRequest, ctx?: EngineContext) => TemplateValidationResult
    >();
  });

  it('levelPayment, percentToRate and rateToPercent are exported with exact string types', () => {
    expectTypeOf(api.levelPayment).toEqualTypeOf<(balance: Money, periodicRate: Rate, months: number) => Money>();
    expectTypeOf(api.percentToRate).toEqualTypeOf<(percent: unknown) => Rate>();
    expectTypeOf(api.rateToPercent).toEqualTypeOf<(rate: Rate) => string>();
    expectTypeOf(api.periodicRate).toEqualTypeOf<(interestRate: Rate, insuranceRates: readonly Rate[]) => Rate>();
    expectTypeOf(api.moneyMidpoint).toEqualTypeOf<(a: Money, b: Money) => Money>();
    expectTypeOf(api.compareSchedules).toEqualTypeOf<CompareSchedulesFn>();
    expectTypeOf(api.yearlySubtotals).toEqualTypeOf<YearlySubtotalsFn>();
  });

  it('re-exports the frozen types under the same names', () => {
    expectTypeOf<api.ScheduleOptions>().toEqualTypeOf<ScheduleOptions>();
    expectTypeOf<api.ScheduleRun>().toEqualTypeOf<ScheduleRun>();
    expectTypeOf<api.EngineContext>().toEqualTypeOf<EngineContext>();
    expectTypeOf<api.Schedule>().toEqualTypeOf<Schedule>();
  });

  it('does not leak decimal.js through the public API', () => {
    expectTypeOf<typeof api>().not.toHaveProperty('dec');
    expectTypeOf<typeof api>().not.toHaveProperty('DomainDecimal');
    expectTypeOf<typeof api>().not.toHaveProperty('halfUp2');
    expectTypeOf<typeof api>().not.toHaveProperty('decInt');
    expectTypeOf<typeof api>().not.toHaveProperty('toMoney');
    expectTypeOf<typeof api>().not.toHaveProperty('toPlainString');
  });
});
