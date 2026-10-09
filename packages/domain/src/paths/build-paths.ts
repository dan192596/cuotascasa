import { buildSchedule, runSchedule } from '../schedule/index.ts';
import { placeEvents } from '../schedule/placement.ts';
import type { BuildPathsFn } from '../types/engine.ts';
import type { DomainEvent, DomainEventType } from '../types/events.ts';
import { InvalidInputError } from '../types/primitives.ts';
import type { LoanTerms } from '../types/loan.ts';

/** [ALG.PATHS.CUTOFF] Tipos reales que mueven el corte; los `RateChange` y `FixedChargeChange` reales no. */
const CUTOFF_TYPES: ReadonlySet<DomainEventType> = new Set([
  'ReportedBalance',
  'ActualPayment',
  'Prepayment',
  'AdvanceInstallments',
]);

/** [ALG.PATHS] Eventos que puede traer un escenario. Las anclas y los pagos reales nunca son hipotéticos. */
const HYPOTHETICAL_TYPES: ReadonlySet<DomainEventType> = new Set([
  'RateChange',
  'FixedChargeChange',
  'Prepayment',
  'AdvanceInstallments',
]);

/** [ALG.PATHS.CUTOFF] Máximo k ([ALG.EVENTS.ANCHOR]) entre los eventos reales que fijan el corte; 0 si no hay. */
function cutoffOf(terms: LoanTerms, realEvents: readonly DomainEvent[]): number {
  return Math.max(
    0,
    ...placeEvents(terms, realEvents, {})
      .filter((item) => CUTOFF_TYPES.has(item.event.type))
      .map((item) => item.k),
  );
}

/** [ALG.PATHS.CUTOFF] Un hipotético con k ≤ cutoffK lanza `HYPOTHETICAL_BEFORE_CUTOFF` con la menor de esas k. */
function assertAfterCutoff(terms: LoanTerms, scenarioEvents: readonly DomainEvent[], cutoffK: number): void {
  for (const event of scenarioEvents) {
    if (!HYPOTHETICAL_TYPES.has(event.type)) {
      throw new InvalidInputError('INVALID_EVENT', 'A scenario only takes hypothetical events', {
        eventId: event.id,
      });
    }
  }
  const early = placeEvents(terms, scenarioEvents, {})
    .filter((item) => item.k <= cutoffK)
    .map((item) => item.k);
  if (early.length > 0) {
    throw new InvalidInputError(
      'HYPOTHETICAL_BEFORE_CUTOFF',
      'A hypothetical event must fall after the last real data (installment greater than cutoffK)',
      { k: Math.min(...early), cutoffK },
    );
  }
}

/**
 * [ALG.PATHS] Los tres caminos. El original son solo las condiciones; el real, las condiciones más los eventos reales
 * (anclas, pagos, tasas, cargos, abonos y adelantos); el escenario ejecuta los hipotéticos como propios y hereda los
 * reales ([ALG.EVENTS.ANCHOR], regla 3). Se compara por número de cuota ([ALG.PATHS.CUTOFF]); la fecha de hoy no
 * interviene.
 */
export const buildPaths: BuildPathsFn = (input, ctx) => {
  const { terms, realEvents, scenarioEvents } = input;
  const original = buildSchedule(terms, [], ctx);
  const realRun = runSchedule(terms, realEvents, ctx);
  const cutoffK = cutoffOf(terms, realEvents);
  let scenario = null;
  if (scenarioEvents !== null) {
    assertAfterCutoff(terms, scenarioEvents, cutoffK);
    scenario = buildSchedule(terms, scenarioEvents, ctx, { inheritedEvents: realEvents });
  }
  return { input, original, real: realRun.schedule, scenario, cutoffK, realDelta: realRun.realDelta };
};
