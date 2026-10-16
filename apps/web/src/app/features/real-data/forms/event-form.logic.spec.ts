import { describe, expect, it } from 'vitest';
import {
  type BuildContext,
  buildValue,
  dateBounds,
  dateError,
  emptyModel,
  type EventFormModel,
  integerError,
  moneyError,
  modelFromValue,
  suggestInstallment,
} from './event-form.logic.ts';

const LOAN_ID = 'a0000000-0000-4000-8000-000000000001';
const context: BuildContext = {
  loanId: LOAN_ID,
  currency: 'GTQ',
  rateType: 'VARIABLE',
  disbursementDate: '2026-01-10',
  firstDueDate: '2026-02-15',
  paymentDay: 15,
  endDate: '2046-01-15',
};

function model(patch: Partial<EventFormModel>): EventFormModel {
  return { ...emptyModel(), ...patch };
}

describe('dateBounds and dateError', () => {
  it('derives the bounds from the loan context', () => {
    expect(dateBounds(context)).toEqual({ min: '2026-01-10', max: '2046-01-15' });
  });

  it('requires a date', () => {
    expect(dateError('', dateBounds(context))).toBe('Escribe la fecha.');
  });

  it('rejects dates before the disbursement and after the loan end, in Spanish', () => {
    expect(dateError('2026-01-09', dateBounds(context))).toBe(
      'La fecha no puede ser anterior al desembolso del préstamo (10/01/2026).',
    );
    expect(dateError('2046-01-16', dateBounds(context))).toBe(
      'La fecha no puede ser posterior al fin del préstamo (15/01/2046).',
    );
  });

  it('accepts the bounds themselves', () => {
    expect(dateError('2026-01-10', dateBounds(context))).toBeUndefined();
    expect(dateError('2046-01-15', dateBounds(context))).toBeUndefined();
  });
});

describe('field rules', () => {
  it('checks money: required, non-negative, optionally positive', () => {
    expect(moneyError('', { positive: false })).toBe('Escribe un monto.');
    expect(moneyError('-5.00', { positive: false })).toBe('El monto no puede ser negativo.');
    expect(moneyError('0.00', { positive: true })).toBe('El monto debe ser mayor que cero.');
    expect(moneyError('0.00', { positive: false })).toBeUndefined();
    expect(moneyError('10.50', { positive: true })).toBeUndefined();
  });

  it('checks installment-like integers', () => {
    expect(integerError('', 1, 1200)).toBe('Escribe un número entero.');
    expect(integerError('1.5', 1, 1200)).toBe('Escribe un número entero, sin decimales.');
    expect(integerError('0', 1, 1200)).toBe('El número debe estar entre 1 y 1200.');
    expect(integerError('1201', 1, 1200)).toBe('El número debe estar entre 1 y 1200.');
    expect(integerError('12', 1, 1200)).toBeUndefined();
  });
});

describe('suggestInstallment ([ALG.EVENTS.ANCHOR] rule 2)', () => {
  it('suggests the first installment due on or after the date', () => {
    expect(suggestInstallment(context, '2026-02-15')).toBe('1');
    expect(suggestInstallment(context, '2026-02-16')).toBe('2');
    expect(suggestInstallment(context, '2026-05-01')).toBe('4');
  });

  it('suggests nothing without a date', () => {
    expect(suggestInstallment(context, '')).toBe('');
  });

  it('handles END_OF_MONTH', () => {
    const eom = { ...context, firstDueDate: '2026-02-28', paymentDay: 'END_OF_MONTH' as const };
    expect(suggestInstallment(eom, '2026-03-01')).toBe('2');
  });
});

describe('buildValue', () => {
  it('builds a ReportedBalance without installmentNumber and with a trimmed note', () => {
    const result = buildValue(
      'ReportedBalance',
      model({ date: '2026-05-15', balance: '480000.00', source: 'BANK_EMAIL', note: '  revisado  ' }),
      context,
    );
    expect(result).toEqual({
      ok: true,
      value: {
        entity: 'ReportedBalance',
        draft: { loanId: LOAN_ID, date: '2026-05-15', balance: '480000.00', source: 'BANK_EMAIL', note: 'revisado' },
      },
    });
  });

  it('keeps the informative ReportedBalance fields only when typed', () => {
    const result = buildValue(
      'ReportedBalance',
      model({
        date: '2026-05-15',
        installmentNumber: '4',
        balance: '480000.00',
        totalInstallment: '4658.47',
        reportedRate: '0.0725',
        source: 'OTHER',
      }),
      context,
    );
    expect(result).toEqual({
      ok: true,
      value: {
        entity: 'ReportedBalance',
        draft: {
          loanId: LOAN_ID,
          date: '2026-05-15',
          installmentNumber: 4,
          balance: '480000.00',
          totalInstallment: '4658.47',
          reportedRate: '0.0725',
          source: 'OTHER',
        },
      },
    });
  });

  it('builds an ActualPayment with paidDate and a complete breakdown', () => {
    const result = buildValue(
      'ActualPayment',
      model({
        date: '2026-03-14',
        installmentNumber: '2',
        total: '4658.47',
        breakdown: { capital: '800.00', interest: '3000.00', insurance: '500.00', fixedCharges: '358.47' },
      }),
      context,
    );
    expect(result).toEqual({
      ok: true,
      value: {
        entity: 'ActualPayment',
        draft: {
          loanId: LOAN_ID,
          paidDate: '2026-03-14',
          installmentNumber: 2,
          total: '4658.47',
          breakdown: { capital: '800.00', interest: '3000.00', insurance: '500.00', fixedCharges: '358.47' },
        },
      },
    });
  });

  it('rejects an ActualPayment with an incomplete breakdown', () => {
    const result = buildValue(
      'ActualPayment',
      model({
        date: '2026-03-14',
        installmentNumber: '2',
        total: '4658.47',
        breakdown: { capital: '800.00', interest: '', insurance: '', fixedCharges: '' },
      }),
      context,
    );
    expect(result.ok).toBe(false);
  });

  it('builds each policy of a RateChange', () => {
    const base = { date: '2026-06-15', interestRate: '0.0725' };
    expect(buildValue('RateChange', model({ ...base, policy: 'RECALC_INSTALLMENT_KEEP_TERM' }), context)).toEqual({
      ok: true,
      value: {
        entity: 'LoanEvent',
        draft: {
          loanId: LOAN_ID,
          date: '2026-06-15',
          type: 'RateChange',
          policy: 'RECALC_INSTALLMENT_KEEP_TERM',
          interestRate: '0.0725',
        },
      },
    });
    const bank = buildValue(
      'RateChange',
      model({ ...base, policy: 'BANK_INSTALLMENT', bankInstallment: '4300.00' }),
      context,
    );
    expect(bank.ok && bank.value.draft).toMatchObject({ policy: 'BANK_INSTALLMENT', bankInstallment: '4300.00' });
    // bankInstallment typed and then the policy switched: it must not leak into the DTO.
    const switched = buildValue(
      'RateChange',
      model({ ...base, policy: 'KEEP_INSTALLMENT_ADJUST_TERM', bankInstallment: '4300.00' }),
      context,
    );
    expect(switched.ok && 'bankInstallment' in switched.value.draft).toBe(false);
  });

  it('builds a FixedChargeChange with the complete list, even empty', () => {
    const full = buildValue(
      'FixedChargeChange',
      model({ date: '2026-06-15', fixedCharges: [{ label: ' IUSI ', amount: '350.00' }] }),
      context,
    );
    expect(full.ok && full.value.draft).toMatchObject({
      type: 'FixedChargeChange',
      fixedCharges: [{ label: 'IUSI', amount: '350.00' }],
    });
    const empty = buildValue('FixedChargeChange', model({ date: '2026-06-15' }), context);
    expect(empty.ok && empty.value.draft).toMatchObject({ type: 'FixedChargeChange', fixedCharges: [] });
  });

  it('builds a Prepayment with FLAT, PERCENT or no commission', () => {
    const base = { date: '2026-06-15', amount: '20000.00', mode: 'REDUCE_TERM' as const };
    const none = buildValue('Prepayment', model(base), context);
    expect(none.ok && 'commission' in none.value.draft).toBe(false);
    const flat = buildValue(
      'Prepayment',
      model({ ...base, commissionKind: 'FLAT', commissionAmount: '500.00' }),
      context,
    );
    expect(flat.ok && flat.value.draft).toMatchObject({ commission: { kind: 'FLAT', amount: '500.00' } });
    const percent = buildValue(
      'Prepayment',
      model({ ...base, commissionKind: 'PERCENT', commissionRate: '0.02' }),
      context,
    );
    expect(percent.ok && percent.value.draft).toMatchObject({ commission: { kind: 'PERCENT', rate: '0.02' } });
  });

  it('builds AdvanceInstallments with an integer count', () => {
    const result = buildValue('AdvanceInstallments', model({ date: '2026-06-15', count: '6' }), context);
    expect(result.ok && result.value.draft).toMatchObject({ type: 'AdvanceInstallments', count: 6 });
  });

  it('reports the first field the schema rejects, without leaking schema messages', () => {
    const result = buildValue(
      'Prepayment',
      model({ date: '2026-06-15', amount: '0.00', mode: 'REDUCE_TERM' }),
      context,
    );
    expect(result).toEqual({ ok: false, field: 'amount' });
  });

  it('maps schema issues of grouped fields to their control or fieldset', () => {
    const breakdown = buildValue(
      'ActualPayment',
      model({
        date: '2026-03-14',
        installmentNumber: '2',
        total: '4658.47',
        breakdown: { capital: '800.00', interest: '', insurance: '', fixedCharges: '' },
      }),
      context,
    );
    expect(breakdown).toEqual({ ok: false, field: 'breakdown' });
    const charges = buildValue(
      'FixedChargeChange',
      model({ date: '2026-06-15', fixedCharges: [{ label: '', amount: '350.00' }] }),
      context,
    );
    expect(charges).toEqual({ ok: false, field: 'fixedCharges' });
    const rate = buildValue(
      'Prepayment',
      model({
        date: '2026-06-15',
        amount: '100.00',
        mode: 'REDUCE_TERM',
        commissionKind: 'PERCENT',
        commissionRate: '0',
      }),
      context,
    );
    expect(rate).toEqual({ ok: false, field: 'commissionRate' });
    const installment = buildValue(
      'ActualPayment',
      model({ date: '2026-03-14', installmentNumber: '1201', total: '1.00' }),
      context,
    );
    expect(installment).toEqual({ ok: false, field: 'installmentNumber' });
  });

  it('names no field when the schema rejects something the form has no control for', () => {
    const result = buildValue('AdvanceInstallments', model({ date: '2026-06-15', count: '6' }), {
      ...context,
      loanId: 'not-a-uuid',
    });
    expect(result).toEqual({ ok: false, field: null });
  });
});

describe('modelFromValue', () => {
  it('round-trips every kind through buildValue', () => {
    const samples: EventFormModel[] = [
      model({ date: '2026-06-15', amount: '1000.00', mode: 'REDUCE_INSTALLMENT', note: 'Aguinaldo' }),
    ];
    const built = buildValue('Prepayment', samples[0] as EventFormModel, context);
    expect(built.ok).toBe(true);
    if (built.ok) {
      expect(modelFromValue('Prepayment', built.value)).toMatchObject({
        date: '2026-06-15',
        amount: '1000.00',
        mode: 'REDUCE_INSTALLMENT',
        note: 'Aguinaldo',
      });
    }
  });

  it('ignores a value of another kind', () => {
    const built = buildValue('AdvanceInstallments', model({ date: '2026-06-15', count: '3' }), context);
    expect(built.ok).toBe(true);
    if (built.ok) {
      expect(modelFromValue('Prepayment', built.value)).toEqual(emptyModel());
    }
  });

  it('tells apart insuranceRates undefined (unchanged) from [] (no insurance from k)', () => {
    const unchanged = buildValue(
      'RateChange',
      model({ date: '2026-06-15', policy: 'RECALC_INSTALLMENT_KEEP_TERM', interestRate: '0.07' }),
      context,
    );
    expect(unchanged.ok && 'insuranceRates' in unchanged.value.draft).toBe(false);
    const none = buildValue(
      'RateChange',
      model({ date: '2026-06-15', policy: 'RECALC_INSTALLMENT_KEEP_TERM', interestRate: '0.07', insuranceRates: [] }),
      context,
    );
    expect(none.ok && none.value.draft).toMatchObject({ insuranceRates: [] });
    if (none.ok) {
      expect(modelFromValue('RateChange', none.value).insuranceRates).toEqual([]);
    }
    if (unchanged.ok) {
      expect(modelFromValue('RateChange', unchanged.value).insuranceRates).toBeUndefined();
    }
    const onlyInsurance = buildValue(
      'RateChange',
      model({ date: '2026-06-15', policy: 'KEEP_INSTALLMENT_ADJUST_TERM', insuranceRates: [] }),
      context,
    );
    expect(onlyInsurance.ok && 'interestRate' in onlyInsurance.value.draft).toBe(false);
    expect(onlyInsurance.ok).toBe(true);
  });

  it('keeps insuranceRates of an existing RateChange', () => {
    const built = buildValue(
      'RateChange',
      model({ date: '2026-06-15', policy: 'RECALC_INSTALLMENT_KEEP_TERM', insuranceRates: ['0.01'] }),
      context,
    );
    expect(built.ok).toBe(true);
    if (built.ok) {
      expect(modelFromValue('RateChange', built.value).insuranceRates).toEqual(['0.01']);
    }
  });
});
