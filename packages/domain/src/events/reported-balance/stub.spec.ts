import { describe, expect, it } from 'vitest';
import { expectNotImplemented } from '../../../test/support/not-implemented.ts';
import { isStubHandler } from '../../stub.ts';
import { reportedBalanceHandler } from './index.ts';

describe('events/reported-balance stub (owned by W2-05)', () => {
  it('reportedBalanceHandler is a stub that throws NotImplementedError naming W2-05', () => {
    expect(isStubHandler(reportedBalanceHandler)).toBe(true);
    expectNotImplemented(() => {
      Reflect.apply(reportedBalanceHandler, undefined, []);
    }, 'W2-05');
  });
});
