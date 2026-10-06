/**
 * API pública congelada de `@cuotascasa/domain` (W0-03).
 * Las tarjetas implementan sus directorios con las firmas de `types/engine.ts`; este archivo no cambia.
 */
import { createEngineContext } from './engine-context.ts';
import * as goalSeekModule from './goal-seek/index.ts';
import * as pathsModule from './paths/index.ts';
import * as scheduleModule from './schedule/index.ts';
import type { EngineContext, ScheduleOptions } from './types/engine.ts';
import type { DomainEvent } from './types/events.ts';
import type { LoanTerms } from './types/loan.ts';
import type {
  GoalSeekRequest,
  GoalSeekResult,
  Paths,
  PathsInput,
  Schedule,
  ScheduleRun,
  TemplateValidationRequest,
  TemplateValidationResult,
} from './types/schedule.ts';
import * as validationModule from './validation/index.ts';

/** [ALG.PERIOD.FHA_GT_V1]…[ALG.LAST] Calendario de un camino. Sin `ctx`, usa el registro y los helpers por defecto. */
export function buildSchedule(
  terms: LoanTerms,
  events: readonly DomainEvent[] = [],
  ctx: EngineContext = createEngineContext(),
  options: ScheduleOptions = {},
): Schedule {
  return scheduleModule.buildSchedule(terms, events, ctx, options);
}

/** [ALG.EVENTS.ORDER] El bucle completo: el calendario y las diferencias reales (`realDelta`) de los handlers. */
export function runSchedule(
  terms: LoanTerms,
  events: readonly DomainEvent[] = [],
  ctx: EngineContext = createEngineContext(),
  options: ScheduleOptions = {},
): ScheduleRun {
  return scheduleModule.runSchedule(terms, events, ctx, options);
}

/** [ALG.PATHS] Plan original, camino real y escenario, con `cutoffK` y las diferencias reales. */
export function buildPaths(input: PathsInput, ctx: EngineContext = createEngineContext()): Paths {
  return pathsModule.buildPaths(input, ctx);
}

/** [ALG.GOAL] Búsqueda por meta sobre unos `Paths`. */
export function goalSeek(
  paths: Paths,
  request: GoalSeekRequest,
  ctx: EngineContext = createEngineContext(),
): GoalSeekResult {
  return goalSeekModule.goalSeek(paths, request, ctx);
}

/** [ALG.VALIDATE] Semáforo de un saldo reportado contra el camino modelado. */
export function validateAgainstReportedBalance(
  request: TemplateValidationRequest,
  ctx: EngineContext = createEngineContext(),
): TemplateValidationResult {
  return validationModule.validateAgainstReportedBalance(request, ctx);
}

export { levelPayment, yearlySubtotals } from './schedule/index.ts';
export { compareSchedules } from './paths/index.ts';
export { deriveFixedCharges, instantiateTemplate, listTemplates } from './templates/index.ts';

export {
  compareMoney,
  isMoney,
  isRate,
  MAX_PERCENT_DECIMALS,
  maxMoney,
  minMoney,
  moneyAbs,
  moneyAdd,
  moneyIsNegative,
  moneyIsZero,
  moneyMidpoint,
  moneyNegate,
  moneySub,
  moneySum,
  parseMoney,
  parseRate,
  percentOf,
  percentToRate,
  periodicRate,
  rateToPercent,
  ZERO_MONEY,
} from './money/index.ts';
export {
  addMonths,
  alignToPaymentDay,
  assertFirstDueDateConsistent,
  compareLocalDate,
  daysInMonth,
  dueDateFor,
  dueDates,
  dueDayOfMonth,
  endOfMonth,
  installmentOnOrAfter,
  isFirstDueDateConsistent,
  isLeapYear,
  isLocalDate,
  type LocalDateParts,
  localDateParts,
  makeLocalDate,
  monthIndex,
  parseLocalDate,
  parsePaymentDay,
} from './dates/index.ts';

export {
  type Brand,
  type CardId,
  CURRENCIES,
  type Currency,
  CurrencyMismatchError,
  type DayOfMonth,
  DomainError,
  type DomainErrorKind,
  END_OF_MONTH,
  type ErrorDetails,
  ERROR_RULES,
  type ErrorRule,
  INFEASIBLE_GOAL_CODES,
  type InfeasibleGoalCode,
  InfeasibleGoalError,
  INVALID_INPUT_CODES,
  INVALID_INPUT_RULES,
  type InvalidInputCode,
  InvalidInputError,
  type InvalidInputRule,
  type LocalDate,
  type Money,
  NEGATIVE_AMORTIZATION_RULES,
  NegativeAmortizationError,
  type NegativeAmortizationRule,
  NotImplementedError,
  type PaymentDay,
  type Rate,
  RATE_TYPES,
  type RateType,
  ROUNDING_PROFILES,
  type RoundingProfile,
} from './types/primitives.ts';
export {
  type FixedCharge,
  type FixedChargeLine,
  type InsuranceKind,
  type LoanTerms,
  type Template,
  TEMPLATE_IDS,
  type TemplateId,
  type TemplateInstance,
  type TemplateInsuranceRate,
  type TemplateRef,
  type TemplateValues,
} from './types/loan.ts';
export {
  type ActualPaymentBreakdown,
  type ActualPaymentEvent,
  type AdvanceInstallmentsEvent,
  type Commission,
  compareEventOrderKeys,
  DOMAIN_EVENT_TYPES,
  type DomainEvent,
  type DomainEventOf,
  type DomainEventType,
  EVENT_ORDER_KEY,
  EVENT_PHASES,
  type EventOrderKey,
  type EventPhase,
  eventOrderKey,
  type FixedChargeChangeEvent,
  type HypotheticalEvent,
  INSTALLMENT_PHASE,
  PREPAYMENT_MODES,
  type PrepaymentEvent,
  type PrepaymentMode,
  RATE_CHANGE_POLICIES,
  type RateChangeEvent,
  type RateChangePolicy,
  type ReportedBalanceEvent,
} from './types/events.ts';
export {
  type AnchorRealDelta,
  type ComparisonMetrics,
  type ComponentRealDelta,
  DELTA_CAUSES,
  type DeltaCause,
  EMITTED_DELTA_CAUSES,
  type Goal,
  type GoalSeekRequest,
  type GoalSeekResult,
  type InfeasibleReason,
  PathKind,
  type Paths,
  type PathsInput,
  type RealDelta,
  type Schedule,
  type ScheduleRow,
  type ScheduleRun,
  type ScheduleTotals,
  type TemplateValidationRequest,
  type TemplateValidationResult,
  type TrafficLight,
  type ValidationStatus,
  type YearlySubtotal,
} from './types/schedule.ts';
export type { EngineContext, PeriodState, ScheduleOptions, TermMode } from './types/engine.ts';
