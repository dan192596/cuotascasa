import { describe, expect, it } from 'vitest';
import {
  DATE_FORMAT_MESSAGE,
  DATE_INVALID_MESSAGE,
  MONEY_DECIMALS_MESSAGE,
  MONEY_NOT_NUMBER_MESSAGE,
  parseDateText,
  parseMoneyText,
  parseRateText,
  RATE_DECIMALS_MESSAGE,
  RATE_NEGATIVE_MESSAGE,
  RATE_NOT_NUMBER_MESSAGE,
} from './input-parsers.ts';

const error = (message: string) => expect.objectContaining({ error: expect.objectContaining({ message }) });

describe('parseMoneyText', () => {
  it.each([
    ['1,234.56', '1234.56'],
    ['Q1234.5', '1234.50'],
    ['Q 1,234.5', '1234.50'],
    ['US$ 99', '99.00'],
    ['1234', '1234.00'],
    ['  0.05 ', '0.05'],
    ['1,234,567.89', '1234567.89'],
    ['-12.5', '-12.50'],
    ['-0', '0.00'],
    ['', ''],
  ])('accepts %j as %j', (text, value) => {
    expect(parseMoneyText(text)).toEqual({ value });
  });

  it('rejects more than 2 decimals', () => {
    expect(parseMoneyText('12.345')).toEqual(error(MONEY_DECIMALS_MESSAGE));
    expect(parseMoneyText('Q1,000.001')).toEqual(error(MONEY_DECIMALS_MESSAGE));
  });

  it.each(['abc', '12a', '1e3', 'Q', '1.2.3', '12.', '.5', '1,23', '1,2345.00', '--5', '1 000', 'EUR 5'])(
    'rejects %j as not a number',
    (text) => {
      expect(parseMoneyText(text)).toEqual(error(MONEY_NOT_NUMBER_MESSAGE));
    },
  );

  it('uses exact Spanish messages', () => {
    expect(MONEY_DECIMALS_MESSAGE).toBe('Usa como máximo 2 decimales.');
    expect(MONEY_NOT_NUMBER_MESSAGE).toBe('Escribe solo números y punto decimal, sin letras. Ejemplo: 1,234.56.');
  });
});

describe('parseDateText', () => {
  it.each([
    ['05/03/2027', '2027-03-05'],
    ['29/02/2028', '2028-02-29'],
    [' 31/12/2027 ', '2027-12-31'],
    ['', ''],
  ])('accepts %j as %j', (text, value) => {
    expect(parseDateText(text)).toEqual({ value });
  });

  it('rejects 31/02/2027 and other dates that do not exist', () => {
    expect(parseDateText('31/02/2027')).toEqual(error(DATE_INVALID_MESSAGE));
    expect(parseDateText('29/02/2027')).toEqual(error(DATE_INVALID_MESSAGE));
    expect(parseDateText('00/01/2027')).toEqual(error(DATE_INVALID_MESSAGE));
    expect(parseDateText('15/13/2027')).toEqual(error(DATE_INVALID_MESSAGE));
    expect(parseDateText('01/01/0000')).toEqual(error(DATE_INVALID_MESSAGE));
  });

  it.each([
    '1/2/2027',
    '5/03/2027',
    '05/3/2027',
    '2027-03-05',
    '05-03-2027',
    '05/03/27',
    'hoy',
    '05/03',
    '05/03/2027 10:00',
  ])('rejects %j as a wrong format', (text) => {
    expect(parseDateText(text)).toEqual(error(DATE_FORMAT_MESSAGE));
  });

  it('uses exact Spanish messages', () => {
    expect(DATE_FORMAT_MESSAGE).toBe('Escribe la fecha como dd/mm/aaaa, con dos dígitos para el día y el mes.');
    expect(DATE_INVALID_MESSAGE).toBe('Esa fecha no existe en el calendario.');
  });
});

describe('parseRateText', () => {
  it.each([
    ['7', '0.07'],
    ['7.25', '0.0725'],
    ['0.0001', '0.000001'],
    ['7%', '0.07'],
    ['7.25 %', '0.0725'],
    ['0', '0'],
    ['', ''],
  ])('accepts %j as %j', (text, value) => {
    expect(parseRateText(text)).toEqual({ value });
  });

  it('rejects more than 4 decimals, negatives and letters', () => {
    expect(parseRateText('7.12345')).toEqual(error(RATE_DECIMALS_MESSAGE));
    expect(parseRateText('-1')).toEqual(error(RATE_NEGATIVE_MESSAGE));
    expect(parseRateText('-0.5')).toEqual(error(RATE_NEGATIVE_MESSAGE));
    expect(parseRateText('abc')).toEqual(error(RATE_NOT_NUMBER_MESSAGE));
    expect(parseRateText('7a')).toEqual(error(RATE_NOT_NUMBER_MESSAGE));
    expect(parseRateText('1e2')).toEqual(error(RATE_NOT_NUMBER_MESSAGE));
    expect(parseRateText('7,25')).toEqual(error(RATE_NOT_NUMBER_MESSAGE));
  });

  it('uses exact Spanish messages', () => {
    expect(RATE_DECIMALS_MESSAGE).toBe('Usa como máximo 4 decimales.');
    expect(RATE_NEGATIVE_MESSAGE).toBe('La tasa no puede ser negativa.');
    expect(RATE_NOT_NUMBER_MESSAGE).toBe(
      'Escribe la tasa solo con números y punto decimal, sin letras. Ejemplo: 7.25.',
    );
  });
});
