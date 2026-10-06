/**
 * Contrato congelado de W0-03: estado del bucle de periodos, handlers de eventos, contexto del motor
 * y las firmas de cada función que implementan las tarjetas dueñas.
 */
import type { DomainEvent, DomainEventOf, DomainEventType, PrepaymentEvent } from './events.ts';
import type { FixedCharge, LoanTerms, Template, TemplateInstance, TemplateRef } from './loan.ts';
import type { Money, Rate, RoundingProfile } from './primitives.ts';
import type {
  AnchorRealDelta,
  ComparisonMetrics,
  ComponentRealDelta,
  GoalSeekRequest,
  GoalSeekResult,
  Paths,
  PathsInput,
  Schedule,
  ScheduleRow,
  ScheduleRun,
  TemplateValidationRequest,
  TemplateValidationResult,
  YearlySubtotal,
} from './schedule.ts';

/** [ALG.TERM] Modo del plazo: fijo (dato) o derivado (por simulación). */
export type TermMode = 'FIXED' | 'DERIVED';

/**
 * [ALG.TERM] Estado DESPUÉS de pagar la cuota k, incluida su fase 3 (abonos).
 * El estado inicial tiene k = 0, balance = principal, term = termMonths y termMode = 'FIXED'.
 */
export interface PeriodState {
  /** Saldo tras pagar k y aplicar sus abonos. */
  readonly balance: Money;
  /** i vigente. */
  readonly interestRate: Rate;
  /** f₁…f_m vigentes, en orden. */
  readonly insuranceRates: readonly Rate[];
  /** Cuota nivelada vigente. */
  readonly level: Money;
  readonly roundingProfile: RoundingProfile;
  /** Última cuota pagada (0 antes de la primera). */
  readonly k: number;
  readonly termMode: TermMode;
  /** Número de la última cuota del calendario vigente ([ALG.TERM]). */
  readonly term: number;
}

/**
 * Entrada de un handler. El bucle (W1-01) despacha cada evento en el orden de [ALG.EVENTS.ORDER].
 * Fases 0–1: `state` es el estado tras la cuota k − 1 (`state.k === k − 1`) y `row` es `null`.
 * Fases 3–4: `state` es el estado tras la cuota k (`state.k === k`) y `row` es la fila k ya calculada
 * (con los efectos de los eventos anteriores de la fase 3).
 */
export interface HandlerInput<E extends DomainEvent> {
  readonly ctx: EngineContext;
  readonly terms: LoanTerms;
  readonly event: E;
  /** Cuota de aplicación del evento ([ALG.EVENTS.ANCHOR]). */
  readonly k: number;
  readonly state: PeriodState;
  /** Apertura proyectada de k antes de cualquier evento de la fase 0 de k ([ALG.ANCHOR]). */
  readonly projectedOpening: Money;
  /** Cargos fijos en vigor antes de este evento. */
  readonly fixedCharges: readonly FixedCharge[];
  readonly row: ScheduleRow | null;
}

/** Efectos de un evento de las fases 3–4 sobre la fila k. Se acumulan si hay varios eventos en k. */
export interface RowEffect {
  /** Abono aplicado: `min(amount, closing_k − abonos ya aplicados en k)` ([ALG.PREPAY.CAP]); 0.00 con saldo 0.00. */
  readonly prepayment?: Money;
  /** Comisión de ese abono; no hay comisión si el abono aplicado es 0.00 ([ALG.PREPAY.CAP]). */
  readonly commission?: Money;
  readonly payoff?: boolean;
  readonly paid?: boolean;
}

/** Salida de un handler. Solo `state` es obligatorio. */
export interface HandlerResult {
  readonly state: PeriodState;
  /** [ALG.FIXEDCHANGE] Lista completa que reemplaza a los cargos en vigor. */
  readonly fixedCharges?: readonly FixedCharge[];
  readonly rowEffect?: RowEffect;
  /** [ALG.ANCHOR] Diferencia real de un `ReportedBalance`. */
  readonly anchorDelta?: AnchorRealDelta;
  /** [ALG.ACTUAL] Diferencia real por componente de un `ActualPayment` con desglose. */
  readonly componentDelta?: ComponentRealDelta;
}

/** Handler de un tipo de evento. Lo implementa la tarjeta dueña del directorio `events/<tipo>/`. */
export type EventHandler<T extends DomainEventType> = (input: HandlerInput<DomainEventOf<T>>) => HandlerResult;

/** Registro inyectable: un handler por cada tipo de evento. */
export type EventHandlerRegistry = { readonly [T in DomainEventType]: EventHandler<T> };

/** [ALG.LEVEL] level = HALF_UP_2(B · r / (1 − 1/P)), P = (1 + r)^m; con r = 0, HALF_UP_2(B / m) ([ALG.ZERO]). */
export type LevelPaymentFn = (balance: Money, periodicRate: Rate, months: number) => Money;

/**
 * [ALG.TERM] Cuotas k+1 … última, contadas por simulación desde `state`. En plazo derivado, una cuota simulada con
 * `level − financialCharge ≤ 0` lanza `NegativeAmortizationError('ALG.TERM', k)` con su k.
 */
export type RemainingTermFn = (state: PeriodState) => number;

/** [ALG.TERM] Σ capital de las cuotas k+1 … k+n del calendario vigente, por la misma simulación. */
export type ProjectCapitalFn = (state: PeriodState, n: number) => Money;

/** Contexto del motor: el registro de handlers y los helpers de implementación única de [ALG.TERM]. */
export interface EngineContext {
  readonly registry: EventHandlerRegistry;
  readonly levelPayment: LevelPaymentFn;
  readonly remainingTerm: RemainingTermFn;
  readonly projectCapital: ProjectCapitalFn;
}

/**
 * Opciones de un calendario derivado. Los eventos de `events` son propios: se valida su rango ([ALG.EVENTS.ANCHOR],
 * reglas 1 y 3). Los de `inheritedEvents` vienen de su camino de origen (los reales en el escenario de [ALG.PATHS], el
 * camino base en cada prueba de [ALG.GOAL], los reales conservados en [ALG.VALIDATE]): no se revalida su rango y los
 * que caen después de la última cuota no se aplican (regla 3).
 */
export interface ScheduleOptions {
  readonly inheritedEvents?: readonly DomainEvent[];
  /**
   * [ALG.GOAL] Abono de una prueba de la búsqueda por meta: va por su fecha y, si empata en fecha con un evento de la
   * fase 3 del camino base, va después de él.
   */
  readonly goalPrepayment?: PrepaymentEvent;
}

/**
 * W1-01 (`schedule/`): calendario de un camino. Lanza `InvalidInputError`: `INVALID_TERMS` o `INVALID_EVENT` ante una
 * entrada mal formada ([ALG.ERRORS]); `FIRST_DUE_DATE_MISMATCH` ([ALG.DATES]); `INSTALLMENT_OUT_OF_RANGE` (con la menor
 * k) o `MISSING_INSTALLMENT_NUMBER` de un evento propio de `events` ([ALG.EVENTS.ANCHOR], reglas 1 y 3), nunca de
 * `options.inheritedEvents`. Propaga `NegativeAmortizationError` ([ALG.TERM] y los handlers) y el `NotImplementedError`
 * de un handler stub.
 */
export type BuildScheduleFn = (
  terms: LoanTerms,
  events: readonly DomainEvent[],
  ctx: EngineContext,
  options?: ScheduleOptions,
) => Schedule;

/** W1-01 (`schedule/`): el bucle completo, con las diferencias reales de los handlers; lanza como `BuildScheduleFn`. */
export type RunScheduleFn = (
  terms: LoanTerms,
  events: readonly DomainEvent[],
  ctx: EngineContext,
  options?: ScheduleOptions,
) => ScheduleRun;

/** W1-01 (`schedule/`): [ALG.YEARLY]. */
export type YearlySubtotalsFn = (schedule: Schedule) => readonly YearlySubtotal[];

/**
 * W2-05 (`paths/`): [ALG.PATHS]; un hipotético con k ≤ cutoffK lanza `InvalidInputError('HYPOTHETICAL_BEFORE_CUTOFF')`
 * con la menor k.
 */
export type BuildPathsFn = (input: PathsInput, ctx: EngineContext) => Paths;

/** W2-05 (`paths/`): [ALG.METRICS]; monedas distintas lanzan `CurrencyMismatchError`. */
export type CompareSchedulesFn = (base: Schedule, scenario: Schedule) => ComparisonMetrics;

/**
 * W3-03 (`goal-seek/`): [ALG.GOAL]. Lanzan `InfeasibleGoalError`: un abono con k ≤ cutoffK
 * (`PREPAYMENT_NOT_AFTER_CUTOFF`) o después de la última cuota del camino base (`PREPAYMENT_AFTER_END`), ambos con
 * `details.k`; `basePath = 'SCENARIO'` sin escenario (`SCENARIO_PATH_MISSING`) o `MAX_INSTALLMENT` negativo
 * (`INVALID_GOAL_AMOUNT`), sin `k`. `MAX_INSTALLMENT` de 0.00 es válido. Una meta inalcanzable devuelve `INFEASIBLE` y
 * nunca lanza.
 */
export type GoalSeekFn = (paths: Paths, request: GoalSeekRequest, ctx: EngineContext) => GoalSeekResult;

/** W2-07 (`templates/`): [ALG.TEMPLATES]. */
export type ListTemplatesFn = () => readonly Template[];

/** W2-07 (`templates/`): copia profunda de los valores de una plantilla. */
export type InstantiateTemplateFn = (ref: TemplateRef) => TemplateInstance;

/**
 * W2-07 (`templates/`): [ALG.TEMPLATES.FIXED] cuota total del banco − level; un negativo lanza
 * `InvalidInputError('NEGATIVE_FIXED_CHARGES')`.
 */
export type DeriveFixedChargesFn = (bankTotal: Money, level: Money) => Money;

/**
 * W2-07 (`validation/`): [ALG.VALIDATE]. Si la cuota k del saldo reportado no está entre la 1 y la última cuota del
 * calendario modelado, lanza `InvalidInputError('INSTALLMENT_OUT_OF_RANGE')` con `details.k` ([ALG.EVENTS.ANCHOR]).
 */
export type ValidateAgainstReportedBalanceFn = (
  request: TemplateValidationRequest,
  ctx: EngineContext,
) => TemplateValidationResult;
