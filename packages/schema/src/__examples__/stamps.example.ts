/*
 * Shared invented ids and stamps for the synthetic entity examples (ADR-0015: no real data).
 * Amounts, rates and dates in the examples come from docs/algorithm.md [ALG.EXAMPLE].
 */
export const EXAMPLE_DEVICE_ID = 'd0000000-0000-4000-8000-000000000001';
export const EXAMPLE_LOAN_ID = 'a0000000-0000-4000-8000-000000000001';

export const EXAMPLE_STAMPS = {
  createdAt: '2026-10-04T15:00:00.000Z',
  updatedAt: '2026-10-04T15:00:00.000Z',
  updatedByDevice: EXAMPLE_DEVICE_ID,
  deletedAt: null,
} as const;
