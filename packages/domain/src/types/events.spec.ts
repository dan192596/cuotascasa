import { describe, expect, it } from 'vitest';
import { parseLocalDate } from '../dates/index.ts';
import { parseMoney, parseRate } from '../money/index.ts';
import {
  compareEventOrderKeys,
  DOMAIN_EVENT_TYPES,
  type DomainEvent,
  EVENT_ORDER_KEY,
  EVENT_PHASES,
  type EventOrderKey,
  eventOrderKey,
  INSTALLMENT_PHASE,
  PREPAYMENT_MODES,
  RATE_CHANGE_POLICIES,
} from './events.ts';

const d = parseLocalDate;
const key = (k: number, phase: 0 | 1 | 3 | 4, date: string, typeRank: number, id: string): EventOrderKey => ({
  k,
  phase,
  date: d(date),
  typeRank,
  id,
});

describe('[ALG.EVENTS.ORDER] total order key', () => {
  it('is (k, phase, date, typeRank, id)', () => {
    expect(EVENT_ORDER_KEY).toEqual(['k', 'phase', 'date', 'typeRank', 'id']);
    expect(INSTALLMENT_PHASE).toBe(2);
  });

  it('assigns the phases and type ranks of the algorithm table', () => {
    expect(EVENT_PHASES).toEqual({
      ReportedBalance: { phase: 0, typeRank: 0 },
      RateChange: { phase: 1, typeRank: 0 },
      FixedChargeChange: { phase: 1, typeRank: 1 },
      Prepayment: { phase: 3, typeRank: 0 },
      AdvanceInstallments: { phase: 3, typeRank: 1 },
      ActualPayment: { phase: 4, typeRank: 0 },
    });
    expect([...DOMAIN_EVENT_TYPES].sort()).toEqual(Object.keys(EVENT_PHASES).sort());
    expect(RATE_CHANGE_POLICIES[0]).toBe('RECALC_INSTALLMENT_KEEP_TERM');
    expect(PREPAYMENT_MODES).toEqual(['REDUCE_TERM', 'REDUCE_INSTALLMENT']);
  });

  it('builds the key of an anchored event', () => {
    const event: DomainEvent = {
      type: 'AdvanceInstallments',
      id: 'evt-advance-1',
      date: d('2026-01-15'),
      count: 6,
    };
    expect(eventOrderKey(event, 12)).toEqual(key(12, 3, '2026-01-15', 1, 'evt-advance-1'));
  });

  it('compares field by field in priority order', () => {
    expect(compareEventOrderKeys(key(11, 4, '2026-12-31', 0, 'z'), key(12, 0, '2025-01-01', 0, 'a'))).toBe(-1);
    expect(compareEventOrderKeys(key(12, 1, '2025-01-01', 0, 'a'), key(12, 0, '2026-12-31', 0, 'z'))).toBe(1);
    expect(compareEventOrderKeys(key(12, 3, '2026-01-10', 1, 'z'), key(12, 3, '2026-01-15', 0, 'a'))).toBe(-1);
    expect(compareEventOrderKeys(key(12, 3, '2026-01-15', 0, 'z'), key(12, 3, '2026-01-15', 1, 'a'))).toBe(-1);
    expect(compareEventOrderKeys(key(12, 0, '2026-01-31', 0, 'b'), key(12, 0, '2026-01-31', 0, 'a'))).toBe(1);
    expect(compareEventOrderKeys(key(12, 0, '2026-01-31', 0, 'a'), key(12, 0, '2026-01-31', 0, 'a'))).toBe(0);
  });

  it('sorts the events of one installment by phase, then date, then type rank, then id', () => {
    const events: DomainEvent[] = [
      { type: 'ActualPayment', id: 'p', date: d('2026-02-03'), installmentNumber: 12, total: parseMoney('4658.47') },
      { type: 'AdvanceInstallments', id: 'a', date: d('2026-01-10'), count: 6 },
      { type: 'Prepayment', id: 'b', date: d('2026-01-15'), amount: parseMoney('20000.00'), mode: 'REDUCE_TERM' },
      { type: 'FixedChargeChange', id: 'f', date: d('2026-01-01'), fixedCharges: [] },
      {
        type: 'RateChange',
        id: 'r',
        date: d('2026-01-01'),
        interestRate: parseRate('0.075'),
        policy: 'RECALC_INSTALLMENT_KEEP_TERM',
      },
      { type: 'ReportedBalance', id: 'y', date: d('2026-01-31'), balance: parseMoney('469000.00') },
      { type: 'ReportedBalance', id: 'x', date: d('2026-01-31'), balance: parseMoney('470000.00') },
    ];
    const ordered = [...events].sort((a, b) => compareEventOrderKeys(eventOrderKey(a, 12), eventOrderKey(b, 12)));
    expect(ordered.map((event) => event.id)).toEqual(['x', 'y', 'r', 'f', 'a', 'b', 'p']);
  });
});
