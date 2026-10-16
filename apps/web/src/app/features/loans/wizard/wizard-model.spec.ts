import { listTemplates } from '@cuotascasa/domain';
import { describe, expect, it } from 'vitest';
import { describeError } from './wizard-messages.ts';
import {
  applyTemplate,
  type Breakdown,
  dueDateOfInstallment,
  fixedChargeBreakdown,
  initialModel,
  levelOf,
  rederiveFirstDueDate,
  toAnchorDraft,
  toLoanDraft,
  type WizardModel,
} from './wizard-model.ts';
import { InvalidInputError, NegativeAmortizationError, parseMoney, ZERO_MONEY } from '@cuotascasa/domain';
import { DataError } from '../../../data/api.ts';

function model(overrides: Partial<WizardModel> = {}): WizardModel {
  return {
    ...initialModel(),
    name: '  Casa de prueba ',
    bank: ' Banco Ficticio ',
    principal: '500000.00',
    termMonths: '240',
    interestRate: '0.07',
    paymentDay: 'END_OF_MONTH',
    firstDueDate: '2027-01-31',
    disbursementDate: '2026-12-15',
    insurance: [],
    ...overrides,
  };
}

describe('templates', () => {
  it('fha-gt@1 preloads insurance rows, rounding profile, payment day and VARIABLE', () => {
    const copy = initialModel();
    expect(copy.templateKey).toBe('fha-gt@1');
    expect(copy.insurance).toEqual([
      { kind: 'mortgageInsurance', rate: '0.01' },
      { kind: 'lifeInsurance', rate: '0.0026' },
    ]);
    expect(copy.roundingProfile).toBe('FHA_GT_V1');
    expect(copy.paymentDay).toBe('END_OF_MONTH');
    expect(copy.rateType).toBe('VARIABLE');
  });

  it('editing the copy leaves the template unchanged', () => {
    const before = JSON.stringify(listTemplates());
    const copy = initialModel();
    copy.insurance[0]!.rate = '0.5';
    copy.insurance.push({ kind: 'other', rate: '0.1' });
    expect(JSON.stringify(listTemplates())).toBe(before);
    expect(initialModel().insurance[0]!.rate).toBe('0.01');
  });

  it('a template that leaves paymentDay and rateType to the user keeps the user choice', () => {
    const next = applyTemplate({ ...initialModel(), paymentDay: '15', rateType: 'FIXED' }, 'simple@1');
    expect(next.templateKey).toBe('simple@1');
    expect(next.insurance).toEqual([]);
    expect(next.roundingProfile).toBe('SIMPLE');
    expect(next.paymentDay).toBe('15');
    expect(next.rateType).toBe('FIXED');
  });

  it('an unknown template key raises the domain UNKNOWN_TEMPLATE error', () => {
    expect(() => applyTemplate(initialModel(), 'nope@1')).toThrow(InvalidInputError);
  });
});

describe('rederiveFirstDueDate ([ALG.DATES])', () => {
  it.each([
    ['2027-03-15', 'END_OF_MONTH', '2027-03-31'],
    ['2027-03-31', '15', '2027-03-15'],
    ['2027-02-15', '31', '2027-02-28'],
    ['', '15', ''],
    ['2027-03-15', '', '2027-03-15'],
  ])('%s with %s → %s', (date, day, expected) => {
    expect(rederiveFirstDueDate(date, day)).toBe(expected);
  });
});

describe('toLoanDraft', () => {
  it('stores rates as fractions, trims text, copies the templateRef and effectiveFrom = firstDueDate', () => {
    const draft = toLoanDraft(model({ insurance: [{ kind: 'other', rate: '0.0126' }] }), [
      { label: 'IUSI', amount: parseMoney('350.00') },
    ]);
    expect(draft).toEqual({
      name: 'Casa de prueba',
      bank: 'Banco Ficticio',
      currency: 'GTQ',
      principal: '500000.00',
      termMonths: 240,
      disbursementDate: '2026-12-15',
      firstDueDate: '2027-01-31',
      paymentDay: 'END_OF_MONTH',
      interestRate: '0.07',
      rateType: 'VARIABLE',
      insuranceRates: ['0.0126'],
      fixedCharges: [{ label: 'IUSI', amount: '350.00', effectiveFrom: '2027-01-31' }],
      roundingProfile: 'FHA_GT_V1',
      templateRef: { id: 'fha-gt', version: 1 },
      status: 'active',
    });
  });

  it('stores a numeric paymentDay as a number', () => {
    expect(toLoanDraft(model({ paymentDay: '15', firstDueDate: '2027-01-15' }), []).paymentDay).toBe(15);
  });

  it('refuses an incomplete model with the domain error', () => {
    expect(() => toLoanDraft(model({ rateType: '' }), [])).toThrow(InvalidInputError);
  });
});

describe('toAnchorDraft', () => {
  it('uses the chosen source and the installment number', () => {
    expect(
      toAnchorDraft(
        model({ anchorBalance: '1000.5', anchorK: '3', anchorDate: '2027-03-31', anchorSource: 'BANK_EMAIL' }),
      ),
    ).toEqual({ date: '2027-03-31', installmentNumber: 3, balance: '1000.50', source: 'BANK_EMAIL' });
  });
});

describe('dueDateOfInstallment', () => {
  it('is the due date of k, or null out of range', () => {
    expect(dueDateOfInstallment(model({ anchorK: '2' }))).toBe('2027-02-28');
    expect(dueDateOfInstallment(model({ anchorK: '241' }))).toBeNull();
    expect(dueDateOfInstallment(model({ anchorK: '0' }))).toBeNull();
  });
});

describe('fixed-charge breakdown ([ALG.TEMPLATES.FIXED])', () => {
  const base = model();
  const level = levelOf(base);

  it('level comes from the domain levelPayment (500,000.00, 20 years, 7 %: 3,876.49 without insurance)', () => {
    expect(level).toBe('3876.49');
  });

  it('an empty bank total stores no fixed charges', () => {
    expect(fixedChargeBreakdown(base, level)).toEqual<Breakdown>({ state: 'none', total: ZERO_MONEY, lines: [] });
  });

  it('bank total − level, as one «Cargos fijos» line when none is named', () => {
    const result = fixedChargeBreakdown({ ...base, bankTotal: '4271.49' }, level);
    expect(result).toEqual({ state: 'ok', total: '395.00', lines: [{ label: 'Cargos fijos', amount: '395.00' }] });
  });

  it('a bank total equal to the level stores nothing', () => {
    expect(fixedChargeBreakdown({ ...base, bankTotal: level }, level)).toEqual({
      state: 'ok',
      total: '0.00',
      lines: [],
    });
  });

  it('is negative when the bank total is below the level', () => {
    expect(fixedChargeBreakdown({ ...base, bankTotal: '100.00' }, level).state).toBe('negative');
  });

  it('named lines must add up to the difference', () => {
    const ok = fixedChargeBreakdown(
      {
        ...base,
        bankTotal: '4271.49',
        charges: [
          { label: 'IUSI', amount: '350.00' },
          { label: 'Seguro de daños', amount: '45.00' },
        ],
      },
      level,
    );
    expect(ok.state).toBe('ok');
    expect(ok.lines).toHaveLength(2);
    const bad = fixedChargeBreakdown(
      { ...base, bankTotal: '4271.49', charges: [{ label: 'IUSI', amount: '350.00' }] },
      level,
    );
    expect(bad.state).toBe('mismatch');
  });
});

describe('describeError maps by type and code, never by message', () => {
  it('shows no amount that the error message carries', () => {
    const negative = new NegativeAmortizationError('ALG.TERM', 7, parseMoney('123456.78'), parseMoney('654321.00'));
    const text = describeError(negative);
    expect(text).toContain('cuota 7');
    expect(text).not.toContain('123456');
    expect(text).not.toContain('654321');
  });

  it('maps InvalidInputError codes', () => {
    expect(describeError(new InvalidInputError('FIRST_DUE_DATE_MISMATCH', 'x 999'))).toContain('primera cuota');
    expect(describeError(new InvalidInputError('INSTALLMENT_OUT_OF_RANGE', 'x', { k: 0, max: 240 }))).toBe(
      'La cuota debe estar entre 1 y 240.',
    );
    expect(describeError(new InvalidInputError('INSTALLMENT_OUT_OF_RANGE', 'x'), 120)).toBe(
      'La cuota debe estar entre 1 y 120.',
    );
    expect(describeError(new InvalidInputError('NEGATIVE_FIXED_CHARGES', 'x'))).toContain('cuota nivelada');
  });

  it('maps DataError codes and falls back for anything else', () => {
    expect(describeError(new DataError('STORAGE'))).toContain('almacenamiento');
    expect(describeError(new DataError('VALIDATION', 'q 1,234'))).toContain('No se escribió nada');
    expect(describeError(new Error('Q 9,999.99'))).not.toContain('9,999');
  });
});
