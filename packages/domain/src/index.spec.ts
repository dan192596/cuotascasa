import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { invalidInputCode } from '../test/support/errors.ts';
import * as api from './index.ts';
import * as paths from './paths/index.ts';
import * as schedule from './schedule/index.ts';
import * as templates from './templates/index.ts';

describe('@cuotascasa/domain public API', () => {
  it('exposes every engine entry point of the contract', () => {
    for (const name of [
      'buildSchedule',
      'runSchedule',
      'buildPaths',
      'compareSchedules',
      'yearlySubtotals',
      'goalSeek',
      'listTemplates',
      'instantiateTemplate',
      'deriveFixedCharges',
      'validateAgainstReportedBalance',
      'levelPayment',
      'percentToRate',
      'rateToPercent',
      'periodicRate',
    ] as const) {
      expect(typeof api[name]).toBe('function');
    }
  });

  it('re-exports the card-owned implementations without wrappers', () => {
    expect(api.levelPayment).toBe(schedule.levelPayment);
    expect(api.yearlySubtotals).toBe(schedule.yearlySubtotals);
    expect(api.compareSchedules).toBe(paths.compareSchedules);
    expect(api.listTemplates).toBe(templates.listTemplates);
    expect(api.instantiateTemplate).toBe(templates.instantiateTemplate);
    expect(api.deriveFixedCharges).toBe(templates.deriveFixedCharges);
  });

  it('converts percents and rates by exact decimal shift', () => {
    expect(api.percentToRate('7.25')).toBe('0.0725');
    expect(api.rateToPercent(api.parseRate('0.0126'))).toBe('1.26');
    expect(invalidInputCode(() => api.percentToRate('7.12345'))).toBe('INVALID_PERCENT');
    expect(invalidInputCode(() => api.percentToRate('7.25e0'))).toBe('INVALID_PERCENT');
    expect(invalidInputCode(() => api.percentToRate(7.25))).toBe('INVALID_PERCENT');
  });

  it('exposes the money and date helpers, the constants and the typed errors with their rules', () => {
    expect(api.moneyAdd(api.parseMoney('0.10'), api.parseMoney('0.20'))).toBe('0.30');
    expect(api.dueDateFor(api.parseLocalDate('2025-02-28'), 'END_OF_MONTH', 240)).toBe('2045-01-31');
    expect(api.PathKind).toEqual({ ORIGINAL: 'ORIGINAL', REAL: 'REAL', SCENARIO: 'SCENARIO' });
    expect(new api.NotImplementedError('W1-01')).toBeInstanceOf(api.DomainError);
    expect(api.INVALID_INPUT_RULES.HYPOTHETICAL_BEFORE_CUTOFF).toBe('ALG.PATHS.CUTOFF');
    expect(new api.InfeasibleGoalError('PREPAYMENT_NOT_AFTER_CUTOFF', 'k <= cutoffK', { k: 12 }).rule).toBe('ALG.GOAL');
    expect(api.NEGATIVE_AMORTIZATION_RULES).toContain('ALG.TERM');
    expect(api.ERROR_RULES).toContain('ALG.PATHS.CUTOFF');
  });

  it('loading the whole public API never mutates the global decimal.js configuration', () => {
    expect(Decimal.precision).toBe(20);
    expect(Decimal.rounding).toBe(Decimal.ROUND_HALF_UP);
    expect(Decimal.toExpNeg).toBe(-7);
    expect(Decimal.toExpPos).toBe(21);
  });

  it('exposes exactly the frozen value exports (no decimal.js helper leaks)', () => {
    expect(Object.keys(api).sort()).toEqual([
      'CURRENCIES',
      'CurrencyMismatchError',
      'DELTA_CAUSES',
      'DOMAIN_EVENT_TYPES',
      'DomainError',
      'EMITTED_DELTA_CAUSES',
      'END_OF_MONTH',
      'ERROR_RULES',
      'EVENT_ORDER_KEY',
      'EVENT_PHASES',
      'INFEASIBLE_GOAL_CODES',
      'INSTALLMENT_PHASE',
      'INVALID_INPUT_CODES',
      'INVALID_INPUT_RULES',
      'InfeasibleGoalError',
      'InvalidInputError',
      'MAX_PERCENT_DECIMALS',
      'NEGATIVE_AMORTIZATION_RULES',
      'NegativeAmortizationError',
      'NotImplementedError',
      'PREPAYMENT_MODES',
      'PathKind',
      'RATE_CHANGE_POLICIES',
      'RATE_TYPES',
      'ROUNDING_PROFILES',
      'TEMPLATE_IDS',
      'ZERO_MONEY',
      'addMonths',
      'alignToPaymentDay',
      'assertFirstDueDateConsistent',
      'buildPaths',
      'buildSchedule',
      'compareEventOrderKeys',
      'compareLocalDate',
      'compareMoney',
      'compareSchedules',
      'daysInMonth',
      'deriveFixedCharges',
      'dueDateFor',
      'dueDates',
      'dueDayOfMonth',
      'endOfMonth',
      'eventOrderKey',
      'goalSeek',
      'installmentOnOrAfter',
      'instantiateTemplate',
      'isFirstDueDateConsistent',
      'isLeapYear',
      'isLocalDate',
      'isMoney',
      'isRate',
      'levelPayment',
      'listTemplates',
      'localDateParts',
      'makeLocalDate',
      'maxMoney',
      'minMoney',
      'moneyAbs',
      'moneyAdd',
      'moneyIsNegative',
      'moneyIsZero',
      'moneyMidpoint',
      'moneyNegate',
      'moneySub',
      'moneySum',
      'monthIndex',
      'parseLocalDate',
      'parseMoney',
      'parsePaymentDay',
      'parseRate',
      'percentOf',
      'percentToRate',
      'periodicRate',
      'rateToPercent',
      'runSchedule',
      'validateAgainstReportedBalance',
      'yearlySubtotals',
    ]);
  });
});
