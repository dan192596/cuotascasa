import { dec, decInt, halfUp2 } from '../money/index.ts';
import type { LevelPaymentFn } from '../types/engine.ts';
import { InvalidInputError } from '../types/primitives.ts';

/**
 * [ALG.LEVEL] level = HALF_UP_2((B · r) / (1 − 1/P)) con P = (1 + r)^m por exponenciación entera en el contexto
 * decimal de [ALG.CONV]. [ALG.ZERO] se trata antes de la fórmula general: con r = 0, level = HALF_UP_2(B / m), sin
 * dividir entre cero.
 * Es la única implementación de la fórmula: `createEngineContext` y `index.ts` la exportan.
 */
export const levelPayment: LevelPaymentFn = (balance, periodicRate, months) => {
  if (!Number.isSafeInteger(months) || months < 1) {
    throw new InvalidInputError('INVALID_INTEGER', 'The number of remaining installments must be an integer >= 1', {
      months,
    });
  }
  const rate = dec(periodicRate);
  const principal = dec(balance);
  if (rate.isZero()) {
    return halfUp2(principal.div(decInt(months)));
  }
  const growth = rate.plus(1).pow(months);
  return halfUp2(principal.times(rate).div(decInt(1).minus(decInt(1).div(growth))));
};
