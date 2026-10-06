import { describe, expect, it } from 'vitest';
import { NotImplementedError } from './errors.ts';

describe('NotImplementedError', () => {
  it('names the owning card in cardId and in the message', () => {
    const error = new NotImplementedError('W1-03');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('NotImplementedError');
    expect(error.cardId).toBe('W1-03');
    expect(error.message).toBe('Not implemented yet: owned by card W1-03');
  });
});
