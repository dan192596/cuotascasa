import { describe, expect, it } from 'vitest';
import {
  CURRENCIES,
  CurrencyMismatchError,
  DomainError,
  END_OF_MONTH,
  ERROR_RULES,
  INFEASIBLE_GOAL_CODES,
  INVALID_INPUT_CODES,
  INVALID_INPUT_RULES,
  InfeasibleGoalError,
  InvalidInputError,
  type Money,
  NEGATIVE_AMORTIZATION_RULES,
  NegativeAmortizationError,
  NotImplementedError,
  RATE_TYPES,
  ROUNDING_PROFILES,
} from './primitives.ts';

const m = (value: string): Money => value as Money;

/** El `{type, rule, k}` con que los ejemplos registran un error esperado ([ALG.ERRORS]). */
const expectation = (error: DomainError) => ({ type: error.name, rule: error.rule, k: error.k });

describe('domain primitives', () => {
  it('declares the closed v1 enumerations of [ALG.TERMS]', () => {
    expect(CURRENCIES).toEqual(['GTQ', 'USD']);
    expect(ROUNDING_PROFILES).toEqual(['FHA_GT_V1', 'SIMPLE']);
    expect(RATE_TYPES).toEqual(['FIXED', 'VARIABLE']);
    expect(END_OF_MONTH).toBe('END_OF_MONTH');
  });
});

describe('typed errors', () => {
  it('NotImplementedError names the owning card and has no [ALG.ERRORS] rule', () => {
    const error = new NotImplementedError('W1-01');
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toBeInstanceOf(Error);
    expect(error.kind).toBe('NotImplemented');
    expect(error.name).toBe('NotImplementedError');
    expect(error.cardId).toBe('W1-01');
    expect(error.message).toContain('W1-01');
    expect(error.rule).toBeNull();
    expect(error.k).toBeNull();
  });

  it('InvalidInputError carries a closed code, the rule of that code and optional details with k', () => {
    const plain = new InvalidInputError('INVALID_MONEY', 'bad money');
    expect(plain).toBeInstanceOf(DomainError);
    expect(plain.kind).toBe('InvalidInput');
    expect(plain.name).toBe('InvalidInputError');
    expect(plain.code).toBe('INVALID_MONEY');
    expect(plain.rule).toBe('ALG.CONV');
    expect(plain.k).toBeNull();
    expect(plain.details).toEqual({});
    const detailed = new InvalidInputError('INSTALLMENT_OUT_OF_RANGE', 'k out of range', { k: 0, max: 240 });
    expect(detailed.details).toEqual({ k: 0, max: 240 });
    expect(detailed.k).toBe(0);
    expect(detailed.rule).toBe('ALG.EVENTS.ANCHOR');
  });

  it('every InvalidInputCode maps to a rule id of ERROR_RULES', () => {
    expect(ERROR_RULES).toEqual([
      'ALG.CONV',
      'ALG.TERMS',
      'ALG.TERM',
      'ALG.DATES',
      'ALG.EVENTS',
      'ALG.EVENTS.ANCHOR',
      'ALG.RATE.KEEP_INSTALLMENT',
      'ALG.RATE.BANK_INSTALLMENT',
      'ALG.PATHS.CUTOFF',
      'ALG.GOAL',
      'ALG.TEMPLATES',
      'ALG.TEMPLATES.FIXED',
    ]);
    expect(Object.keys(INVALID_INPUT_RULES)).toEqual([...INVALID_INPUT_CODES]);
    for (const rule of Object.values(INVALID_INPUT_RULES)) {
      expect(ERROR_RULES).toContain(rule);
    }
  });

  it('NegativeAmortizationError keeps the rule, the installment, the level and the charge', () => {
    const error = new NegativeAmortizationError('ALG.RATE.KEEP_INSTALLMENT', 13, m('100.00'), m('150.00'));
    expect(error).toBeInstanceOf(DomainError);
    expect(error.kind).toBe('NegativeAmortization');
    expect(error.name).toBe('NegativeAmortizationError');
    expect(error.rule).toBe('ALG.RATE.KEEP_INSTALLMENT');
    expect(error.k).toBe(13);
    expect(error.level).toBe('100.00');
    expect(error.financialCharge).toBe('150.00');
    expect(NEGATIVE_AMORTIZATION_RULES).toEqual(['ALG.RATE.KEEP_INSTALLMENT', 'ALG.RATE.BANK_INSTALLMENT', 'ALG.TERM']);
  });

  it('CurrencyMismatchError keeps both currencies (R27)', () => {
    const error = new CurrencyMismatchError('GTQ', 'USD');
    expect(error).toBeInstanceOf(DomainError);
    expect(error.kind).toBe('CurrencyMismatch');
    expect(error.name).toBe('CurrencyMismatchError');
    expect(error.expected).toBe('GTQ');
    expect(error.actual).toBe('USD');
  });

  it('InfeasibleGoalError is reserved for invalid goal-seek inputs, k <= cutoffK included ([ALG.GOAL])', () => {
    const error = new InfeasibleGoalError('PREPAYMENT_NOT_AFTER_CUTOFF', 'k must be > cutoffK', { k: 12, cutoffK: 12 });
    expect(error).toBeInstanceOf(DomainError);
    expect(error.kind).toBe('InfeasibleGoal');
    expect(error.name).toBe('InfeasibleGoalError');
    expect(error.code).toBe('PREPAYMENT_NOT_AFTER_CUTOFF');
    expect(error.details).toEqual({ k: 12, cutoffK: 12 });
    expect(new InfeasibleGoalError('INVALID_GOAL_AMOUNT', 'MAX_INSTALLMENT must not be negative').details).toEqual({});
    expect(INFEASIBLE_GOAL_CODES).toEqual([
      'PREPAYMENT_NOT_AFTER_CUTOFF',
      'PREPAYMENT_AFTER_END',
      'INVALID_GOAL_AMOUNT',
      'SCENARIO_PATH_MISSING',
    ]);
  });

  it('[ALG.ERRORS] every row of the table yields its class, rule and k', () => {
    expect([
      expectation(new InvalidInputError('FIRST_DUE_DATE_MISMATCH', 'firstDueDate does not match paymentDay')),
      expectation(new InvalidInputError('INSTALLMENT_OUT_OF_RANGE', 'k out of range', { k: 241, max: 240 })),
      expectation(new InvalidInputError('MISSING_INSTALLMENT_NUMBER', 'ActualPayment without installmentNumber')),
      expectation(new InvalidInputError('HYPOTHETICAL_BEFORE_CUTOFF', 'k <= cutoffK', { k: 8, cutoffK: 8 })),
      expectation(new NegativeAmortizationError('ALG.RATE.KEEP_INSTALLMENT', 13, m('4263.47'), m('4300.00'))),
      expectation(new NegativeAmortizationError('ALG.RATE.BANK_INSTALLMENT', 13, m('3000.00'), m('3100.00'))),
      expectation(new NegativeAmortizationError('ALG.TERM', 30, m('2000.00'), m('2000.00'))),
      expectation(new InvalidInputError('INVALID_MONEY', 'bad money')),
      expectation(new InfeasibleGoalError('PREPAYMENT_NOT_AFTER_CUTOFF', 'k <= cutoffK', { k: 12, cutoffK: 12 })),
      expectation(new InfeasibleGoalError('PREPAYMENT_AFTER_END', 'k > last', { k: 241, last: 240 })),
      expectation(new InfeasibleGoalError('SCENARIO_PATH_MISSING', 'basePath SCENARIO without a scenario')),
      expectation(new InfeasibleGoalError('INVALID_GOAL_AMOUNT', 'MAX_INSTALLMENT must not be negative')),
      expectation(new CurrencyMismatchError('GTQ', 'USD')),
    ]).toEqual([
      { type: 'InvalidInputError', rule: 'ALG.DATES', k: null },
      { type: 'InvalidInputError', rule: 'ALG.EVENTS.ANCHOR', k: 241 },
      { type: 'InvalidInputError', rule: 'ALG.EVENTS.ANCHOR', k: null },
      { type: 'InvalidInputError', rule: 'ALG.PATHS.CUTOFF', k: 8 },
      { type: 'NegativeAmortizationError', rule: 'ALG.RATE.KEEP_INSTALLMENT', k: 13 },
      { type: 'NegativeAmortizationError', rule: 'ALG.RATE.BANK_INSTALLMENT', k: 13 },
      { type: 'NegativeAmortizationError', rule: 'ALG.TERM', k: 30 },
      { type: 'InvalidInputError', rule: 'ALG.CONV', k: null },
      { type: 'InfeasibleGoalError', rule: 'ALG.GOAL', k: 12 },
      { type: 'InfeasibleGoalError', rule: 'ALG.GOAL', k: 241 },
      { type: 'InfeasibleGoalError', rule: 'ALG.GOAL', k: null },
      { type: 'InfeasibleGoalError', rule: 'ALG.GOAL', k: null },
      { type: 'CurrencyMismatchError', rule: 'ALG.TERMS', k: null },
    ]);
  });
});
