/**
 * Contrato congelado de W0-03: calendarios, caminos, métricas, subtotales, búsqueda por meta y validación.
 */
import type { DomainEvent, HypotheticalEvent, ReportedBalanceEvent } from './events.ts';
import type { LoanTerms } from './loan.ts';
import type { Currency, LocalDate, Money, RoundingProfile } from './primitives.ts';

/** Una fila (cuota k) de la tabla de amortización. Todos los montos son `Money`. */
export interface ScheduleRow {
  /** Número de cuota, 1-indexado. */
  readonly k: number;
  readonly dueDate: LocalDate;
  /** Saldo de apertura (antes de pagar k; ya re-anclado si hubo `ReportedBalance` en k). */
  readonly opening: Money;
  readonly interest: Money;
  /** Σ seguros porcentuales de la cuota. */
  readonly insurance: Money;
  /** Seguro por componente, en el orden de `insuranceRates` ([ALG.PERIOD.SPLIT]). */
  readonly insuranceComponents: readonly Money[];
  readonly capital: Money;
  /** Σ cargos fijos vigentes en k ([ALG.FIXED]). */
  readonly fixedCharges: Money;
  /** capital + interest + insurance + fixedCharges. */
  readonly total: Money;
  /** [ALG.PERIOD] closing = opening − capital (antes de abonos). Es el `closing_k` de [ALG.PREPAY.CAP]. */
  readonly closing: Money;
  /**
   * Σ abonos aplicados en la fase 3 de k, cada uno recortado a `min(amount, closing_k − abonos ya aplicados en k)`
   * ([ALG.PREPAY.CAP]); '0.00' si no hubo o si el saldo ya era 0.00.
   */
  readonly prepayment: Money;
  /** Σ comisiones de esos abonos; un abono aplicado de 0.00 no cobra comisión. No reduce el saldo. */
  readonly commission: Money;
  /** closing − prepayment: saldo tras pagar k incluida la fase 3 (= `PeriodState.balance`). */
  readonly closingAfterPrepayment: Money;
  /** Cuota nivelada vigente en k (sin cargos fijos). */
  readonly level: Money;
  /** Última fila del calendario ([ALG.LAST]). */
  readonly isLast: boolean;
  /** Un abono de la fase 3 liquidó el préstamo en k ([ALG.PREPAY.CAP]). */
  readonly payoff: boolean;
  /** Existe un `ActualPayment` con `installmentNumber = k` ([ALG.ACTUAL]). */
  readonly paid: boolean;
}

/** Totales de un calendario. */
export interface ScheduleTotals {
  readonly interest: Money;
  readonly insurance: Money;
  readonly capital: Money;
  readonly fixedCharges: Money;
  readonly prepayments: Money;
  readonly commissions: Money;
  /** Σ total de las filas. */
  readonly total: Money;
  /** [ALG.METRICS] Σ total + Σ abonos + Σ comisiones. */
  readonly totalPaid: Money;
}

/** Calendario completo de un camino. */
export interface Schedule {
  readonly currency: Currency;
  readonly roundingProfile: RoundingProfile;
  readonly rows: readonly ScheduleRow[];
  readonly totals: ScheduleTotals;
  /** [ALG.METRICS] Vencimiento de la última cuota. */
  readonly endDate: LocalDate;
  /** Número de cuotas (= rows.length). */
  readonly installmentCount: number;
}

/** [ALG.ANCHOR] Diferencia real de un `ReportedBalance`, contra la apertura proyectada de su k antes de re-anclar. */
export interface AnchorRealDelta {
  readonly eventId: string;
  readonly k: number;
  /** Bᵣ. */
  readonly reported: Money;
  /** Apertura proyectada de k en el camino real. */
  readonly projected: Money;
  /** reported − projected. */
  readonly realDelta: Money;
}

/**
 * [ALG.ACTUAL] Diferencia real por componente de un `ActualPayment` con desglose: real − proyectado de la fila k del
 * camino real, para los cuatro componentes.
 */
export interface ComponentRealDelta {
  readonly eventId: string;
  readonly k: number;
  readonly capital: Money;
  readonly interest: Money;
  readonly insurance: Money;
  readonly fixedCharges: Money;
}

/** Diferencias reales de un camino: por ancla y por componente, cada lista en el orden de [ALG.EVENTS.ORDER]. */
export interface RealDelta {
  readonly perAnchor: readonly AnchorRealDelta[];
  readonly perComponent: readonly ComponentRealDelta[];
}

/** Resultado de `runSchedule`: el calendario y las diferencias reales que emitieron los handlers. */
export interface ScheduleRun {
  readonly schedule: Schedule;
  readonly realDelta: RealDelta;
}

/** [ALG.PATHS] Los tres caminos (glosario: `PathKind.ORIGINAL`, `PathKind.REAL`, `PathKind.SCENARIO`). */
export const PathKind = {
  ORIGINAL: 'ORIGINAL',
  REAL: 'REAL',
  SCENARIO: 'SCENARIO',
} as const;
export type PathKind = (typeof PathKind)[keyof typeof PathKind];

/** Entrada de `buildPaths`. `scenarioEvents = null` significa que no hay escenario. */
export interface PathsInput {
  readonly terms: LoanTerms;
  /** Eventos reales: anclas, pagos, tasas, cargos, abonos y adelantos reales. */
  readonly realEvents: readonly DomainEvent[];
  /** Eventos hipotéticos del escenario; todos con k > cutoffK ([ALG.PATHS.CUTOFF]). */
  readonly scenarioEvents: readonly HypotheticalEvent[] | null;
}

/** [ALG.PATHS] Resultado de `buildPaths`. */
export interface Paths {
  /** La entrada que produjo estos caminos (la usa `goalSeek`). */
  readonly input: PathsInput;
  readonly original: Schedule;
  readonly real: Schedule;
  /** `null` si `input.scenarioEvents` es `null`. */
  readonly scenario: Schedule | null;
  /**
   * [ALG.PATHS.CUTOFF] Máximo k entre los `ReportedBalance`, `ActualPayment`, `Prepayment` y `AdvanceInstallments`
   * reales; 0 si no hay.
   */
  readonly cutoffK: number;
  /** Diferencias reales del camino real, por ancla y por componente. */
  readonly realDelta: RealDelta;
}

/** [ALG.METRICS] Métricas de un escenario contra su base. */
export interface ComparisonMetrics {
  readonly currency: Currency;
  /** Σ(interest + insurance) de la base − lo mismo del escenario. */
  readonly interestSaved: Money;
  /** Cuotas de la base − cuotas del escenario. */
  readonly monthsSaved: number;
  readonly baseEndDate: LocalDate;
  /** `endDate` del escenario. */
  readonly endDate: LocalDate;
  readonly baseTotalPaid: Money;
  /** `totalPaid` del escenario. */
  readonly totalPaid: Money;
  /** baseTotalPaid − totalPaid: incluye los cargos fijos que ya no se pagan y descuenta comisiones. */
  readonly netSaving: Money;
}

/** [ALG.YEARLY] Subtotales por año calendario del vencimiento (`dueDate`). Un año sin cuotas no aparece. */
export interface YearlySubtotal {
  readonly year: number;
  readonly capital: Money;
  readonly interest: Money;
  /** Σ seguros porcentuales. */
  readonly insurance: Money;
  readonly fixedCharges: Money;
  /** Σ abonos aplicados (`ScheduleRow.prepayment`). */
  readonly prepayments: Money;
  /** Σ comisiones (`ScheduleRow.commission`). */
  readonly commissions: Money;
  /** Σ `total` de las filas, sin abonos ni comisiones. */
  readonly total: Money;
}

/**
 * [ALG.GOAL] Meta: terminar a más tardar en una fecha (REDUCE_TERM) o no pasar de una cuota total
 * (REDUCE_INSTALLMENT).
 */
export type Goal =
  | { readonly kind: 'FINISH_BY'; readonly date: LocalDate }
  | { readonly kind: 'MAX_INSTALLMENT'; readonly amount: Money };

/** [ALG.GOAL] Entrada de la búsqueda por meta sobre unos `Paths`. */
export interface GoalSeekRequest {
  /** Camino base: el real o el escenario de los `Paths`. */
  readonly basePath: typeof PathKind.REAL | typeof PathKind.SCENARIO;
  /**
   * Fecha del abono d; su cuota k sale de [ALG.EVENTS.ANCHOR], debe cumplir k > cutoffK y no pasar de la última cuota
   * del camino base ([ALG.GOAL]).
   */
  readonly prepaymentDate: LocalDate;
  readonly goal: Goal;
}

/** [ALG.GOAL] Razones de una meta inalcanzable. */
export type InfeasibleReason = 'GOAL_DATE_BEFORE_PREPAYMENT';

/** [ALG.GOAL] Resultado cerrado de la búsqueda por meta. Una meta inalcanzable nunca lanza. */
export type GoalSeekResult =
  | { readonly kind: 'ALREADY_MET' }
  | { readonly kind: 'FOUND'; readonly amount: Money; readonly metrics: ComparisonMetrics; readonly isPayoff: boolean }
  | { readonly kind: 'INFEASIBLE'; readonly payoffAmount: Money; readonly reason: InfeasibleReason };

/** [ALG.VALIDATE] Semáforo que emite el dominio. */
export type TrafficLight = 'GREEN' | 'AMBER' | 'RED';

/** Glosario: estado de validación de un préstamo; `UNVALIDATED` lo asigna `data/` cuando no hay saldo reportado. */
export type ValidationStatus = TrafficLight | 'UNVALIDATED';

/** [ALG.VALIDATE] Enum cerrado de causas. */
export const DELTA_CAUSES = [
  'INSTALLMENT_MISALIGNMENT',
  'UNKNOWN',
  'RATE_MISMATCH',
  'INSURANCE_RATE_MISMATCH',
  'ROUNDING_PROFILE',
  'MISSING_EVENT',
] as const;
export type DeltaCause = (typeof DELTA_CAUSES)[number];

/** [ALG.VALIDATE] Causas que v1 emite; las demás quedan reservadas. */
export const EMITTED_DELTA_CAUSES = ['INSTALLMENT_MISALIGNMENT', 'UNKNOWN'] as const satisfies readonly DeltaCause[];

/** [ALG.VALIDATE] Entrada: condiciones, eventos reales (vacío en el asistente) y el saldo reportado a validar. */
export interface TemplateValidationRequest {
  readonly terms: LoanTerms;
  readonly realEvents: readonly DomainEvent[];
  readonly reported: ReportedBalanceEvent;
}

interface TemplateValidationBase {
  readonly k: number;
  /** Bᵣ. */
  readonly reported: Money;
  /** Apertura modelada de k: camino real conservando solo las anclas con k' < k. */
  readonly modeled: Money;
  /** reported − modeled. */
  readonly realDelta: Money;
}

/** [ALG.VALIDATE] Resultado: sin causa en GREEN; con causa en AMBER y RED. */
export type TemplateValidationResult =
  | (TemplateValidationBase & { readonly status: 'GREEN'; readonly cause: null })
  | (TemplateValidationBase & { readonly status: 'AMBER' | 'RED'; readonly cause: DeltaCause });
