/**
 * Contrato congelado de W0-03: eventos de la línea de tiempo ([ALG.EVENTS]) y su orden total ([ALG.EVENTS.ORDER]).
 */
import type { FixedChargeLine } from './loan.ts';
import type { LocalDate, Money, Rate } from './primitives.ts';

/** Tipos de evento de v1. */
export const DOMAIN_EVENT_TYPES = [
  'ReportedBalance',
  'RateChange',
  'FixedChargeChange',
  'Prepayment',
  'AdvanceInstallments',
  'ActualPayment',
] as const;
export type DomainEventType = (typeof DOMAIN_EVENT_TYPES)[number];

interface EventBase<T extends DomainEventType> {
  readonly type: T;
  /** Id estable (UUID en la app). Último criterio del orden total. */
  readonly id: string;
  /** Fecha del evento. Asocia la cuota k por [ALG.EVENTS.ANCHOR] regla 2; es informativa si hay `installmentNumber`. */
  readonly date: LocalDate;
}

/** [ALG.RATE] Políticas ante un cambio de tasa. La primera es la de por defecto. */
export const RATE_CHANGE_POLICIES = [
  'RECALC_INSTALLMENT_KEEP_TERM',
  'KEEP_INSTALLMENT_ADJUST_TERM',
  'BANK_INSTALLMENT',
] as const;
export type RateChangePolicy = (typeof RATE_CHANGE_POLICIES)[number];

interface RateChangeBase extends EventBase<'RateChange'> {
  /** Nueva i desde la cuota k (inclusive). Omitida: no cambia. */
  readonly interestRate?: Rate;
  /** Nuevos f₁…f_m desde la cuota k (lista completa, en orden). Omitida: no cambia. */
  readonly insuranceRates?: readonly Rate[];
}

/**
 * [ALG.RATE] Cambio de tasa. Con `BANK_INSTALLMENT`, `bankInstallment` es la cuota nivelada informada (sin cargos
 * fijos).
 */
export type RateChangeEvent =
  | (RateChangeBase & { readonly policy: 'RECALC_INSTALLMENT_KEEP_TERM' | 'KEEP_INSTALLMENT_ADJUST_TERM' })
  | (RateChangeBase & { readonly policy: 'BANK_INSTALLMENT'; readonly bankInstallment: Money });

/** [ALG.FIXEDCHANGE] Lista COMPLETA de cargos fijos vigentes desde la cuota k; reemplaza todos los anteriores. */
export interface FixedChargeChangeEvent extends EventBase<'FixedChargeChange'> {
  readonly fixedCharges: readonly FixedChargeLine[];
}

/** [ALG.PREPAY] Modos de abono. */
export const PREPAYMENT_MODES = ['REDUCE_TERM', 'REDUCE_INSTALLMENT'] as const;
export type PrepaymentMode = (typeof PREPAYMENT_MODES)[number];

/** [ALG.PREPAY.COMMISSION] Comisión opcional: monto fijo o tasa sobre el abono aplicado. No reduce el saldo. */
export type Commission =
  { readonly kind: 'FLAT'; readonly amount: Money } | { readonly kind: 'PERCENT'; readonly rate: Rate };

/** [ALG.PREPAY] Abono a capital, aplicado justo después de pagar la cuota k (fase 3). */
export interface PrepaymentEvent extends EventBase<'Prepayment'> {
  readonly amount: Money;
  readonly mode: PrepaymentMode;
  readonly commission?: Commission;
}

/**
 * [ALG.ADVANCE] Adelantar N cuotas: abono igual al capital de las cuotas k+1 … k+N del calendario vigente, recortado
 * como [ALG.PREPAY.CAP]. `level` y el modo del plazo no cambian: con plazo fijo, `term` baja en N.
 */
export interface AdvanceInstallmentsEvent extends EventBase<'AdvanceInstallments'> {
  /** N (entero ≥ 1). */
  readonly count: number;
}

/** [ALG.ANCHOR] Saldo reportado: saldo de APERTURA de la cuota k informado por el banco. */
export interface ReportedBalanceEvent extends EventBase<'ReportedBalance'> {
  /** Bᵣ. */
  readonly balance: Money;
  /** k explícita; si existe, manda sobre la fecha ([ALG.EVENTS.ANCHOR] regla 1). */
  readonly installmentNumber?: number;
  /** Informativo en v1. */
  readonly reportedRate?: Rate;
  /** Informativo en v1. */
  readonly totalInstallment?: Money;
}

/**
 * [ALG.ACTUAL] Desglose real de un pago: los cuatro componentes, siempre juntos. `realDelta` se calcula para cada uno
 * contra la fila k del camino real. No hay desgloses parciales (W0-02, decisión 8; `paymentBreakdownSchema` de W0-04).
 */
export interface ActualPaymentBreakdown {
  readonly capital: Money;
  readonly interest: Money;
  /** Σ seguros porcentuales. */
  readonly insurance: Money;
  /** Σ cargos fijos. */
  readonly fixedCharges: Money;
}

/** [ALG.ACTUAL] Pago real: solo compara (fase 4). `date` es la fecha de pago (`paidDate` en el esquema). */
export interface ActualPaymentEvent extends EventBase<'ActualPayment'> {
  /** Obligatorio ([ALG.EVENTS.ANCHOR]). */
  readonly installmentNumber: number;
  /** Total pagado; en v1 no genera `realDelta` ([ALG.ACTUAL]). */
  readonly total: Money;
  /** Opcional como un todo: si viene, trae los cuatro componentes. */
  readonly breakdown?: ActualPaymentBreakdown;
}

/** Unión de todos los eventos del dominio. */
export type DomainEvent =
  | ReportedBalanceEvent
  | RateChangeEvent
  | FixedChargeChangeEvent
  | PrepaymentEvent
  | AdvanceInstallmentsEvent
  | ActualPaymentEvent;

/** El evento de un tipo dado. */
export type DomainEventOf<T extends DomainEventType> = Extract<DomainEvent, { readonly type: T }>;

/** [ALG.PATHS] Eventos que puede traer un escenario (hipotéticos); las anclas y los pagos reales nunca lo son. */
export type HypotheticalEvent = RateChangeEvent | FixedChargeChangeEvent | PrepaymentEvent | AdvanceInstallmentsEvent;

/** Fases de [ALG.EVENTS.ORDER] que llevan eventos. La fase 2 es el cálculo de la cuota k y no tiene eventos. */
export type EventPhase = 0 | 1 | 3 | 4;

/** [ALG.EVENTS.ORDER] La fase 2: se calcula la cuota k. */
export const INSTALLMENT_PHASE = 2;

/** [ALG.EVENTS.ORDER] Campos de la clave de orden total, en orden de prioridad. */
export const EVENT_ORDER_KEY = ['k', 'phase', 'date', 'typeRank', 'id'] as const;

/** [ALG.EVENTS.ORDER] Fase y rango de tipo de cada evento. */
export const EVENT_PHASES = {
  ReportedBalance: { phase: 0, typeRank: 0 },
  RateChange: { phase: 1, typeRank: 0 },
  FixedChargeChange: { phase: 1, typeRank: 1 },
  Prepayment: { phase: 3, typeRank: 0 },
  AdvanceInstallments: { phase: 3, typeRank: 1 },
  ActualPayment: { phase: 4, typeRank: 0 },
} as const satisfies { readonly [T in DomainEventType]: { readonly phase: EventPhase; readonly typeRank: number } };

/** [ALG.EVENTS.ORDER] Clave de orden total (k, fase, fecha, rangoDeTipo, id). */
export interface EventOrderKey {
  readonly k: number;
  readonly phase: EventPhase;
  readonly date: LocalDate;
  readonly typeRank: number;
  readonly id: string;
}

/** Clave de orden de un evento ya asociado a su cuota k ([ALG.EVENTS.ANCHOR]). */
export function eventOrderKey(event: DomainEvent, k: number): EventOrderKey {
  const { phase, typeRank } = EVENT_PHASES[event.type];
  return { k, phase, date: event.date, typeRank, id: event.id };
}

function compareValues(a: number | string, b: number | string): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Compara dos claves campo por campo en el orden de `EVENT_ORDER_KEY`.
 * Fechas e ids se comparan por unidades de código (nunca `localeCompare`), igual que el oráculo con ids ASCII.
 */
export function compareEventOrderKeys(a: EventOrderKey, b: EventOrderKey): -1 | 0 | 1 {
  for (const field of EVENT_ORDER_KEY) {
    const order = compareValues(a[field], b[field]);
    if (order !== 0) {
      return order;
    }
  }
  return 0;
}
