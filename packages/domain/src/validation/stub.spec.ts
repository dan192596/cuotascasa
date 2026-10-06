import { describe, it } from 'vitest';
import { expectNotImplemented } from '../../test/support/not-implemented.ts';
import { SYNTHETIC_EVENTS, syntheticTerms } from '../../test/support/synthetic.ts';
import { createEngineContext } from '../engine-context.ts';
import * as api from '../index.ts';
import type { TemplateValidationRequest } from '../types/schedule.ts';
import { validateAgainstReportedBalance } from './index.ts';

describe('validation/ stub (owned by W2-07)', () => {
  const request: TemplateValidationRequest = {
    terms: syntheticTerms(),
    realEvents: [],
    reported: SYNTHETIC_EVENTS.ReportedBalance,
  };

  it('validateAgainstReportedBalance throws NotImplementedError naming W2-07', () => {
    expectNotImplemented(() => validateAgainstReportedBalance(request, createEngineContext()), 'W2-07');
  });

  it('the public API forwards to this stub', () => {
    expectNotImplemented(() => api.validateAgainstReportedBalance(request), 'W2-07');
  });
});
