import { eventHandlers } from './events/registry.ts';
import { levelPayment, projectCapital, remainingTerm } from './schedule/index.ts';
import type { EngineContext } from './types/engine.ts';

/**
 * Contexto por defecto del motor: el registro congelado y los helpers de `schedule/` (W1-01).
 * `overrides` inyecta handlers o helpers de prueba (p. ej. W2-05 prueba caminos sin depender de W2-03/W2-04).
 */
export function createEngineContext(overrides: Partial<EngineContext> = {}): EngineContext {
  return { registry: eventHandlers, levelPayment, remainingTerm, projectCapital, ...overrides };
}
