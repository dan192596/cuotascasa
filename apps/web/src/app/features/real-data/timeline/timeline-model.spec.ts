import { InvalidInputError, NegativeAmortizationError, parseMoney } from '@cuotascasa/domain';
import type { ActualPayment, LoanEvent, ReportedBalance } from '@cuotascasa/schema';
import { describe, expect, it } from 'vitest';
import {
  buildTimeline,
  describeEngineError,
  describeEntry,
  entryFormKind,
  entryToFormValue,
  formatDelta,
  toRealWrite,
} from './timeline-model.ts';

const LOAN = 'a0000000-0000-4000-8000-000000000001';
const STAMPS = {
  createdAt: '2026-10-04T15:00:00.000Z',
  updatedAt: '2026-10-04T15:00:00.000Z',
  updatedByDevice: 'd0000000-0000-4000-8000-000000000001',
  deletedAt: null,
} as const;

const balance = (id: string, date: string, extra: Partial<ReportedBalance> = {}): ReportedBalance =>
  ({ ...STAMPS, id, loanId: LOAN, date, balance: '480000.00', source: 'BANK_EMAIL', ...extra }) as ReportedBalance;
const payment = (id: string, paidDate: string, extra: Partial<ActualPayment> = {}): ActualPayment =>
  ({ ...STAMPS, id, loanId: LOAN, paidDate, installmentNumber: 3, total: '4600.00', ...extra }) as ActualPayment;
const prepayment = (id: string, date: string, extra: Record<string, unknown> = {}): LoanEvent =>
  ({
    ...STAMPS,
    id,
    loanId: LOAN,
    date,
    type: 'Prepayment',
    amount: '10000.00',
    mode: 'REDUCE_TERM',
    ...extra,
  }) as LoanEvent;

describe('buildTimeline', () => {
  it('merges the three collections ordered by date, then by kind, then by creation', () => {
    const entries = buildTimeline(
      [balance('b1', '2026-05-15'), balance('b2', '2026-03-15')],
      [payment('p1', '2026-05-15')],
      [prepayment('e1', '2026-05-15'), prepayment('e0', '2026-01-10')],
    );
    expect(entries.map((entry) => entry.record.id)).toEqual(['e0', 'b2', 'b1', 'p1', 'e1']);
    expect(entries.map((entry) => entry.date)).toEqual([
      '2026-01-10',
      '2026-03-15',
      '2026-05-15',
      '2026-05-15',
      '2026-05-15',
    ]);
  });

  it('breaks ties of the same date and kind by creation instant, then id', () => {
    const later = balance('b9', '2026-05-15', { createdAt: '2026-10-05T00:00:00.000Z' });
    const first = balance('b8', '2026-05-15');
    expect(buildTimeline([later, first], [], []).map((entry) => entry.record.id)).toEqual(['b8', 'b9']);
    const twin = balance('b0', '2026-05-15');
    expect(buildTimeline([first, twin], [], []).map((entry) => entry.record.id)).toEqual(['b0', 'b8']);
  });

  it('is empty without records', () => {
    expect(buildTimeline([], [], [])).toEqual([]);
  });
});

describe('form values', () => {
  it('names the form kind of each entry', () => {
    const [b, p, e] = buildTimeline(
      [balance('b1', '2026-05-15')],
      [payment('p1', '2026-05-16')],
      [prepayment('e1', '2026-05-17')],
    );
    expect([b, p, e].map((entry) => entryFormKind(entry!))).toEqual(['ReportedBalance', 'ActualPayment', 'Prepayment']);
  });

  it('strips the stamps of a stored record into the draft the form edits', () => {
    const [entry] = buildTimeline([balance('b1', '2026-05-15', { installmentNumber: 4 })], [], []);
    expect(entryToFormValue(entry!)).toEqual({
      entity: 'ReportedBalance',
      draft: { loanId: LOAN, date: '2026-05-15', balance: '480000.00', source: 'BANK_EMAIL', installmentNumber: 4 },
    });
    const [pay] = buildTimeline([], [payment('p1', '2026-05-15')], []);
    expect(entryToFormValue(pay!)).toEqual({
      entity: 'ActualPayment',
      draft: { loanId: LOAN, paidDate: '2026-05-15', installmentNumber: 3, total: '4600.00' },
    });
    const [event] = buildTimeline([], [], [prepayment('e1', '2026-05-15')]);
    expect(entryToFormValue(event!)).toEqual({
      entity: 'LoanEvent',
      draft: { loanId: LOAN, date: '2026-05-15', type: 'Prepayment', amount: '10000.00', mode: 'REDUCE_TERM' },
    });
  });

  it('builds a create write without id and an update write with the id of the edited record', () => {
    const value = {
      entity: 'ActualPayment',
      draft: { loanId: LOAN, paidDate: '2026-05-15', installmentNumber: 3, total: '4600.00' },
    } as const;
    expect(toRealWrite(value, null)).toEqual({ entity: 'ActualPayment', record: value.draft });
    expect(toRealWrite(value, 'p1')).toEqual({ entity: 'ActualPayment', record: { ...value.draft, id: 'p1' } });
  });
});

describe('describeEntry', () => {
  const describe1 = (entry: Parameters<typeof describeEntry>[0]) => describeEntry(entry, 'GTQ');

  it('describes a reported balance with its installment and source', () => {
    const [entry] = buildTimeline([balance('b1', '2026-05-15', { installmentNumber: 4 })], [], []);
    expect(describe1(entry!)).toEqual({
      title: 'Saldo reportado',
      lines: ['Saldo: Q 480,000.00', 'Cuota 4', 'Origen: Correo del banco'],
    });
  });

  it('says the installment is the next one on or after the date when the balance has none', () => {
    const [entry] = buildTimeline([balance('b1', '2026-05-15')], [], []);
    expect(describe1(entry!).lines).toContain('Cuota: la primera con vencimiento desde esa fecha');
  });

  it('describes a payment and its breakdown', () => {
    const [entry] = buildTimeline(
      [],
      [
        payment('p1', '2026-05-15', {
          breakdown: { capital: '1.00', interest: '2.00', insurance: '3.00', fixedCharges: '4.00' },
        }),
      ],
      [],
    );
    expect(describe1(entry!)).toEqual({
      title: 'Pago real',
      lines: [
        'Cuota 3',
        'Monto pagado: Q 4,600.00',
        'Desglose: capital Q 1.00, interés Q 2.00, seguro Q 3.00, cargos Q 4.00',
      ],
    });
  });

  it('describes the four event families', () => {
    const rate = { type: 'RateChange', policy: 'KEEP_INSTALLMENT_ADJUST_TERM', interestRate: '0.0725' };
    const fixed = {
      type: 'FixedChargeChange',
      fixedCharges: [
        { label: 'IUSI', amount: '350.00' },
        { label: 'Otro', amount: '10.50' },
      ],
    };
    const [r, f, p, a] = buildTimeline(
      [],
      [],
      [
        prepayment('e1', '2026-01-01', rate),
        prepayment('e2', '2026-01-02', fixed),
        prepayment('e3', '2026-01-03', { commission: { kind: 'PERCENT', rate: '0.02' }, mode: 'REDUCE_INSTALLMENT' }),
        prepayment('e4', '2026-01-04', { type: 'AdvanceInstallments', count: 6, amount: undefined, mode: undefined }),
      ],
    );
    expect(describe1(r!)).toEqual({
      title: 'Cambio de tasa',
      lines: ['Nueva tasa: 7.25 %', 'Mantener la cuota y ajustar el plazo'],
    });
    expect(describe1(f!)).toEqual({
      title: 'Cambio de cargos fijos',
      lines: ['2 cargos por Q 360.50 al mes'],
    });
    expect(describe1(p!)).toEqual({
      title: 'Abono a capital',
      lines: ['Monto: Q 10,000.00', 'Reduce la cuota', 'Comisión: 2.00 %'],
    });
    expect(describe1(a!)).toEqual({ title: 'Adelanto de cuotas', lines: ['Cuotas adelantadas: 6'] });
  });

  it('describes a bank installment, a flat commission and an empty charge list', () => {
    const [r, p, f] = buildTimeline(
      [],
      [],
      [
        prepayment('e1', '2026-01-01', {
          type: 'RateChange',
          policy: 'BANK_INSTALLMENT',
          bankInstallment: '4000.00',
          interestRate: '0.07',
          amount: undefined,
          mode: undefined,
        }),
        prepayment('e2', '2026-01-02', { commission: { kind: 'FLAT', amount: '50.00' } }),
        prepayment('e3', '2026-01-03', {
          type: 'FixedChargeChange',
          fixedCharges: [],
          amount: undefined,
          mode: undefined,
        }),
      ],
    );
    expect(describe1(r!).lines).toEqual(['Nueva tasa: 7.00 %', 'Cuota del banco: Q 4,000.00']);
    expect(describe1(p!).lines).toContain('Comisión: Q 50.00');
    expect(describe1(f!).lines).toEqual(['Sin cargos fijos desde esa fecha']);
  });
});

describe('formatDelta', () => {
  it('prefixes positive differences with a plus sign and leaves zero and negatives alone', () => {
    expect(formatDelta('12.30', 'GTQ')).toBe('+Q 12.30');
    expect(formatDelta('0.00', 'GTQ')).toBe('Q 0.00');
    expect(formatDelta('-5.00', 'USD')).toBe('-US$ 5.00');
  });
});

describe('describeEngineError', () => {
  it('explains a negative amortization with the installment and no amounts', () => {
    const error = new NegativeAmortizationError(
      'ALG.RATE.KEEP_INSTALLMENT',
      7,
      parseMoney('1000.00'),
      parseMoney('1234.56'),
    );
    const text = describeEngineError(error);
    expect(text).toContain('cuota 7');
    expect(text).toMatch(/amortización negativa/i);
    expect(text).not.toContain('1234.56');
    expect(text).not.toContain('1000.00');
  });

  it('maps invalid input by code and falls back for anything else', () => {
    expect(describeEngineError(new InvalidInputError('INSTALLMENT_OUT_OF_RANGE', 'x', { k: 0, max: 240 }))).toContain(
      'fuera del plazo',
    );
    expect(describeEngineError(new InvalidInputError('INVALID_EVENT', 'secret 123.45'))).not.toContain('123.45');
    expect(describeEngineError(new Error('boom 99.99'))).toBe(
      'No se pudo calcular el préstamo con estos datos reales. Revisa los registros e inténtalo de nuevo.',
    );
  });
});
