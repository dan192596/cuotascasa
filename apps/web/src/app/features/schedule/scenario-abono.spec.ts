import { describe, expect, it } from 'vitest';
import { abonoSlotAt, planAbonoEdit, type ScenarioEvent } from './scenario-abono.ts';

/** Synthetic loan: the k-th installment falls on the first day of month k of 2026 (k 1..12). */
const kOf = (date: string): number => Number(date.slice(5, 7));
const STAMP = '2026-10-16T12:00:00.000Z';

function prepayment(id: string, date: string, amount: string, over: Partial<ScenarioEvent> = {}): ScenarioEvent {
  return { id, date, type: 'Prepayment', amount, mode: 'REDUCE_TERM', deletedAt: null, ...over } as ScenarioEvent;
}
const advance = (id: string, date: string): ScenarioEvent =>
  ({ id, date, type: 'AdvanceInstallments', count: 2, deletedAt: null }) as ScenarioEvent;
const rate = (id: string, date: string): ScenarioEvent =>
  ({
    id,
    date,
    type: 'RateChange',
    policy: 'RECALC_INSTALLMENT_KEEP_TERM',
    interestRate: '0.08',
    deletedAt: null,
  }) as ScenarioEvent;

describe('abonoSlotAt', () => {
  it('is none when the scenario has nothing at k', () => {
    expect(abonoSlotAt([], 5, kOf)).toEqual({ kind: 'none' });
    expect(abonoSlotAt([prepayment('a', '2026-06-01', '10.00')], 5, kOf)).toEqual({ kind: 'none' });
  });

  it('is single for exactly one live prepayment at k, matched through the anchor rule rather than the date text', () => {
    const event = prepayment('a', '2026-05-20', '10.00');
    expect(abonoSlotAt([event], 5, kOf)).toEqual({ kind: 'single', event });
  });

  it('ignores tombstoned events and unrelated rate changes', () => {
    const events = [
      prepayment('a', '2026-05-01', '10.00', { deletedAt: STAMP }),
      rate('r', '2026-05-01'),
      prepayment('b', '2026-05-01', '30.00'),
    ];
    expect(abonoSlotAt(events, 5, kOf)).toEqual({ kind: 'single', event: events[2] });
  });

  it('is locked with two prepayments at k', () => {
    expect(
      abonoSlotAt([prepayment('a', '2026-05-01', '10.00'), prepayment('b', '2026-05-09', '20.00')], 5, kOf),
    ).toEqual({ kind: 'locked' });
  });

  it('is locked with an AdvanceInstallments at k, alone or next to a prepayment', () => {
    expect(abonoSlotAt([advance('x', '2026-05-01')], 5, kOf)).toEqual({ kind: 'locked' });
    expect(abonoSlotAt([advance('x', '2026-05-01'), prepayment('a', '2026-05-01', '10.00')], 5, kOf)).toEqual({
      kind: 'locked',
    });
  });
});

describe('planAbonoEdit', () => {
  const newId = () => 'f0000000-0000-4000-8000-000000000001';

  it('(a) creates a REDUCE_TERM prepayment without commission dated on the due date of k', () => {
    const plan = planAbonoEdit({
      events: [],
      k: 5,
      dueDate: '2026-05-01',
      amount: '20000.00',
      installmentOf: kOf,
      newId,
    });
    expect(plan).toEqual({
      outcome: 'created',
      events: [
        {
          id: 'f0000000-0000-4000-8000-000000000001',
          date: '2026-05-01',
          type: 'Prepayment',
          amount: '20000.00',
          mode: 'REDUCE_TERM',
          deletedAt: null,
        },
      ],
    });
    expect(plan && 'commission' in (plan.events[0] ?? {})).toBe(false);
  });

  it('(b) edits the amount of the single prepayment keeping id, mode, commission and date', () => {
    const existing = prepayment('keep', '2026-05-15', '10.00', {
      mode: 'REDUCE_INSTALLMENT',
      commission: { kind: 'FLAT', amount: '5.00' },
    } as Partial<ScenarioEvent>);
    const other = prepayment('other', '2026-07-01', '7.00');
    const plan = planAbonoEdit({
      events: [other, existing],
      k: 5,
      dueDate: '2026-05-31',
      amount: '99.50',
      installmentOf: kOf,
      newId,
    });
    expect(plan?.outcome).toBe('updated');
    expect(plan?.events).toHaveLength(2);
    expect(plan?.events[0]).toBe(other);
    expect(plan?.events[1]).toEqual({ ...existing, amount: '99.50' });
  });

  it('(c) a zero amount removes the single prepayment from the array and never writes deletedAt', () => {
    const existing = prepayment('gone', '2026-05-01', '10.00');
    const other = prepayment('other', '2026-07-01', '7.00');
    const plan = planAbonoEdit({
      events: [other, existing],
      k: 5,
      dueDate: '2026-05-01',
      amount: '0.00',
      installmentOf: kOf,
      newId,
    });
    expect(plan).toEqual({ outcome: 'removed', events: [other] });
  });

  it('drops legacy embedded-deleted events instead of carrying them', () => {
    const legacy = prepayment('old', '2026-05-01', '10.00', { deletedAt: STAMP });
    const plan = planAbonoEdit({
      events: [legacy],
      k: 5,
      dueDate: '2026-05-01',
      amount: '5.00',
      installmentOf: kOf,
      newId,
    });
    expect(plan?.outcome).toBe('created');
    expect(plan?.events.map((e) => e.id)).toEqual(['f0000000-0000-4000-8000-000000000001']);
  });

  it('an equal amount plans unchanged', () => {
    const existing = prepayment('a', '2026-05-01', '100.00');
    const plan = planAbonoEdit({
      events: [existing],
      k: 5,
      dueDate: '2026-05-01',
      amount: '100.00',
      installmentOf: kOf,
      newId,
    });
    expect(plan?.outcome).toBe('unchanged');
  });

  it('150 write/clear cycles on the same k keep the event list bounded', () => {
    let events: ScenarioEvent[] = [];
    let n = 0;
    for (let i = 0; i < 150; i += 1) {
      for (const amount of ['10.00', '0.00']) {
        const plan = planAbonoEdit({
          events,
          k: 5,
          dueDate: '2026-05-01',
          amount,
          installmentOf: kOf,
          newId: () => `id-${n++}`,
        });
        events = plan?.events ?? events;
      }
      expect(events.filter((e) => kOf(e.date) === 5).length).toBeLessThanOrEqual(1);
    }
    expect(events).toHaveLength(0);
  });

  it('a zero amount with nothing at k changes nothing', () => {
    const plan = planAbonoEdit({
      events: [],
      k: 5,
      dueDate: '2026-05-01',
      amount: '0.00',
      installmentOf: kOf,
      newId,
    });
    expect(plan).toEqual({ outcome: 'unchanged', events: [] });
  });

  it('(d) refuses a locked cell', () => {
    const events = [prepayment('a', '2026-05-01', '10.00'), prepayment('b', '2026-05-02', '10.00')];
    expect(
      planAbonoEdit({ events, k: 5, dueDate: '2026-05-01', amount: '1.00', installmentOf: kOf, newId }),
    ).toBeNull();
  });

  it('never mutates its input', () => {
    const existing = Object.freeze(prepayment('a', '2026-05-01', '10.00'));
    const events = Object.freeze([existing]);
    expect(() =>
      planAbonoEdit({ events, k: 5, dueDate: '2026-05-01', amount: '11.00', installmentOf: kOf, newId }),
    ).not.toThrow();
  });
});
