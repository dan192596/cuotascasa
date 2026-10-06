import { describe, expect, it } from 'vitest';
import { expectNotImplemented } from '../../../test/support/not-implemented.ts';
import { isStubHandler } from '../../stub.ts';
import { advanceInstallmentsHandler } from './index.ts';

describe('events/advance-installments stub (owned by W2-04)', () => {
  it('advanceInstallmentsHandler is a stub that throws NotImplementedError naming W2-04', () => {
    expect(isStubHandler(advanceInstallmentsHandler)).toBe(true);
    expectNotImplemented(() => {
      Reflect.apply(advanceInstallmentsHandler, undefined, []);
    }, 'W2-04');
  });
});
