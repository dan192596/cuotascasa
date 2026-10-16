import { InvalidInputError, moneyAdd, NegativeAmortizationError, type Money } from '@cuotascasa/domain';
import type { Loan, Uuid } from '@cuotascasa/schema';
import { describe, expect, it } from 'vitest';
import { DataError } from '../../../data/api.ts';
import { levelOf } from '../wizard/wizard-model.ts';
import {
  bankTotalOf,
  describeActionError,
  insuranceLines,
  modelOfLoan,
  paymentDayLabel,
  templateLabel,
  toLoanUpdate,
} from './loan-detail-model.ts';

const LOAN_ID = '00000000-0000-4000-8000-0000000000aa' as Uuid;

/** Synthetic loan: round figures, nothing real. */
function loan(over: Partial<Loan> = {}): Loan {
  return {
    id: LOAN_ID,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    updatedByDevice: '00000000-0000-4000-8000-0000000000bb',
    deletedAt: null,
    name: 'Casa A',
    bank: 'Banco Ficticio',
    currency: 'GTQ',
    principal: '500000.00',
    termMonths: 240,
    disbursementDate: '2026-12-15',
    firstDueDate: '2027-01-31',
    paymentDay: 'END_OF_MONTH',
    interestRate: '0.07',
    insuranceRates: ['0.01', '0.0026'],
    fixedCharges: [],
    roundingProfile: 'FHA_GT_V1',
    rateType: 'FIXED',
    templateRef: { id: 'fha-gt', version: 1 },
    status: 'active',
    ...over,
  } as Loan;
}

describe('modelOfLoan', () => {
  it('maps every stored field to the text model of the wizard steps', () => {
    const model = modelOfLoan(loan({ paymentDay: 15, firstDueDate: '2027-01-15' as Loan['firstDueDate'] }));
    expect(model).toMatchObject({
      templateKey: 'fha-gt@1',
      name: 'Casa A',
      bank: 'Banco Ficticio',
      currency: 'GTQ',
      principal: '500000.00',
      termMonths: '240',
      interestRate: '0.07',
      rateType: 'FIXED',
      paymentDay: '15',
      firstDueDate: '2027-01-15',
      disbursementDate: '2026-12-15',
      roundingProfile: 'FHA_GT_V1',
      bankTotal: '',
      charges: [],
    });
  });

  it('writes END_OF_MONTH as the select value', () => {
    expect(modelOfLoan(loan()).paymentDay).toBe('END_OF_MONTH');
  });

  it('recovers the insurance kinds from the template catalog by position, «other» beyond it', () => {
    const model = modelOfLoan(loan({ insuranceRates: ['0.01', '0.0026', '0.005'] as Loan['insuranceRates'] }));
    expect(model.insurance.map((row) => row.kind)).toEqual(['mortgageInsurance', 'lifeInsurance', 'other']);
    expect(model.insurance.map((row) => row.rate)).toEqual(['0.01', '0.0026', '0.005']);
  });

  it('keeps «other» for a template that is not in the catalog', () => {
    const model = modelOfLoan(loan({ templateRef: { id: 'custom', version: 7 } }));
    expect(model.insurance.map((row) => row.kind)).toEqual(['other', 'other']);
  });

  it('rebuilds the bank total as level + named fixed charges so the breakdown is unchanged', () => {
    const charges = [
      { label: 'IUSI', amount: '250.00', effectiveFrom: '2027-01-31' },
      { label: 'Seguro de daños', amount: '145.00', effectiveFrom: '2027-01-31' },
    ] as Loan['fixedCharges'];
    const model = modelOfLoan(loan({ fixedCharges: charges }));
    expect(model.charges).toEqual([
      { label: 'IUSI', amount: '250.00' },
      { label: 'Seguro de daños', amount: '145.00' },
    ]);
    expect(model.bankTotal).toBe(moneyAdd(levelOf(model), '395.00' as Money));
  });
});

describe('bankTotalOf', () => {
  it('adds the parseable amounts and ignores empty or malformed rows', () => {
    const level = '1000.00' as Money;
    expect(
      bankTotalOf(level, [
        { label: 'A', amount: '10.50' },
        { label: '', amount: '' },
        { label: 'B', amount: 'abc' },
        { label: 'C', amount: '2' },
      ]),
    ).toBe('1012.50');
  });
});

describe('toLoanUpdate', () => {
  it('keeps id, status and template of the stored loan and takes the edited terms', () => {
    const stored = loan({ status: 'archived' });
    const model = { ...modelOfLoan(stored), principal: '600000', name: ' Casa B ' };
    const update = toLoanUpdate(stored, model, []);
    expect(update.id).toBe(LOAN_ID);
    expect(update.status).toBe('archived');
    expect(update.templateRef).toEqual({ id: 'fha-gt', version: 1 });
    expect(update.principal).toBe('600000.00');
    expect(update.name).toBe('Casa B');
    expect('createdAt' in update).toBe(false);
  });

  it('follows a new first due date for charges that started at the old one, and keeps later starts', () => {
    const stored = loan({
      fixedCharges: [
        { label: 'IUSI', amount: '250.00', effectiveFrom: '2027-01-31' },
        { label: 'Seguro', amount: '145.00', effectiveFrom: '2028-01-31' },
      ] as Loan['fixedCharges'],
    });
    const model = { ...modelOfLoan(stored), firstDueDate: '2027-02-28' };
    const update = toLoanUpdate(stored, model, [
      { label: 'IUSI', amount: '250.00' as Money },
      { label: 'Seguro', amount: '145.00' as Money },
      { label: 'Nuevo', amount: '1.00' as Money },
    ]);
    expect(update.fixedCharges.map((charge) => charge.effectiveFrom)).toEqual([
      '2027-02-28',
      '2028-01-31',
      '2027-02-28',
    ]);
  });
});

describe('labels', () => {
  it('names the template and falls back to its reference', () => {
    expect(templateLabel({ id: 'fha-gt', version: 1 })).toContain('FHA');
    expect(templateLabel({ id: 'custom', version: 3 })).toBe('custom (versión 3)');
  });

  it('writes the payment day', () => {
    expect(paymentDayLabel('END_OF_MONTH')).toBe('Fin de mes');
    expect(paymentDayLabel(15)).toBe('Día 15');
  });

  it('labels the insurance rows', () => {
    expect(insuranceLines(loan()).map((line) => line.label)).toEqual([
      'Seguro FHA / seguro de hipoteca',
      'Desgravamen',
    ]);
  });
});

describe('describeActionError', () => {
  it('maps data errors by code and never shows the message', () => {
    expect(describeActionError(new DataError('NOT_FOUND', 'secret 123.45'))).toContain('ya no existe');
    expect(describeActionError(new DataError('CURRENCY_LOCKED', 'secret'))).toContain('moneda');
    expect(describeActionError(new DataError('STORAGE'))).toContain('almacenamiento');
    expect(describeActionError(new DataError('VALIDATION'))).not.toContain('VALIDATION');
  });

  it('delegates domain errors to the wizard texts and falls back to a generic one', () => {
    expect(describeActionError(new InvalidInputError('FIRST_DUE_DATE_MISMATCH', 'x'))).toContain('primera cuota');
    expect(
      describeActionError(new NegativeAmortizationError('ALG.TERM', 3, '1.00' as Money, '2.00' as Money)),
    ).toContain('cuota 3');
    expect(describeActionError(new Error('boom 99.00'))).not.toContain('99.00');
  });
});
