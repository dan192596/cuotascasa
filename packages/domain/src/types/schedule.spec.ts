import { describe, expect, it } from 'vitest';
import { DELTA_CAUSES, EMITTED_DELTA_CAUSES, PathKind } from './schedule.ts';

describe('schedule-level constants', () => {
  it('names the three paths of [ALG.PATHS]', () => {
    expect(PathKind).toEqual({ ORIGINAL: 'ORIGINAL', REAL: 'REAL', SCENARIO: 'SCENARIO' });
  });

  it('closes the causes enum of [ALG.VALIDATE] and emits only two in v1', () => {
    expect(DELTA_CAUSES).toEqual([
      'INSTALLMENT_MISALIGNMENT',
      'UNKNOWN',
      'RATE_MISMATCH',
      'INSURANCE_RATE_MISMATCH',
      'ROUNDING_PROFILE',
      'MISSING_EVENT',
    ]);
    expect(EMITTED_DELTA_CAUSES).toEqual(['INSTALLMENT_MISALIGNMENT', 'UNKNOWN']);
  });
});
