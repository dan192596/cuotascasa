import type { EventHandler } from './types/engine.ts';
import type { DomainEventType } from './types/events.ts';
import { type CardId, NotImplementedError } from './types/primitives.ts';

/** Marca de un handler stub: la tarjeta dueña que todavía no lo implementó. */
export interface StubMarker {
  readonly stubOwner: CardId;
}

/** Lanza `NotImplementedError(cardId)`. Todo stub de un directorio de tarjeta la usa. */
export function notImplemented(cardId: CardId): never {
  throw new NotImplementedError(cardId);
}

/** Handler stub de un tipo de evento: lanza `NotImplementedError(cardId)` y queda marcado con su dueña. */
export function stubHandler<T extends DomainEventType>(cardId: CardId): EventHandler<T> & StubMarker {
  return Object.assign(() => notImplemented(cardId), { stubOwner: cardId });
}

/** Verdadero si `value` es un handler stub de `stubHandler`. */
export function isStubHandler(value: unknown): value is StubMarker {
  return typeof value === 'function' && 'stubOwner' in value;
}
