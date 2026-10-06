import { stubHandler } from '../../stub.ts';
import type { EventHandler } from '../../types/engine.ts';

/** Stub de W2-04 ([ALG.ADVANCE]). W2-04 reemplaza este archivo con el handler real y borra stub.spec.ts. */
export const advanceInstallmentsHandler: EventHandler<'AdvanceInstallments'> =
  stubHandler<'AdvanceInstallments'>('W2-04');
