import { describe, expect, it } from 'vitest';
import { expectNotImplemented } from '../../../test/support/not-implemented.ts';
import { isStubHandler } from '../../stub.ts';
import { rateChangeHandler } from './index.ts';

describe('events/rate-change stub (owned by W2-03)', () => {
  it('rateChangeHandler is a stub that throws NotImplementedError naming W2-03', () => {
    expect(isStubHandler(rateChangeHandler)).toBe(true);
    expectNotImplemented(() => {
      Reflect.apply(rateChangeHandler, undefined, []);
    }, 'W2-03');
  });
});
