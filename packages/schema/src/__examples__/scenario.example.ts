import type { Scenario } from '../entities/scenario.ts';
import { EXAMPLE_LOAN_ID, EXAMPLE_STAMPS } from './stamps.example.ts';

/** [ALG.EXAMPLE]: the same Q20,000.00 prepayment as a hypothetical REDUCE_INSTALLMENT event. */
export const scenarioExample: Scenario = {
  id: 'f0000000-0000-4000-8000-000000000001',
  ...EXAMPLE_STAMPS,
  loanId: EXAMPLE_LOAN_ID,
  name: 'Abono de enero',
  events: [
    {
      id: 'f1000000-0000-4000-8000-000000000001',
      type: 'Prepayment',
      date: '2026-01-31',
      amount: '20000.00',
      mode: 'REDUCE_INSTALLMENT',
      deletedAt: null,
    },
  ],
};
