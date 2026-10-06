import type { Loan } from '../entities/loan.ts';
import { EXAMPLE_LOAN_ID, EXAMPLE_STAMPS } from './stamps.example.ts';

/** [ALG.EXAMPLE]: Q500,000.00, 240 months, i = 0.07, f = 0.01 + 0.0026, first due 2025-02-28, END_OF_MONTH. */
export const loanExample: Loan = {
  id: EXAMPLE_LOAN_ID,
  ...EXAMPLE_STAMPS,
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
  fixedCharges: [
    { label: 'IUSI', amount: '350.00', effectiveFrom: '2025-02-28' },
    { label: 'Seguro de daños', amount: '45.00', effectiveFrom: '2025-02-28' },
  ],
  roundingProfile: 'FHA_GT_V1',
  templateRef: { id: 'fha-gt', version: 1 },
  status: 'active',
};
