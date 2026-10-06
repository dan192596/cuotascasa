import { describe, expect, it } from 'vitest';
import { expectNotImplemented } from '../test/support/not-implemented.ts';
import { isStubHandler, notImplemented, stubHandler } from './stub.ts';

describe('stub helpers', () => {
  it('notImplemented throws NotImplementedError naming the card', () => {
    expectNotImplemented(() => notImplemented('W9-99'), 'W9-99');
  });

  it('stubHandler throws for its card and carries the owner marker', () => {
    const handler = stubHandler<'Prepayment'>('W9-98');
    expect(handler.stubOwner).toBe('W9-98');
    expect(isStubHandler(handler)).toBe(true);
    expectNotImplemented(() => {
      Reflect.apply(handler, undefined, []);
    }, 'W9-98');
  });

  it('isStubHandler is false for real functions and non-functions', () => {
    expect(isStubHandler(() => undefined)).toBe(false);
    expect(isStubHandler({ stubOwner: 'W1-01' })).toBe(false);
    expect(isStubHandler(undefined)).toBe(false);
  });
});
