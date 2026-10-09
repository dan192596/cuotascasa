import { type Currency, type LocalDate, type Money, type Rate } from '@cuotascasa/domain';
import { describe, expect, it } from 'vitest';
import { LocalDatePipe } from './local-date.pipe.ts';
import { MoneyPipe } from './money.pipe.ts';
import { RatePipe } from './rate.pipe.ts';

const money = new MoneyPipe();
const date = new LocalDatePipe();
const rate = new RatePipe();
const m = (value: string) => value as Money;

describe('MoneyPipe (es-GT)', () => {
  it('formats GTQ with Q and a space', () => {
    expect(money.transform(m('1234.5'), 'GTQ')).toBe('Q 1,234.50');
  });

  it('formats USD with US$ and a space', () => {
    expect(money.transform(m('1234.5'), 'USD')).toBe('US$ 1,234.50');
  });

  it('groups thousands and millions', () => {
    expect(money.transform(m('1234567.89'), 'GTQ')).toBe('Q 1,234,567.89');
    expect(money.transform(m('999.99'), 'GTQ')).toBe('Q 999.99');
    expect(money.transform(m('1000'), 'USD')).toBe('US$ 1,000.00');
  });

  it('shows zero as 0.00 with no sign, even for negative zero', () => {
    expect(money.transform(m('0'), 'GTQ')).toBe('Q 0.00');
    expect(money.transform(m('-0.00'), 'GTQ')).toBe('Q 0.00');
  });

  it('puts the minus sign before the symbol for negatives', () => {
    expect(money.transform(m('-1234.5'), 'GTQ')).toBe('-Q 1,234.50');
    expect(money.transform(m('-0.05'), 'USD')).toBe('-US$ 0.05');
  });

  it('returns an empty string for empty values', () => {
    expect(money.transform(null, 'GTQ')).toBe('');
    expect(money.transform(undefined, 'GTQ')).toBe('');
    expect(money.transform('', 'GTQ')).toBe('');
  });

  it('rejects text that is not a decimal money string instead of guessing', () => {
    expect(() => money.transform('1e3', 'GTQ')).toThrow();
    expect(() => money.transform('12.345', 'GTQ')).toThrow();
    expect(() => money.transform(m('1'), 'EUR' as Currency)).toThrow();
  });
});

describe('LocalDatePipe', () => {
  it('outputs dd/mm/aaaa', () => {
    expect(date.transform('2027-03-05' as LocalDate)).toBe('05/03/2027');
    expect(date.transform('2027-12-31' as LocalDate)).toBe('31/12/2027');
  });

  it('returns an empty string for empty values and throws for invalid dates', () => {
    expect(date.transform(null)).toBe('');
    expect(date.transform('')).toBe('');
    expect(() => date.transform('2027-02-31')).toThrow();
  });
});

describe('RatePipe', () => {
  it('shows a stored fraction as a percent with at least 2 decimals', () => {
    expect(rate.transform('0.0126' as Rate)).toBe('1.26 %');
    expect(rate.transform('0.07' as Rate)).toBe('7.00 %');
    expect(rate.transform('0.0725' as Rate)).toBe('7.25 %');
    expect(rate.transform('0.000001' as Rate)).toBe('0.0001 %');
    expect(rate.transform('0' as Rate)).toBe('0.00 %');
  });

  it('shifts rates with more than 4 percent decimals exactly instead of throwing', () => {
    expect(rate.transform('0.00583333' as Rate)).toBe('0.583333 %');
    expect(rate.transform('0.000001234' as Rate)).toBe('0.0001234 %');
    expect(rate.transform('1.5' as Rate)).toBe('150.00 %');
  });

  it('returns an empty string for empty values', () => {
    expect(rate.transform(null)).toBe('');
    expect(rate.transform('')).toBe('');
  });
});
