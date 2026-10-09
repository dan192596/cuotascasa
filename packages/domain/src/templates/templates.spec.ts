import { describe, expect, it } from 'vitest';
import { invalidInputCode, thrownBy } from '../../test/support/errors.ts';
import * as api from '../index.ts';
import { isRate, parseMoney } from '../money/index.ts';
import { TEMPLATE_IDS } from '../types/loan.ts';
import { InvalidInputError } from '../types/primitives.ts';
import { assertCatalogValid, deriveFixedCharges, instantiateTemplate, listTemplates } from './index.ts';
import type { Template } from '../types/loan.ts';

describe('listTemplates [ALG.TEMPLATES]', () => {
  it('returns FHA Guatemala v1 with the algorithm.md values', () => {
    const fha = listTemplates().find((t) => t.id === 'fha-gt');
    expect(fha).toEqual({
      id: 'fha-gt',
      version: 1,
      name: 'FHA Guatemala v1',
      values: {
        insuranceRates: [
          { kind: 'mortgageInsurance', rate: '0.01' },
          { kind: 'lifeInsurance', rate: '0.0026' },
        ],
        roundingProfile: 'FHA_GT_V1',
        paymentDay: 'END_OF_MONTH',
        rateType: 'VARIABLE',
        fixedCharges: [],
      },
    });
  });

  it('returns Hipotecario simple with interest only and nothing preloaded for day and rate type', () => {
    const simple = listTemplates().find((t) => t.id === 'simple');
    expect(simple).toEqual({
      id: 'simple',
      version: 1,
      name: 'Hipotecario simple',
      values: { insuranceRates: [], roundingProfile: 'SIMPLE', paymentDay: null, rateType: null, fixedCharges: [] },
    });
  });

  it('lists exactly the known ids, each once, with valid rates', () => {
    const list = listTemplates();
    expect(list.map((t) => t.id).sort()).toEqual([...TEMPLATE_IDS].sort());
    for (const template of list) {
      expect(Number.isInteger(template.version) && template.version >= 1).toBe(true);
      for (const insurance of template.values.insuranceRates) {
        expect(isRate(insurance.rate)).toBe(true);
      }
    }
  });

  it('the public API forwards to the templates', () => {
    expect(api.listTemplates()).toEqual(listTemplates());
  });
});

describe('instantiateTemplate', () => {
  it('returns the template values with the templateRef', () => {
    const instance = instantiateTemplate({ id: 'fha-gt', version: 1 });
    expect(instance.templateRef).toEqual({ id: 'fha-gt', version: 1 });
    expect(instance.roundingProfile).toBe('FHA_GT_V1');
    expect(instance.insuranceRates.map((i) => i.rate)).toEqual(['0.01', '0.0026']);
    expect(instance.paymentDay).toBe('END_OF_MONTH');
  });

  it('returns a deep copy: mutating it leaves the template unchanged', () => {
    const before = JSON.stringify(listTemplates());
    const instance = instantiateTemplate({ id: 'fha-gt', version: 1 });
    instance.insuranceRates.push({ kind: 'other', rate: '0.5' as never });
    instance.insuranceRates[0] = { kind: 'other', rate: '0.9' as never };
    instance.fixedCharges.push({ label: 'IUSI', amount: parseMoney('1.00') });
    instance.templateRef = { id: 'simple', version: 9 };
    instance.paymentDay = 5 as never;
    instance.roundingProfile = 'SIMPLE';
    expect(JSON.stringify(listTemplates())).toBe(before);
    expect(instantiateTemplate({ id: 'fha-gt', version: 1 }).insuranceRates).toHaveLength(2);
  });

  it('two instances are independent', () => {
    const a = instantiateTemplate({ id: 'simple', version: 1 });
    const b = instantiateTemplate({ id: 'simple', version: 1 });
    a.fixedCharges.push({ label: 'x', amount: parseMoney('1.00') });
    expect(b.fixedCharges).toEqual([]);
  });

  it('mutating a listTemplates result does not alter later results', () => {
    const before = JSON.stringify(listTemplates());
    const list = listTemplates() as unknown as { values: { insuranceRates: unknown[] } }[];
    list[0]?.values.insuranceRates.push({});
    expect(JSON.stringify(listTemplates())).toBe(before);
  });

  it('an unknown id or version is an InvalidInputError UNKNOWN_TEMPLATE', () => {
    expect(invalidInputCode(() => instantiateTemplate({ id: 'fha-gt', version: 2 }))).toBe('UNKNOWN_TEMPLATE');
    expect(invalidInputCode(() => instantiateTemplate({ id: 'nope' as never, version: 1 }))).toBe('UNKNOWN_TEMPLATE');
    const error = thrownBy(() => instantiateTemplate({ id: 'nope' as never, version: 1 }));
    expect(error).toBeInstanceOf(InvalidInputError);
    expect((error as InvalidInputError).rule).toBe('ALG.TEMPLATES');
  });
});

describe('deriveFixedCharges [ALG.TEMPLATES.FIXED]', () => {
  it('is bankTotal - level', () => {
    expect(deriveFixedCharges(parseMoney('4658.47'), parseMoney('4263.47'))).toBe('395.00');
    expect(deriveFixedCharges(parseMoney('4263.47'), parseMoney('4263.47'))).toBe('0.00');
  });

  it('a negative result is a typed error', () => {
    expect(invalidInputCode(() => deriveFixedCharges(parseMoney('4263.46'), parseMoney('4263.47')))).toBe(
      'NEGATIVE_FIXED_CHARGES',
    );
    const error = thrownBy(() => api.deriveFixedCharges(parseMoney('1.00'), parseMoney('2.00')));
    expect((error as InvalidInputError).rule).toBe('ALG.TEMPLATES.FIXED');
  });
});

describe('templates are validated at load', () => {
  const [good] = listTemplates() as [Template];
  const withValues = (values: Partial<Template['values']>): Template => ({
    ...good,
    values: { ...good.values, ...values },
  });

  it('accepts the shipped catalog', () => {
    expect(() => assertCatalogValid(listTemplates())).not.toThrow();
  });

  it.each([
    ['unknown id', { ...good, id: 'x' as never }],
    ['version 0', { ...good, version: 0 }],
    ['fractional version', { ...good, version: 1.5 }],
    ['empty name', { ...good, name: '' }],
    ['bad insurance rate', withValues({ insuranceRates: [{ kind: 'other', rate: '1e-2' as never }] })],
    ['bad rounding profile', withValues({ roundingProfile: 'X' as never })],
    ['bad payment day', withValues({ paymentDay: 32 as never })],
    ['fractional payment day', withValues({ paymentDay: 1.5 as never })],
    ['bad rate type', withValues({ rateType: 'X' as never })],
  ])('rejects %s', (_name, template) => {
    expect(invalidInputCode(() => assertCatalogValid([template]))).toBe('INVALID_TERMS');
  });

  it('rejects a duplicated id and version', () => {
    expect(invalidInputCode(() => assertCatalogValid([good, good]))).toBe('INVALID_TERMS');
  });

  it('accepts a numeric payment day and a null rate type', () => {
    expect(() => assertCatalogValid([withValues({ paymentDay: 15 as never, rateType: null })])).not.toThrow();
  });
});
