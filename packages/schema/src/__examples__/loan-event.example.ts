import type { LoanEvent } from '../entities/loan-event.ts';
import { EXAMPLE_LOAN_ID, EXAMPLE_STAMPS } from './stamps.example.ts';

/** [ALG.EXAMPLE]: a Q20,000.00 prepayment dated 2026-01-15, applied after installment 12, REDUCE_TERM. */
export const loanEventExample: LoanEvent = {
  id: 'b0000000-0000-4000-8000-000000000001',
  ...EXAMPLE_STAMPS,
  loanId: EXAMPLE_LOAN_ID,
  type: 'Prepayment',
  date: '2026-01-15',
  amount: '20000.00',
  mode: 'REDUCE_TERM',
  note: 'Abono de ejemplo',
};
