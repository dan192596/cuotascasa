import { describe, expect, it } from 'vitest';
import { expectNotImplemented } from '../../../test/support/not-implemented.ts';
import { isStubHandler } from '../../stub.ts';
import { prepaymentHandler } from './index.ts';

describe('events/prepayment stub (owned by W2-04)', () => {
  it('prepaymentHandler is a stub that throws NotImplementedError naming W2-04', () => {
    expect(isStubHandler(prepaymentHandler)).toBe(true);
    expectNotImplemented(() => {
      Reflect.apply(prepaymentHandler, undefined, []);
    }, 'W2-04');
  });
});
