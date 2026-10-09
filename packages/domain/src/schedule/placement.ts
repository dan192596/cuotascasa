import { installmentOnOrAfter } from '../dates/index.ts';
import {
  compareEventOrderKeys,
  type DomainEvent,
  type EventOrderKey,
  eventOrderKey,
  type PrepaymentEvent,
} from '../types/events.ts';
import type { LoanTerms } from '../types/loan.ts';
import { InvalidInputError } from '../types/primitives.ts';
import type { ScheduleOptions } from '../types/engine.ts';

/** Un evento asociado a su cuota de aplicación k ([ALG.EVENTS.ANCHOR]) y a su clave de orden total. */
export interface PlacedEvent {
  readonly event: DomainEvent;
  readonly k: number;
  readonly key: EventOrderKey;
  /** Propio del calendario: su rango se valida. Los heredados y el abono de la búsqueda por meta no. */
  readonly own: boolean;
}

function explicitInstallment(event: DomainEvent): number | undefined {
  return event.type === 'ReportedBalance' || event.type === 'ActualPayment' ? event.installmentNumber : undefined;
}

/** [ALG.EVENTS.ANCHOR] reglas 1 y 2: el `installmentNumber` explícito manda; si no, la primera cuota con vencimiento ≥ fecha. */
function installmentOf(terms: LoanTerms, event: DomainEvent): number {
  const explicit = explicitInstallment(event);
  if (explicit !== undefined) {
    return explicit;
  }
  if (event.type === 'ActualPayment') {
    throw new InvalidInputError('MISSING_INSTALLMENT_NUMBER', 'An ActualPayment needs an installmentNumber', {
      eventId: event.id,
    });
  }
  return installmentOn(terms, event);
}

function installmentOn(terms: LoanTerms, event: DomainEvent): number {
  return installmentOnOrAfter(terms.firstDueDate, terms.paymentDay, event.date);
}

/** [ALG.GOAL] Clave del abono de una prueba: va por su fecha y, si empata, después de todo evento de la fase 3. */
function goalKey(goal: PrepaymentEvent, k: number): EventOrderKey {
  return { ...eventOrderKey(goal, k), typeRank: Number.POSITIVE_INFINITY };
}

/**
 * Asocia cada evento a su cuota k y los ordena por [ALG.EVENTS.ORDER]. Valida los eventos propios: `k` entero y ≥ 1
 * (`INSTALLMENT_OUT_OF_RANGE` con la menor k) y los `ActualPayment` con `installmentNumber`. Los heredados que no
 * tienen una cuota válida (k < 1, no entera) no se aplican nunca. Que `k` no pase de la última cuota lo comprueba
 * `assertOwnEventsInRange` cuando el calendario ya existe.
 */
export function placeEvents(
  terms: LoanTerms,
  events: readonly DomainEvent[],
  options: ScheduleOptions,
): readonly PlacedEvent[] {
  const placed: PlacedEvent[] = [];
  const belowOne: number[] = [];
  for (const event of events) {
    const k = installmentOf(terms, event);
    if (!Number.isSafeInteger(k)) {
      throw new InvalidInputError('INVALID_EVENT', 'installmentNumber must be an integer', { eventId: event.id });
    }
    if (k < 1) {
      belowOne.push(k);
    } else {
      placed.push({ event, k, key: eventOrderKey(event, k), own: true });
    }
  }
  if (belowOne.length > 0) {
    const k = Math.min(...belowOne);
    throw new InvalidInputError('INSTALLMENT_OUT_OF_RANGE', 'installmentNumber must be at least 1', { k });
  }
  for (const event of options.inheritedEvents ?? []) {
    const k = installmentOf(terms, event);
    if (Number.isSafeInteger(k) && k >= 1) {
      placed.push({ event, k, key: eventOrderKey(event, k), own: false });
    }
  }
  const goal = options.goalPrepayment;
  if (goal !== undefined) {
    const k = installmentOn(terms, goal);
    placed.push({ event: goal, k, key: goalKey(goal, k), own: false });
  }
  return placed.sort((a, b) => compareEventOrderKeys(a.key, b.key));
}

/**
 * [ALG.EVENTS.ANCHOR] regla 3: ningún evento propio queda después de la última cuota del calendario; si no, lanza
 * `INSTALLMENT_OUT_OF_RANGE` con la menor de esas k. Los heredados y el abono de la búsqueda por meta se omiten.
 */
export function assertOwnEventsInRange(placed: readonly PlacedEvent[], lastInstallment: number): void {
  const outOfRange = placed.filter((item) => item.own && item.k > lastInstallment).map((item) => item.k);
  if (outOfRange.length > 0) {
    throw new InvalidInputError(
      'INSTALLMENT_OUT_OF_RANGE',
      'An event falls after the last installment of the schedule',
      { k: Math.min(...outOfRange), max: lastInstallment },
    );
  }
}
