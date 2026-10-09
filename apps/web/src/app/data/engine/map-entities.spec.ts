import { InvalidInputError, type LocalDate, type Money, type Rate } from '@cuotascasa/domain';
import { describe, expect, it } from 'vitest';
import {
  makeBalance,
  makeLoan,
  makeLoanDraft,
  makePayment,
  makePrepayment,
  makeRateChange,
  makeScenarioPrepayment,
  uuid,
} from './testing/fixtures.ts';
import {
  toActualPaymentEvent,
  toHypotheticalEvent,
  toLoanTerms,
  toRealLoanEvent,
  toReportedBalanceEvent,
} from './map-entities.ts';

const money = (value: string): Money => value as Money;
const rate = (value: string): Rate => value as Rate;
const date = (value: string): LocalDate => value as LocalDate;

describe('toLoanTerms', () => {
  it('maps every term field of the loan', () => {
    const terms = toLoanTerms(makeLoan());
    expect(terms).toEqual({
      principal: money('500000.00'),
      termMonths: 240,
      disbursementDate: date('2025-01-15'),
      firstDueDate: date('2025-02-28'),
      paymentDay: 'END_OF_MONTH',
      currency: 'GTQ',
      interestRate: rate('0.07'),
      insuranceRates: [rate('0.01'), rate('0.0026')],
      fixedCharges: [
        { label: 'IUSI', amount: money('350.00'), effectiveFrom: date('2025-02-28') },
        { label: 'Seguro de danos', amount: money('45.00'), effectiveFrom: date('2025-02-28') },
      ],
      roundingProfile: 'FHA_GT_V1',
      rateType: 'VARIABLE',
    });
  });

  it('keeps END_OF_MONTH and a numeric payment day as the domain expects them', () => {
    expect(toLoanTerms(makeLoan({ paymentDay: 'END_OF_MONTH' })).paymentDay).toBe('END_OF_MONTH');
    const numeric = toLoanTerms(makeLoan({ paymentDay: 15, firstDueDate: '2025-02-15' }));
    expect(numeric.paymentDay).toBe(15);
  });

  it('keeps the effective date of each fixed charge, including a charge that starts later', () => {
    const terms = toLoanTerms(
      makeLoan({
        fixedCharges: [
          { label: 'IUSI', amount: '350.00', effectiveFrom: '2025-02-28' },
          { label: 'Seguro', amount: '45.00', effectiveFrom: '2026-03-31' },
        ],
      }),
    );
    expect(terms.fixedCharges.map((charge) => charge.effectiveFrom)).toEqual(['2025-02-28', '2026-03-31']);
  });

  it('copies the template values stored in the loan (insurance rates, rounding profile, rate type)', () => {
    const terms = toLoanTerms(
      makeLoan({ insuranceRates: ['0.005'], roundingProfile: 'SIMPLE', rateType: 'FIXED', currency: 'USD' }),
    );
    expect(terms.insuranceRates).toEqual(['0.005']);
    expect(terms.roundingProfile).toBe('SIMPLE');
    expect(terms.rateType).toBe('FIXED');
    expect(terms.currency).toBe('USD');
  });

  it('maps a draft without id and stamps', () => {
    const draft = makeLoanDraft();
    expect(toLoanTerms(draft).principal).toBe('500000.00');
  });

  it.each([
    ['a principal with a comma', { principal: '500,000.00' }],
    ['a principal of zero', { principal: '0.00' }],
    ['a fractional term', { termMonths: 12.5 }],
    ['a zero term', { termMonths: 0 }],
    ['a rate in exponent form', { interestRate: '7e-2' }],
    ['an impossible date', { firstDueDate: '2025-02-30' }],
    ['an unknown currency', { currency: 'EUR' as 'GTQ' }],
    ['an unknown rounding profile', { roundingProfile: 'X' as 'SIMPLE' }],
    ['an invalid payment day', { paymentDay: 40 as 31 }],
    ['a first due date that breaks the payment day', { paymentDay: 15 as const }],
  ])('throws the domain InvalidInputError for %s', (_label, patch) => {
    expect(() => toLoanTerms(makeLoan(patch))).toThrow(InvalidInputError);
  });

  it('throws InvalidInputError for a malformed fixed charge', () => {
    const loan = makeLoan({ fixedCharges: [{ label: 'x', amount: '1.234', effectiveFrom: '2025-02-28' }] });
    expect(() => toLoanTerms(loan)).toThrow(InvalidInputError);
  });
});

describe('toReportedBalanceEvent', () => {
  it('maps the anchor with its explicit installment and informative fields', () => {
    const event = toReportedBalanceEvent(
      makeBalance({
        id: uuid(10),
        date: '2025-06-30',
        installmentNumber: 5,
        balance: '495834.02',
        reportedRate: '0.07',
        totalInstallment: '4658.47',
      }),
    );
    expect(event).toEqual({
      type: 'ReportedBalance',
      id: uuid(10),
      date: '2025-06-30',
      balance: '495834.02',
      installmentNumber: 5,
      reportedRate: '0.07',
      totalInstallment: '4658.47',
    });
  });

  it('omits the optional fields that are absent', () => {
    const event = toReportedBalanceEvent(makeBalance({ id: uuid(10) }));
    expect(Object.keys(event).sort()).toEqual(['balance', 'date', 'id', 'type']);
  });

  it('rejects a malformed balance', () => {
    expect(() => toReportedBalanceEvent(makeBalance({ id: uuid(10), balance: '12.345' }))).toThrow(InvalidInputError);
  });
});

describe('toActualPaymentEvent', () => {
  it('uses paidDate as the event date and carries installmentNumber and total', () => {
    const event = toActualPaymentEvent(makePayment({ id: uuid(11), paidDate: '2025-03-05', installmentNumber: 1 }));
    expect(event).toEqual({
      type: 'ActualPayment',
      id: uuid(11),
      date: '2025-03-05',
      installmentNumber: 1,
      total: '4658.47',
    });
  });

  it('carries the four components of the breakdown', () => {
    const breakdown = { capital: '821.80', interest: '2916.67', insurance: '525.00', fixedCharges: '395.00' };
    const event = toActualPaymentEvent(makePayment({ id: uuid(11), breakdown }));
    expect(event.breakdown).toEqual(breakdown);
  });
});

describe('toRealLoanEvent / toHypotheticalEvent', () => {
  it('maps a Prepayment with and without commission', () => {
    expect(toRealLoanEvent(makePrepayment({ id: uuid(12) }))).toEqual({
      type: 'Prepayment',
      id: uuid(12),
      date: '2026-01-15',
      amount: '20000.00',
      mode: 'REDUCE_TERM',
    });
    const flat = toRealLoanEvent(
      makePrepayment({ id: uuid(12), commission: { kind: 'FLAT', amount: '100.00' } } as never),
    );
    expect(flat).toMatchObject({ commission: { kind: 'FLAT', amount: '100.00' } });
    const percent = toRealLoanEvent(
      makePrepayment({ id: uuid(12), commission: { kind: 'PERCENT', rate: '0.02' } } as never),
    );
    expect(percent).toMatchObject({ commission: { kind: 'PERCENT', rate: '0.02' } });
  });

  it('maps a RateChange with the optional interest and insurance rates', () => {
    expect(toRealLoanEvent(makeRateChange({ id: uuid(13) }))).toEqual({
      type: 'RateChange',
      id: uuid(13),
      date: '2026-06-30',
      policy: 'RECALC_INSTALLMENT_KEEP_TERM',
      interestRate: '0.08',
    });
    const both = toRealLoanEvent(
      makeRateChange({
        id: uuid(13),
        interestRate: undefined,
        insuranceRates: ['0.01'],
      } as never),
    );
    expect(both).toMatchObject({ insuranceRates: ['0.01'] });
    expect('interestRate' in both).toBe(false);
  });

  it('maps BANK_INSTALLMENT with its installment and rejects one without it', () => {
    const ok = toRealLoanEvent(
      makeRateChange({ id: uuid(13), policy: 'BANK_INSTALLMENT', bankInstallment: '4100.00' } as never),
    );
    expect(ok).toMatchObject({ policy: 'BANK_INSTALLMENT', bankInstallment: '4100.00' });
    expect(() => toRealLoanEvent(makeRateChange({ id: uuid(13), policy: 'BANK_INSTALLMENT' } as never))).toThrow(
      InvalidInputError,
    );
  });

  it('maps FixedChargeChange and AdvanceInstallments', () => {
    const fixed = toRealLoanEvent({
      ...makePrepayment({ id: uuid(14) }),
      type: 'FixedChargeChange',
      fixedCharges: [{ label: 'IUSI', amount: '360.00' }],
    } as never);
    expect(fixed).toEqual({
      type: 'FixedChargeChange',
      id: uuid(14),
      date: '2026-01-15',
      fixedCharges: [{ label: 'IUSI', amount: '360.00' }],
    });
    const advance = toRealLoanEvent({
      ...makePrepayment({ id: uuid(15) }),
      type: 'AdvanceInstallments',
      count: 6,
    } as never);
    expect(advance).toEqual({ type: 'AdvanceInstallments', id: uuid(15), date: '2026-01-15', count: 6 });
  });

  it('maps a scenario event like a real one (deletedAt and note are not carried)', () => {
    expect(toHypotheticalEvent(makeScenarioPrepayment({ id: uuid(16), note: 'idea' }))).toEqual({
      type: 'Prepayment',
      id: uuid(16),
      date: '2027-01-15',
      amount: '10000.00',
      mode: 'REDUCE_TERM',
    });
  });
});
