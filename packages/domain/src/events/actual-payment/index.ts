import { moneySub } from '../../money/index.ts';
import type { EventHandler } from '../../types/engine.ts';
import { InvalidInputError } from '../../types/primitives.ts';

/**
 * [ALG.ACTUAL] `ActualPayment` (fase 4, solo comparación): marca la fila k como pagada y, con desglose, calcula
 * `realDelta` por componente (real − proyectado de la fila k del camino real). El `total` del pago no genera delta y el
 * estado no cambia: el anclaje solo ocurre con `ReportedBalance`.
 */
export const actualPaymentHandler: EventHandler<'ActualPayment'> = ({ event, k, state, row }) => {
  if (row === null) {
    throw new InvalidInputError('INVALID_EVENT', 'An ActualPayment is applied after its installment is computed', {
      eventId: event.id,
      k,
    });
  }
  const { breakdown } = event;
  return {
    state,
    rowEffect: { paid: true },
    ...(breakdown === undefined
      ? {}
      : {
          componentDelta: {
            eventId: event.id,
            k,
            capital: moneySub(breakdown.capital, row.capital),
            interest: moneySub(breakdown.interest, row.interest),
            insurance: moneySub(breakdown.insurance, row.insurance),
            fixedCharges: moneySub(breakdown.fixedCharges, row.fixedCharges),
          },
        }),
  };
};
