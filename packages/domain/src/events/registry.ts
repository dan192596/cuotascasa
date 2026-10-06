/**
 * Contrato congelado de W0-03: registro por defecto de handlers de eventos.
 * Cada tarjeta reemplaza el contenido de su directorio `events/<tipo>/`; este archivo no cambia.
 */
import type { EventHandlerRegistry } from '../types/engine.ts';
import type { DomainEventType } from '../types/events.ts';
import type { CardId } from '../types/primitives.ts';
import { actualPaymentHandler } from './actual-payment/index.ts';
import { advanceInstallmentsHandler } from './advance-installments/index.ts';
import { fixedChargeChangeHandler } from './fixed-charge-change/index.ts';
import { prepaymentHandler } from './prepayment/index.ts';
import { rateChangeHandler } from './rate-change/index.ts';
import { reportedBalanceHandler } from './reported-balance/index.ts';

/** Tarjeta dueña del handler de cada tipo de evento. */
export const EVENT_HANDLER_OWNERS = {
  ReportedBalance: 'W2-05',
  RateChange: 'W2-03',
  FixedChargeChange: 'W2-03',
  Prepayment: 'W2-04',
  AdvanceInstallments: 'W2-04',
  ActualPayment: 'W2-05',
} as const satisfies { readonly [T in DomainEventType]: CardId };

/** Registro por defecto que usa `createEngineContext()`. */
export const eventHandlers: EventHandlerRegistry = {
  ReportedBalance: reportedBalanceHandler,
  RateChange: rateChangeHandler,
  FixedChargeChange: fixedChargeChangeHandler,
  Prepayment: prepaymentHandler,
  AdvanceInstallments: advanceInstallmentsHandler,
  ActualPayment: actualPaymentHandler,
};
