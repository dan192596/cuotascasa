/**
 * Thrown by every stub module until its owning card implements it.
 * The card id travels in the message and in `cardId` so a stub test can
 * prove which card owns the directory (docs/plan/waves.md, «Stub semantics»).
 */
export class NotImplementedError extends Error {
  readonly cardId: string;

  constructor(cardId: string) {
    super(`Not implemented yet: owned by card ${cardId}`);
    this.name = 'NotImplementedError';
    this.cardId = cardId;
  }
}
