import { describe, expect, it } from 'vitest';
import {
  baseRecordSchema,
  isValidIsoInstant,
  isValidLocalDate,
  isZeroRate,
  isoInstantSchema,
  localDateSchema,
  moneySchema,
  noteSchema,
  positiveMoneySchema,
  positiveRateSchema,
  rateSchema,
  signedMoneySchema,
} from './common.ts';

describe('LocalDate refinement', () => {
  it.each(['2025-02-28', '2028-02-29', '2000-02-29', '2025-12-31', '0001-01-01'])('accepts %s', (value) => {
    expect(isValidLocalDate(value)).toBe(true);
    expect(localDateSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    '2025-02-29',
    '1900-02-29',
    '2025-04-31',
    '2025-13-01',
    '2025-00-10',
    '0000-01-01',
    '2025-1-01',
    '2025-01-01T00:00:00Z',
    '',
  ])('rejects %s', (value) => {
    expect(isValidLocalDate(value)).toBe(false);
    expect(localDateSchema.safeParse(value).success).toBe(false);
  });

  it('rejects a Date object and a number', () => {
    expect(localDateSchema.safeParse(new Date('2025-02-28T00:00:00Z')).success).toBe(false);
    expect(localDateSchema.safeParse(20250228).success).toBe(false);
  });
});

describe('ISO instant refinement', () => {
  it('accepts toISOString output', () => {
    expect(isValidIsoInstant('2026-10-04T15:00:00.000Z')).toBe(true);
    expect(isoInstantSchema.safeParse('2026-10-04T15:00:00.000Z').success).toBe(true);
  });

  it.each([
    '2026-10-04T15:00:00Z',
    '2026-10-04T15:00:00.000+00:00',
    '2026-02-30T15:00:00.000Z',
    '2026-10-04 15:00:00.000Z',
  ])('rejects %s', (value) => {
    expect(isValidIsoInstant(value)).toBe(false);
  });

  it('rejects a Date object', () => {
    expect(isoInstantSchema.safeParse(new Date('2026-10-04T15:00:00.000Z')).success).toBe(false);
  });
});

describe('decimal strings', () => {
  it('money has exactly two decimals and is never a number', () => {
    expect(moneySchema.safeParse('500000.00').success).toBe(true);
    expect(moneySchema.safeParse('0.00').success).toBe(true);
    for (const bad of ['500000', '500000.0', '500000.000', '-1.00', '01.00', '1e5', '1,000.00', ' 1.00']) {
      expect(moneySchema.safeParse(bad).success).toBe(false);
    }
    expect(moneySchema.safeParse(500000).success).toBe(false);
  });

  it('positive money rejects 0.00', () => {
    expect(positiveMoneySchema.safeParse('0.00').success).toBe(false);
    expect(positiveMoneySchema.safeParse('0.01').success).toBe(true);
  });

  it('signed money allows negatives but not -0.00', () => {
    expect(signedMoneySchema.safeParse('-12.50').success).toBe(true);
    expect(signedMoneySchema.safeParse('12.50').success).toBe(true);
    expect(signedMoneySchema.safeParse('-0.00').success).toBe(false);
  });

  it('rates are non-negative fractions with at most 6 decimals and no exponent', () => {
    for (const ok of ['0', '0.07', '0.0126', '0.0026', '1', '0.000001', '0.123456']) {
      expect(rateSchema.safeParse(ok).success).toBe(true);
    }
    for (const bad of ['-0.07', '7%', '1e-2', '.07', '0.', '10.5', '0.12345678901', '0.1234567', '0.0000001']) {
      expect(rateSchema.safeParse(bad).success).toBe(false);
    }
    expect(rateSchema.safeParse(0.07).success).toBe(false);
  });

  it('isZeroRate and positiveRateSchema', () => {
    expect(isZeroRate('0')).toBe(true);
    expect(isZeroRate('0.0000')).toBe(true);
    expect(isZeroRate('0.0001')).toBe(false);
    expect(positiveRateSchema.safeParse('0.00').success).toBe(false);
    expect(positiveRateSchema.safeParse('0.02').success).toBe(true);
  });
});

describe('note and base record', () => {
  it('note is trimmed free text up to 500 characters', () => {
    expect(noteSchema.safeParse('Saldo del correo').success).toBe(true);
    expect(noteSchema.safeParse(' con espacio').success).toBe(false);
    expect(noteSchema.safeParse('').success).toBe(false);
    expect(noteSchema.safeParse('x'.repeat(501)).success).toBe(false);
  });

  it('base record requires uuid ids and nullable deletedAt', () => {
    const base = {
      id: 'a0000000-0000-4000-8000-000000000001',
      createdAt: '2026-10-04T15:00:00.000Z',
      updatedAt: '2026-10-04T15:00:00.000Z',
      updatedByDevice: 'd0000000-0000-4000-8000-000000000001',
      deletedAt: null,
    };
    expect(baseRecordSchema.safeParse(base).success).toBe(true);
    expect(baseRecordSchema.safeParse({ ...base, deletedAt: '2026-10-05T15:00:00.000Z' }).success).toBe(true);
    expect(baseRecordSchema.safeParse({ ...base, id: 'loan-1' }).success).toBe(false);
    expect(baseRecordSchema.safeParse({ ...base, extra: true }).success).toBe(false);
  });
});
