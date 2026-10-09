import { installmentOnOrAfter } from '../dates/index.ts';
import { compareMoney, dec, moneyAbs, moneySub, parseRate } from '../money/index.ts';
import { buildSchedule } from '../schedule/index.ts';
import type { ValidateAgainstReportedBalanceFn } from '../types/engine.ts';
import type { DomainEvent, ReportedBalanceEvent } from '../types/events.ts';
import type { LoanTerms } from '../types/loan.ts';
import { InvalidInputError, type Money } from '../types/primitives.ts';
import type { DeltaCause, TemplateValidationResult, TrafficLight } from '../types/schedule.ts';

/** [ALG.VALIDATE] Umbral de GREEN, en unidades de la moneda del préstamo. */
const GREEN_LIMIT = '1.00' as Money;
/** [ALG.VALIDATE] Piso del límite de AMBER. */
const AMBER_FLOOR = '50.00' as Money;
/** [ALG.VALIDATE] Fracción del saldo reportado que fija el límite de AMBER cuando supera el piso. */
const AMBER_FRACTION = parseRate('0.0002');
/** [ALG.VALIDATE] Distancia máxima a la apertura de k − 1 o k + 1 para `INSTALLMENT_MISALIGNMENT`. */
const MISALIGNMENT_DISTANCE = '1.00' as Money;

/** [ALG.EVENTS.ANCHOR] reglas 1 y 2: el `installmentNumber` explícito manda; si no, la primera cuota con vencimiento ≥ fecha. */
function installmentOf(terms: LoanTerms, event: ReportedBalanceEvent): number {
  const k = event.installmentNumber ?? installmentOnOrAfter(terms.firstDueDate, terms.paymentDay, event.date);
  if (!Number.isSafeInteger(k)) {
    throw new InvalidInputError('INVALID_EVENT', 'installmentNumber must be an integer', { eventId: event.id });
  }
  return k;
}

/**
 * [ALG.VALIDATE] Camino modelado: los eventos reales sin las anclas con `k' ≥ k`. Las anclas de la misma `k` y de
 * cuotas posteriores se excluyen todas, como en la fase 0 de [ALG.EVENTS.ORDER]; los demás eventos se conservan.
 */
function keptEvents(terms: LoanTerms, realEvents: readonly DomainEvent[], k: number): readonly DomainEvent[] {
  return realEvents.filter((event) => {
    if (event.type !== 'ReportedBalance') {
      return true;
    }
    const anchorK = event.installmentNumber ?? installmentOnOrAfter(terms.firstDueDate, terms.paymentDay, event.date);
    return anchorK < k;
  });
}

/** [ALG.VALIDATE] Semáforo. El límite de AMBER, `máx(50.00, 0.0002 · Bᵣ)`, no se redondea ([ALG.CONV]). */
function trafficLight(reported: Money, realDelta: Money): TrafficLight {
  const distance = moneyAbs(realDelta);
  if (compareMoney(distance, GREEN_LIMIT) <= 0) {
    return 'GREEN';
  }
  const proportional = dec(reported).times(dec(AMBER_FRACTION));
  const limit = proportional.gt(dec(AMBER_FLOOR)) ? proportional : dec(AMBER_FLOOR);
  return dec(distance).lte(limit) ? 'AMBER' : 'RED';
}

function isNear(reported: Money, opening: Money | undefined): boolean {
  return opening !== undefined && compareMoney(moneyAbs(moneySub(reported, opening)), MISALIGNMENT_DISTANCE) <= 0;
}

/**
 * [ALG.VALIDATE] Compara el saldo reportado `Bᵣ` con la apertura modelada de su cuota `k`. El modelado hereda los
 * eventos reales que conserva (sin revalidar su rango). Si `k` no está entre 1 y la última cuota del calendario
 * modelado, lanza `InvalidInputError('INSTALLMENT_OUT_OF_RANGE')` con `details.k` ([ALG.EVENTS.ANCHOR]).
 */
export const validateAgainstReportedBalance: ValidateAgainstReportedBalanceFn = (request, ctx) => {
  const { terms, realEvents, reported } = request;
  const k = installmentOf(terms, reported);
  if (k < 1) {
    throw new InvalidInputError('INSTALLMENT_OUT_OF_RANGE', 'installmentNumber must be at least 1', { k });
  }
  const schedule = buildSchedule(terms, [], ctx, { inheritedEvents: keptEvents(terms, realEvents, k) });
  if (k > schedule.installmentCount) {
    throw new InvalidInputError(
      'INSTALLMENT_OUT_OF_RANGE',
      'The reported balance falls after the last installment of the modeled schedule',
      { k, max: schedule.installmentCount },
    );
  }
  const openingOf = (installment: number): Money | undefined => schedule.rows[installment - 1]?.opening;
  const modeled = openingOf(k) as Money;
  const realDelta = moneySub(reported.balance, modeled);
  const status = trafficLight(reported.balance, realDelta);
  const base = { k, reported: reported.balance, modeled, realDelta };
  if (status === 'GREEN') {
    return { ...base, status, cause: null };
  }
  const cause: DeltaCause =
    isNear(reported.balance, openingOf(k - 1)) || isNear(reported.balance, openingOf(k + 1))
      ? 'INSTALLMENT_MISALIGNMENT'
      : 'UNKNOWN';
  const result: TemplateValidationResult = { ...base, status, cause };
  return result;
};
