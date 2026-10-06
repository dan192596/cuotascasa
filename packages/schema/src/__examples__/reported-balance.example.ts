import type { ReportedBalance } from '../entities/reported-balance.ts';
import { EXAMPLE_LOAN_ID, EXAMPLE_STAMPS } from './stamps.example.ts';

/** [ALG.EXAMPLE] row 2: opening balance 499178.20 of installment 2, before paying it. */
export const reportedBalanceExample: ReportedBalance = {
  id: 'c0000000-0000-4000-8000-000000000001',
  ...EXAMPLE_STAMPS,
  loanId: EXAMPLE_LOAN_ID,
  date: '2025-03-05',
  installmentNumber: 2,
  balance: '499178.20',
  source: 'BANK_EMAIL',
  note: 'Saldo antes de pagar la cuota 2',
};
