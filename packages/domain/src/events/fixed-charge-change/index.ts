import { stubHandler } from '../../stub.ts';
import type { EventHandler } from '../../types/engine.ts';

/** Stub de W2-03 ([ALG.FIXEDCHANGE]). W2-03 reemplaza este archivo con el handler real y borra stub.spec.ts. */
export const fixedChargeChangeHandler: EventHandler<'FixedChargeChange'> = stubHandler<'FixedChargeChange'>('W2-03');
