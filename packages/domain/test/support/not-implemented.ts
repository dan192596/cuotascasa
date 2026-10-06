import { expect } from 'vitest';
import { type CardId, NotImplementedError } from '../../src/types/primitives.ts';

/** Afirma que `run` lanza `NotImplementedError` con el id de la tarjeta dueña, en `cardId` y en el mensaje. */
export function expectNotImplemented(run: () => unknown, cardId: CardId): void {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(NotImplementedError);
  expect(caught).toMatchObject({ cardId });
  expect((caught as NotImplementedError).message).toContain(cardId);
}
