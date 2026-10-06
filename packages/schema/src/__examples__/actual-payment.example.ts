import type { ActualPayment } from '../entities/actual-payment.ts';
import { EXAMPLE_LOAN_ID, EXAMPLE_STAMPS } from './stamps.example.ts';

/** [ALG.EXAMPLE] row 1: total 4658.47 = capital 821.80 + interest 2916.67 + insurance 525.00 + fixed 395.00. */
export const actualPaymentExample: ActualPayment = {
  id: 'e0000000-0000-4000-8000-000000000001',
  ...EXAMPLE_STAMPS,
  loanId: EXAMPLE_LOAN_ID,
  paidDate: '2025-02-27',
  installmentNumber: 1,
  total: '4658.47',
  breakdown: { capital: '821.80', interest: '2916.67', insurance: '525.00', fixedCharges: '395.00' },
  note: 'Cuota 1',
};
