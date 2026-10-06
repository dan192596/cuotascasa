import { stubHandler } from '../../stub.ts';
import type { EventHandler } from '../../types/engine.ts';

/** Stub de W2-05 ([ALG.ACTUAL]). W2-05 reemplaza este archivo con el handler real y borra stub.spec.ts. */
export const actualPaymentHandler: EventHandler<'ActualPayment'> = stubHandler<'ActualPayment'>('W2-05');
