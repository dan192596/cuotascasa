import { describe, it } from 'vitest';
import { expectNotImplemented } from '../../test/support/not-implemented.ts';
import * as api from '../index.ts';
import { parseMoney } from '../money/index.ts';
import { deriveFixedCharges, instantiateTemplate, listTemplates } from './index.ts';

describe('templates/ stub (owned by W2-07)', () => {
  it('every export throws NotImplementedError naming W2-07', () => {
    expectNotImplemented(() => listTemplates(), 'W2-07');
    expectNotImplemented(() => instantiateTemplate({ id: 'fha-gt', version: 1 }), 'W2-07');
    expectNotImplemented(() => deriveFixedCharges(parseMoney('4658.47'), parseMoney('4263.47')), 'W2-07');
  });

  it('the public API forwards to this stub', () => {
    expectNotImplemented(() => api.listTemplates(), 'W2-07');
    expectNotImplemented(() => api.instantiateTemplate({ id: 'simple', version: 1 }), 'W2-07');
    expectNotImplemented(() => api.deriveFixedCharges(parseMoney('4658.47'), parseMoney('4263.47')), 'W2-07');
  });
});
