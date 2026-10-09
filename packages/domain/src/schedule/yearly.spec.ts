import { describe, expect, it } from 'vitest';
import { syntheticSchedule } from '../../test/support/synthetic.ts';
import { parseLocalDate } from '../dates/index.ts';
import { parseMoney } from '../money/index.ts';
import type { Schedule, ScheduleRow } from '../types/schedule.ts';
import { yearlySubtotals } from './index.ts';

const m = parseMoney;

function row(k: number, dueDate: string, overrides: Partial<ScheduleRow> = {}): ScheduleRow {
  const [base] = syntheticSchedule().rows;
  if (base === undefined) {
    throw new Error('no base row');
  }
  return { ...base, k, dueDate: parseLocalDate(dueDate), ...overrides };
}

describe('[ALG.YEARLY] yearlySubtotals', () => {
  it('groups by calendar year of the due date and sums every column, prepayments and commissions included', () => {
    const schedule: Schedule = {
      ...syntheticSchedule(),
      rows: [
        row(1, '2025-11-30'),
        row(2, '2025-12-31', { prepayment: m('100.00'), commission: m('1.50') }),
        row(3, '2027-01-31', { prepayment: m('50.00') }),
      ],
    };
    expect(yearlySubtotals(schedule)).toEqual([
      {
        year: 2025,
        capital: '1643.60',
        interest: '5833.34',
        insurance: '1050.00',
        fixedCharges: '790.00',
        prepayments: '100.00',
        commissions: '1.50',
        total: '9316.94',
      },
      {
        year: 2027,
        capital: '821.80',
        interest: '2916.67',
        insurance: '525.00',
        fixedCharges: '395.00',
        prepayments: '50.00',
        commissions: '0.00',
        total: '4658.47',
      },
    ]);
  });

  it('omits a year without installments and returns years in ascending order', () => {
    const schedule: Schedule = { ...syntheticSchedule(), rows: [row(1, '2030-01-31'), row(2, '2026-01-31')] };
    expect(yearlySubtotals(schedule).map((entry) => entry.year)).toEqual([2026, 2030]);
  });

  it('an empty schedule has no years', () => {
    expect(yearlySubtotals({ ...syntheticSchedule(), rows: [] })).toEqual([]);
  });
});
