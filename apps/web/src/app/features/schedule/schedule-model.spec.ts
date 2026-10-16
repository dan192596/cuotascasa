import type { Money, Schedule, ScheduleRow, YearlySubtotal } from '@cuotascasa/domain';
import { describe, expect, it } from 'vitest';
import type { AnchorDelta } from '../../data/api.ts';
import type { AbonoSlot } from './scenario-abono.ts';
import { buildLedger, type LedgerInput, SCHEDULE_VIEWS } from './schedule-model.ts';

const m = (value: string): Money => value as Money;

/** Synthetic rows: k = 1..4 fall on 2025-11-30, 2025-12-31, 2026-01-31, 2026-02-28. */
const DUES = ['2025-11-30', '2025-12-31', '2026-01-31', '2026-02-28'];

function row(k: number, over: Partial<ScheduleRow> = {}): ScheduleRow {
  return {
    k,
    dueDate: DUES[k - 1] ?? '2026-03-31',
    opening: m('1000.00'),
    interest: m('10.00'),
    insurance: m('2.00'),
    insuranceComponents: [m('2.00')],
    capital: m('100.00'),
    fixedCharges: m('5.00'),
    total: m('117.00'),
    closing: m('900.00'),
    prepayment: m('0.00'),
    commission: m('0.00'),
    closingAfterPrepayment: m('900.00'),
    level: m('112.00'),
    isLast: false,
    payoff: false,
    paid: false,
    ...over,
  } as ScheduleRow;
}

function schedule(rows: readonly ScheduleRow[]): Schedule {
  return { currency: 'GTQ', rows, installmentCount: rows.length } as unknown as Schedule;
}

function subtotal(year: number, over: Partial<YearlySubtotal> = {}): YearlySubtotal {
  return {
    year,
    capital: m('200.00'),
    interest: m('20.00'),
    insurance: m('4.00'),
    fixedCharges: m('10.00'),
    prepayments: m('0.00'),
    commissions: m('0.00'),
    total: m('234.00'),
    ...over,
  } as YearlySubtotal;
}

const none = (): AbonoSlot => ({ kind: 'none' });

function input(over: Partial<LedgerInput> = {}): LedgerInput {
  return {
    view: 'real',
    schedule: schedule([row(1), row(2), row(3), row(4)]),
    subtotals: [subtotal(2025), subtotal(2026, { capital: m('1.00') })],
    cutoffK: 0,
    currentK: null,
    paid: new Set<number>(),
    anchors: [],
    components: [],
    slotAt: none,
    ...over,
  };
}

const keys = (rows: readonly { key: string }[]) => rows.map((r) => r.key);

describe('buildLedger: rows and yearly subtotals', () => {
  it('lists the views in the order original, real, scenario', () => {
    expect(SCHEDULE_VIEWS.map((v) => v.id)).toEqual(['original', 'real', 'scenario']);
  });

  it('puts one subtotal row after the last installment of each calendar year', () => {
    const { rows } = buildLedger(input());
    expect(keys(rows)).toEqual(['k-1', 'k-2', 'sub-2025', 'k-3', 'k-4', 'sub-2026']);
    expect(rows.filter((r) => r.kind === 'subtotal').every((r) => r.editable !== true)).toBe(true);
  });

  it('formats the subtotal cells exactly from the facade subtotals', () => {
    const { rows } = buildLedger(
      input({ subtotals: [subtotal(2025, { capital: m('1234.56'), prepayments: m('20000.00') }), subtotal(2026)] }),
    );
    const sub = rows.find((r) => r.key === 'sub-2025');
    expect(sub?.label).toBe('Subtotal 2025');
    expect(sub?.cells).toMatchObject({
      k: 'Subtotal',
      due: '2025',
      capital: '1,234.56',
      interest: '20.00',
      insurance: '4.00',
      fixed: '10.00',
      total: '234.00',
      prepayment: '20,000.00',
    });
  });

  it('skips the subtotal of a year the facade does not report instead of inventing numbers', () => {
    const { rows } = buildLedger(input({ subtotals: [subtotal(2026)] }));
    expect(keys(rows)).toEqual(['k-1', 'k-2', 'k-3', 'k-4', 'sub-2026']);
  });

  it('formats a data row with the ui money and date helpers (balance after the abono as closing)', () => {
    const { rows } = buildLedger(
      input({
        schedule: schedule([
          row(1, { opening: m('1234567.80'), prepayment: m('50.00'), closingAfterPrepayment: m('1234000.00') }),
        ]),
        subtotals: [],
      }),
    );
    expect(rows[0]?.cells).toMatchObject({
      k: '1',
      due: '30/11/2025',
      opening: '1,234,567.80',
      interest: '10.00',
      insurance: '2.00',
      capital: '100.00',
      fixed: '5.00',
      total: '117.00',
      closing: '1,234,000.00',
      prepayment: '50.00',
    });
  });
});

describe('buildLedger: current row', () => {
  it('highlights only the row whose k is the current installment', () => {
    const { rows } = buildLedger(input({ currentK: 3 }));
    expect(rows.filter((r) => r.current === true).map((r) => r.key)).toEqual(['k-3']);
  });

  it('highlights nothing without a current installment', () => {
    const { rows } = buildLedger(input({ currentK: null }));
    expect(rows.some((r) => r.current === true)).toBe(false);
  });
});

describe('buildLedger: paid mark', () => {
  it('marks a row paid when its schedule row says so or the facade lists its k', () => {
    const { rows } = buildLedger(
      input({ schedule: schedule([row(1, { paid: true }), row(2), row(3), row(4)]), paid: new Set([2]) }),
    );
    expect(rows.find((r) => r.key === 'k-1')?.cells['paid']).toBe('✓');
    expect(rows.find((r) => r.key === 'k-1')?.label).toContain('pagada');
    expect(rows.find((r) => r.key === 'k-2')?.cells['paid']).toBe('✓');
    expect(rows.find((r) => r.key === 'k-3')?.cells['paid']).toBe('');
  });

  it('never marks the original plan', () => {
    const { rows } = buildLedger(
      input({ view: 'original', paid: new Set([1]), schedule: schedule([row(1, { paid: true })]) }),
    );
    expect(rows[0]?.cells['paid']).toBe('');
  });
});

describe('buildLedger: Real Δ', () => {
  const anchor = (k: number, realDelta: string, status: AnchorDelta['status']): AnchorDelta =>
    ({
      eventId: `e${k}`,
      k,
      reported: m('1.00'),
      projected: m('1.00'),
      realDelta: m(realDelta),
      status,
      cause: null,
    }) as AnchorDelta;

  it('shows reported − projected with its traffic light only on rows with a reported balance', () => {
    const { rows } = buildLedger(input({ anchors: [anchor(2, '-1.50', 'AMBER'), anchor(3, '0.00', 'GREEN')] }));
    const delta = (key: string) => rows.find((r) => r.key === key)?.cells['delta'];
    expect(delta('k-1')).toBe('');
    expect(delta('k-2')).toBe('-1.50 ▲ Diferencia pequeña');
    expect(delta('k-3')).toBe('0.00 ● Coincide');
    expect(delta('k-4')).toBe('');
  });

  it('writes the red and unvalidated lights with their own icon and text', () => {
    const { rows } = buildLedger(input({ anchors: [anchor(1, '400.00', 'RED'), anchor(4, '0.00', 'UNVALIDATED')] }));
    expect(rows[0]?.cells['delta']).toBe('400.00 ■ Diferencia grande');
    expect(rows.find((r) => r.key === 'k-4')?.cells['delta']).toBe('0.00 ○ Sin validar');
  });

  it('lists several anchors of the same k', () => {
    const { rows } = buildLedger(input({ anchors: [anchor(2, '1.00', 'GREEN'), anchor(2, '2.00', 'GREEN')] }));
    expect(rows.find((r) => r.key === 'k-2')?.cells['delta']).toBe('1.00 ● Coincide; 2.00 ● Coincide');
  });

  it('never shows Real Δ on the original plan', () => {
    const { rows } = buildLedger(input({ view: 'original', anchors: [anchor(2, '1.00', 'GREEN')] }));
    expect(rows.find((r) => r.key === 'k-2')?.cells['delta']).toBe('');
  });

  it('adds the four component columns only when a payment has a breakdown, with real − projected per row', () => {
    const plain = buildLedger(input());
    expect(plain.columns.map((c) => c.key)).not.toContain('dCapital');

    const withBreakdown = buildLedger(
      input({
        components: [
          {
            eventId: 'p1',
            k: 3,
            capital: m('-0.50'),
            interest: m('0.25'),
            insurance: m('0.00'),
            fixedCharges: m('5.00'),
          },
        ],
      }),
    );
    expect(withBreakdown.columns.map((c) => c.key)).toEqual(
      expect.arrayContaining(['dCapital', 'dInterest', 'dInsurance', 'dFixed']),
    );
    const r3 = withBreakdown.rows.find((r) => r.key === 'k-3');
    expect(r3?.cells).toMatchObject({ dCapital: '-0.50', dInterest: '0.25', dInsurance: '0.00', dFixed: '5.00' });
    expect(withBreakdown.rows.find((r) => r.key === 'k-2')?.cells['dCapital']).toBe('');
  });
});

describe('buildLedger: abono cell', () => {
  const columnOf = (key: string) => buildLedger(input()).columns.find((c) => c.key === key);

  it('declares the abono column editable and right-aligned', () => {
    expect(columnOf('prepayment')).toMatchObject({ editable: true, align: 'end' });
    expect(columnOf('k')?.header).toBe('#');
    expect(columnOf('delta')?.header).toBe('Real Δ');
  });

  it('only rows after the cutoff are editable, in the real and scenario views', () => {
    for (const view of ['real', 'scenario'] as const) {
      const { rows } = buildLedger(input({ view, cutoffK: 2 }));
      expect(rows.filter((r) => r.editable === true).map((r) => r.key)).toEqual(['k-3', 'k-4']);
    }
  });

  it('the original plan is read-only', () => {
    const { rows } = buildLedger(input({ view: 'original', cutoffK: 0 }));
    expect(rows.some((r) => r.editable === true)).toBe(false);
  });

  it('preloads the edit with the scenario event amount, not the capped amount shown in the cell', () => {
    const { rows } = buildLedger(
      input({
        view: 'scenario',
        schedule: schedule([row(1, { prepayment: m('900.00') })]),
        subtotals: [],
        slotAt: () => ({
          kind: 'single',
          event: {
            id: 'a',
            date: '2025-11-30',
            type: 'Prepayment',
            amount: '1500.00',
            mode: 'REDUCE_TERM',
            deletedAt: null,
          },
        }),
      }),
    );
    expect(rows[0]?.cells['prepayment']).toBe('900.00');
    expect(rows[0]?.editValues?.['prepayment']).toBe('1500.00');
  });

  it('a locked cell is read-only, keeps its amount, is flagged with an asterisk and says Proyecciones', () => {
    const { rows } = buildLedger(
      input({
        schedule: schedule([row(1, { prepayment: m('30.00') }), row(2)]),
        subtotals: [],
        slotAt: (k) => (k === 1 ? { kind: 'locked' } : { kind: 'none' }),
      }),
    );
    expect(rows[0]?.editable).toBe(false);
    expect(rows[0]?.cells['prepayment']).toBe('30.00 *');
    expect(rows[0]?.label).toContain('Proyecciones');
    expect(rows[1]?.editable).toBe(true);
  });

  it('a locked cell without an applied amount still carries the asterisk', () => {
    const { rows } = buildLedger(input({ slotAt: (k) => (k === 1 ? { kind: 'locked' } : { kind: 'none' }) }));
    expect(rows[0]?.cells['prepayment']).toBe('*');
  });
});

describe('buildLedger: scenario prepayment marker', () => {
  const single: AbonoSlot = {
    kind: 'single',
    event: { id: 'a', date: '2025-11-30', type: 'Prepayment', amount: '1500.00', mode: 'REDUCE_TERM', deletedAt: null },
  };

  it('in the real view a row with a scenario prepayment shows its amount with a visible marker and an accessible label', () => {
    const { rows } = buildLedger(
      input({ view: 'real', subtotals: [], slotAt: (k) => (k === 1 ? single : { kind: 'none' }) }),
    );
    expect(rows[0]?.cells['prepayment']).toBe('1,500.00 (esc.)');
    expect(rows[0]?.label).toContain('abono del escenario');
    expect(rows[1]?.cells['prepayment']).toBe('');
  });

  it('in the scenario fallback the marker also shows', () => {
    const { rows } = buildLedger(input({ view: 'scenario', fallback: true, subtotals: [], slotAt: () => single }));
    expect(rows[0]?.cells['prepayment']).toBe('1,500.00 (esc.)');
  });

  it('in the real scenario view the applied amount is shown without marker', () => {
    const { rows } = buildLedger(
      input({
        view: 'scenario',
        subtotals: [],
        schedule: schedule([row(1, { prepayment: m('900.00') })]),
        slotAt: () => single,
      }),
    );
    expect(rows[0]?.cells['prepayment']).toBe('900.00');
  });
});
