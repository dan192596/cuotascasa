import { describe, expect, it } from 'vitest';
import { expectNotImplemented } from '../../../test/support/not-implemented.ts';
import { isStubHandler } from '../../stub.ts';
import { fixedChargeChangeHandler } from './index.ts';

describe('events/fixed-charge-change stub (owned by W2-03)', () => {
  it('fixedChargeChangeHandler is a stub that throws NotImplementedError naming W2-03', () => {
    expect(isStubHandler(fixedChargeChangeHandler)).toBe(true);
    expectNotImplemented(() => {
      Reflect.apply(fixedChargeChangeHandler, undefined, []);
    }, 'W2-03');
  });
});
