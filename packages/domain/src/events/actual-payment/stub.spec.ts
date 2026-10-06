import { describe, expect, it } from 'vitest';
import { expectNotImplemented } from '../../../test/support/not-implemented.ts';
import { isStubHandler } from '../../stub.ts';
import { actualPaymentHandler } from './index.ts';

describe('events/actual-payment stub (owned by W2-05)', () => {
  it('actualPaymentHandler is a stub that throws NotImplementedError naming W2-05', () => {
    expect(isStubHandler(actualPaymentHandler)).toBe(true);
    expectNotImplemented(() => {
      Reflect.apply(actualPaymentHandler, undefined, []);
    }, 'W2-05');
  });
});
