import type { SeedDocument } from './seed.ts';

/**
 * A tiny invented v1 backup document (ADR-0015: no real data). The loan is the synthetic example of
 * docs/algorithm.md [ALG.EXAMPLE]; ids are fixed placeholders. Feature specs seed richer data by extending it.
 */
const STAMPS = {
  createdAt: '2026-10-04T15:00:00.000Z',
  updatedAt: '2026-10-04T15:00:00.000Z',
  updatedByDevice: 'd0000000-0000-4000-8000-000000000001',
  deletedAt: null,
} as const;

export const SYNTHETIC_LOAN_ID = 'a0000000-0000-4000-8000-000000000001';

export function syntheticBackupDocument(): SeedDocument {
  return {
    format: 'cuotascasa',
    version: 1,
    data: {
      loans: [
        {
          id: SYNTHETIC_LOAN_ID,
          ...STAMPS,
          name: 'Casa A',
          bank: 'Banco Ficticio',
          currency: 'GTQ',
          principal: '500000.00',
          termMonths: 240,
          disbursementDate: '2025-01-31',
          firstDueDate: '2025-02-28',
          paymentDay: 'END_OF_MONTH',
          interestRate: '0.07',
          rateType: 'VARIABLE',
          insuranceRates: ['0.01', '0.0026'],
          fixedCharges: [{ label: 'IUSI', amount: '350.00', effectiveFrom: '2025-02-28' }],
          roundingProfile: 'FHA_GT_V1',
          templateRef: { id: 'fha-gt', version: 1 },
          status: 'active',
        },
      ],
      events: [
        {
          id: 'e0000000-0000-4000-8000-000000000001',
          ...STAMPS,
          loanId: SYNTHETIC_LOAN_ID,
          date: '2026-03-31',
          type: 'Prepayment',
          amount: '10000.00',
          mode: 'REDUCE_TERM',
        },
      ],
      reportedBalances: [],
      payments: [],
      scenarios: [],
      settings: [
        {
          id: '00000000-0000-4000-8000-000000000002',
          ...STAMPS,
          scope: 'device',
          theme: 'system',
          driveSyncEnabled: false,
        },
      ],
    },
  };
}
