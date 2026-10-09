import { moneySub } from '../../money/index.ts';
import type { EventHandler } from '../../types/engine.ts';

/**
 * [ALG.ANCHOR] `ReportedBalance` (fase 0 de [ALG.EVENTS.ORDER]): calcula `realDelta = Bᵣ − apertura proyectada de k` y
 * re-ancla el saldo de apertura de k a `Bᵣ`. `level`, `term` y el modo del plazo no cambian.
 *
 * La apertura proyectada es la que entrega el bucle (`projectedOpening`, antes de cualquier ancla de k), no el saldo del
 * estado: con varias anclas en la misma k todas reportan contra la misma apertura. El bucle despacha en orden de
 * (fecha, id), así que la última ancla, la de fecha mayor (empate: `id` mayor), es la que deja el saldo final.
 */
export const reportedBalanceHandler: EventHandler<'ReportedBalance'> = ({ event, k, state, projectedOpening }) => ({
  state: { ...state, balance: event.balance },
  anchorDelta: {
    eventId: event.id,
    k,
    reported: event.balance,
    projected: projectedOpening,
    realDelta: moneySub(event.balance, projectedOpening),
  },
});
