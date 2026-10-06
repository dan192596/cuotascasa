import { NotImplementedError, parseLocalDate, parseMoney, type Schedule } from '@cuotascasa/domain';
import { describe, expect, it } from 'vitest';
import { buildComparisonReport, buildScheduleReport } from './index.ts';

function syntheticSchedule(): Schedule {
  const m = parseMoney;
  return {
    currency: 'GTQ',
    roundingProfile: 'FHA_GT_V1',
    rows: [],
    totals: {
      interest: m('0.00'),
      insurance: m('0.00'),
      capital: m('0.00'),
      fixedCharges: m('0.00'),
      prepayments: m('0.00'),
      commissions: m('0.00'),
      total: m('0.00'),
      totalPaid: m('0.00'),
    },
    endDate: parseLocalDate('2045-01-31'),
    installmentCount: 0,
  };
}

describe('model/ stub (owned by W3-15)', () => {
  it('buildScheduleReport and buildComparisonReport throw NotImplementedError naming W3-15', () => {
    const generatedOn = parseLocalDate('2026-01-15');
    const schedule = syntheticSchedule();
    expect(() => buildScheduleReport({ schedule, pathKind: 'REAL', loanLabel: 'Casa A', generatedOn })).toThrow(
      NotImplementedError,
    );
    expect(() => buildScheduleReport({ schedule, pathKind: 'REAL', loanLabel: 'Casa A', generatedOn })).toThrow(
      'W3-15',
    );
    expect(() =>
      buildComparisonReport({ base: { label: 'Real', schedule }, scenarios: [], loanLabel: 'Casa A', generatedOn }),
    ).toThrow('W3-15');
  });
});
