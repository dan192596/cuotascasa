import { stubHandler } from '../../stub.ts';
import type { EventHandler } from '../../types/engine.ts';

/** Stub de W2-04 ([ALG.PREPAY]). W2-04 reemplaza este archivo con el handler real y borra stub.spec.ts. */
export const prepaymentHandler: EventHandler<'Prepayment'> = stubHandler<'Prepayment'>('W2-04');
