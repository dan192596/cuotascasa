import { readFileSync } from 'node:fs';
import { computed, type Signal, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import {
  assertFirstDueDateConsistent,
  buildSchedule,
  type ComponentRealDelta,
  type DomainError,
  type FixedCharge,
  InvalidInputError,
  type LoanTerms,
  type Money,
  NegativeAmortizationError,
  parseLocalDate,
  parseMoney,
  parsePaymentDay,
  parseRate,
} from '@cuotascasa/domain';
import type { ActualPayment, Loan, LoanEvent, ReportedBalance, Uuid } from '@cuotascasa/schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type AnchorDelta,
  DataError,
  type LoanDraft,
  type LoanProjection,
  type LoanProjectionService,
  type LoansStore,
  type RealRecordWrite,
} from '../../../data/api.ts';
import {
  LOAN_EVENTS_STORE,
  LOAN_PROJECTION_SERVICE,
  LOANS_STORE,
  PAYMENTS_STORE,
  REPORTED_BALANCES_STORE,
} from '../../../data/tokens.ts';
import { Announcer } from '../../../ui/feedback/announcer.service.ts';
import { formatLocalDate } from '../../../ui/format/format.ts';
import { RealDataTimelineComponent } from './real-data-timeline.component.ts';

const LOAN_ID = 'a0000000-0000-4000-8000-000000000001' as Uuid;
const STAMPS = {
  createdAt: '2026-10-04T15:00:00.000Z',
  updatedAt: '2026-10-04T15:00:00.000Z',
  updatedByDevice: 'd0000000-0000-4000-8000-000000000001' as Uuid,
  deletedAt: null,
} as const;

/** Synthetic loan: the example of docs/algorithm.md [ALG.EXAMPLE]. Original plan ends 2045-01-31. */
const LOAN = {
  ...STAMPS,
  id: LOAN_ID,
  name: 'Casa A',
  bank: 'Banco Ficticio',
  currency: 'GTQ',
  principal: '500000.00',
  termMonths: 240,
  disbursementDate: '2025-01-31',
  firstDueDate: '2025-02-28',
  paymentDay: 'END_OF_MONTH',
  interestRate: '0.07',
  rateType: 'VARIABLE',
  insuranceRates: ['0.01', '0.0026'],
  fixedCharges: [{ label: 'IUSI', amount: '350.00', effectiveFrom: '2025-02-28' }],
  roundingProfile: 'FHA_GT_V1',
  templateRef: { id: 'fha-gt', version: 1 },
  status: 'active',
} as Loan;

function toLoanTerms(loan: LoanDraft): LoanTerms {
  const paymentDay = parsePaymentDay(loan.paymentDay);
  const firstDueDate = parseLocalDate(loan.firstDueDate);
  assertFirstDueDateConsistent(firstDueDate, paymentDay);
  const fixedCharges: FixedCharge[] = loan.fixedCharges.map((charge) => ({
    label: charge.label,
    amount: parseMoney(charge.amount),
    effectiveFrom: parseLocalDate(charge.effectiveFrom),
  }));
  return {
    principal: parseMoney(loan.principal),
    termMonths: loan.termMonths,
    disbursementDate: parseLocalDate(loan.disbursementDate),
    firstDueDate,
    paymentDay,
    currency: loan.currency,
    interestRate: parseRate(loan.interestRate),
    insuranceRates: loan.insuranceRates.map((value) => parseRate(value)),
    fixedCharges,
    roundingProfile: loan.roundingProfile,
    rateType: loan.rateType,
  };
}
const ORIGINAL_END = buildSchedule(toLoanTerms(LOAN)).endDate;

/** In-memory child store with the contract of data/api.ts (the real stores are off limits to features). */
class MemoryChildStore<T extends { readonly id: Uuid; readonly loanId: Uuid }> {
  readonly readySignal = signal(true);
  readonly ready = this.readySignal.asReadonly();
  readonly records = signal<readonly T[]>([]);
  readonly created: unknown[] = [];
  readonly updated: unknown[] = [];
  readonly deleted: Uuid[] = [];
  failWith: Error | null = null;
  private counter = 0;

  seed(...records: T[]): void {
    this.records.update((current) => [...current, ...records]);
  }

  listByLoan(loanId: Uuid): Signal<readonly T[]> {
    return computed(() => this.records().filter((record) => record.loanId === loanId));
  }

  create(draft: object): Promise<T> {
    if (this.failWith) return Promise.reject(this.failWith);
    this.created.push(draft);
    this.counter += 1;
    const id = `c0000000-0000-4000-8000-00000000000${String(this.counter)}`;
    const record = { ...STAMPS, id, ...draft } as unknown as T;
    this.records.update((current) => [...current, record]);
    return Promise.resolve(record);
  }

  update(update: { readonly id: Uuid }): Promise<T> {
    if (this.failWith) return Promise.reject(this.failWith);
    this.updated.push(update);
    const record = { ...STAMPS, ...update } as unknown as T;
    this.records.update((current) => current.map((candidate) => (candidate.id === update.id ? record : candidate)));
    return Promise.resolve(record);
  }

  delete(id: Uuid): Promise<void> {
    if (this.failWith) return Promise.reject(this.failWith);
    this.deleted.push(id);
    this.records.update((current) => current.filter((candidate) => candidate.id !== id));
    return Promise.resolve();
  }
}

const balance = (id: string, date: string, extra: Partial<ReportedBalance> = {}): ReportedBalance =>
  ({ ...STAMPS, id, loanId: LOAN_ID, date, balance: '480000.00', source: 'BANK_EMAIL', ...extra }) as ReportedBalance;
const payment = (id: string, paidDate: string, extra: Partial<ActualPayment> = {}): ActualPayment =>
  ({ ...STAMPS, id, loanId: LOAN_ID, paidDate, installmentNumber: 3, total: '4600.00', ...extra }) as ActualPayment;
const event = (id: string, date: string, extra: Record<string, unknown>): LoanEvent =>
  ({ ...STAMPS, id, loanId: LOAN_ID, date, ...extra }) as LoanEvent;

class FakeProjection {
  readonly error = signal<DomainError | null>(null);
  readonly realEndDate = signal<string | null>('2045-01-31');
  readonly paidInstallments = signal<ReadonlySet<number>>(new Set());
  readonly realDeltaPerAnchor = signal<readonly AnchorDelta[]>([]);
  readonly realDeltaPerComponent = signal<readonly ComponentRealDelta[]>([]);
}

interface Harness {
  readonly fixture: ComponentFixture<RealDataTimelineComponent>;
  readonly el: HTMLElement;
  readonly balances: MemoryChildStore<ReportedBalance>;
  readonly payments: MemoryChildStore<ActualPayment>;
  readonly events: MemoryChildStore<LoanEvent>;
  readonly projection: FakeProjection;
  readonly refusal: { value: DomainError | null };
  readonly checkRealWrite: ReturnType<typeof vi.fn<(loanId: Uuid, write: RealRecordWrite) => DomainError | null>>;
  readonly polite: ReturnType<typeof vi.spyOn>;
  button(text: string): HTMLButtonElement;
  click(element: Element | null): Promise<void>;
  type(name: string, text: string): Promise<void>;
  choose(name: string, value: string): Promise<void>;
  submit(): Promise<void>;
  testid(id: string): HTMLElement | null;
  all(id: string): HTMLElement[];
  text(id: string): string;
}

async function mount(
  options: { readonly loan?: Loan | undefined; readonly seed?: (h: Harness) => void } = {},
): Promise<Harness> {
  const loan = 'loan' in options ? options.loan : LOAN;
  const balances = new MemoryChildStore<ReportedBalance>();
  const payments = new MemoryChildStore<ActualPayment>();
  const events = new MemoryChildStore<LoanEvent>();
  const projection = new FakeProjection();
  const refusal: { value: DomainError | null } = { value: null };
  const checkRealWrite = vi.fn<(loanId: Uuid, write: RealRecordWrite) => DomainError | null>(() => refusal.value);
  const loans = { ready: signal(true).asReadonly(), loan: () => signal(loan).asReadonly() } as unknown as LoansStore;
  const service = {
    forLoan: () => projection as unknown as LoanProjection,
    checkRealWrite,
    toLoanTerms,
  } as unknown as LoanProjectionService;
  TestBed.configureTestingModule({
    providers: [
      { provide: LOANS_STORE, useValue: loans },
      { provide: LOAN_EVENTS_STORE, useValue: events },
      { provide: REPORTED_BALANCES_STORE, useValue: balances },
      { provide: PAYMENTS_STORE, useValue: payments },
      { provide: LOAN_PROJECTION_SERVICE, useValue: service },
    ],
  });
  const polite = vi.spyOn(TestBed.inject(Announcer), 'polite').mockResolvedValue();
  const fixture = TestBed.createComponent(RealDataTimelineComponent);
  fixture.componentRef.setInput('loanId', LOAN_ID);
  const el = fixture.nativeElement as HTMLElement;
  const control = (name: string) =>
    el.querySelector<HTMLInputElement>(
      `cc-event-form [id$="-${name}"]:is(input, select, textarea)`,
    ) as HTMLInputElement;
  const harness: Harness = {
    fixture,
    el,
    balances,
    payments,
    events,
    projection,
    refusal,
    checkRealWrite,
    polite,
    button(text) {
      const found = [...el.querySelectorAll('button')].find((candidate) => candidate.textContent?.trim() === text);
      if (!found) throw new Error(`No button «${text}»`);
      return found;
    },
    async click(element) {
      (element as HTMLElement | null)?.click();
      await fixture.whenStable();
    },
    async type(name, text) {
      const target = control(name);
      target.value = text;
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('blur'));
      await fixture.whenStable();
    },
    async choose(name, value) {
      const target = control(name);
      target.value = value;
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
      target.dispatchEvent(new Event('blur'));
      await fixture.whenStable();
    },
    async submit() {
      el.querySelector('form')?.requestSubmit();
      await fixture.whenStable();
    },
    testid: (id) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`),
    all: (id) => [...el.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)],
    text: (id) => el.querySelector(`[data-testid="${id}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
  };
  options.seed?.(harness);
  await fixture.whenStable();
  return harness;
}

type Kind =
  'ReportedBalance' | 'ActualPayment' | 'RateChange' | 'FixedChargeChange' | 'Prepayment' | 'AdvanceInstallments';

interface KindCase {
  readonly kind: Kind;
  readonly add: string;
  readonly title: string;
  readonly store: 'balances' | 'payments' | 'events';
  readonly seed: (h: Harness) => void;
  readonly fill: (h: Harness) => Promise<void>;
}

const CASES: readonly KindCase[] = [
  {
    kind: 'ReportedBalance',
    add: 'Agregar saldo reportado',
    title: 'Saldo reportado',
    store: 'balances',
    seed: (h) => h.balances.seed(balance('b1', '2026-05-31')),
    fill: async (h) => {
      await h.type('date', '31/05/2026');
      await h.type('balance', '480,000.00');
      await h.choose('source', 'BANK_EMAIL');
    },
  },
  {
    kind: 'ActualPayment',
    add: 'Agregar pago real',
    title: 'Pago real',
    store: 'payments',
    seed: (h) => h.payments.seed(payment('p1', '2026-05-31')),
    fill: async (h) => {
      await h.type('date', '31/05/2026');
      await h.type('total', '4,658.47');
    },
  },
  {
    kind: 'RateChange',
    add: 'Agregar cambio de tasa',
    title: 'Cambio de tasa',
    store: 'events',
    seed: (h) =>
      h.events.seed(
        event('e1', '2026-06-15', {
          type: 'RateChange',
          policy: 'RECALC_INSTALLMENT_KEEP_TERM',
          interestRate: '0.0725',
        }),
      ),
    fill: async (h) => {
      await h.type('date', '15/06/2026');
      await h.type('interestRate', '7.25');
    },
  },
  {
    kind: 'FixedChargeChange',
    add: 'Agregar cambio de cargos fijos',
    title: 'Cambio de cargos fijos',
    store: 'events',
    seed: (h) =>
      h.events.seed(
        event('e2', '2026-06-15', { type: 'FixedChargeChange', fixedCharges: [{ label: 'IUSI', amount: '350.00' }] }),
      ),
    fill: async (h) => {
      await h.type('date', '15/06/2026');
      await h.click(h.button('Agregar cargo'));
      await h.type('charge-label-0', 'IUSI');
      await h.type('charge-amount-0', '350');
    },
  },
  {
    kind: 'Prepayment',
    add: 'Agregar abono a capital',
    title: 'Abono a capital',
    store: 'events',
    seed: (h) =>
      h.events.seed(event('e3', '2026-06-15', { type: 'Prepayment', amount: '20000.00', mode: 'REDUCE_TERM' })),
    fill: async (h) => {
      await h.type('date', '15/06/2026');
      await h.type('amount', '20000');
      await h.choose('mode', 'REDUCE_TERM');
    },
  },
  {
    kind: 'AdvanceInstallments',
    add: 'Adelantar cuotas',
    title: 'Adelanto de cuotas',
    store: 'events',
    seed: (h) => h.events.seed(event('e4', '2026-06-15', { type: 'AdvanceInstallments', count: 6 })),
    fill: async (h) => {
      await h.type('date', '15/06/2026');
      await h.type('count', '6');
    },
  },
];

beforeEach(() => {
  TestBed.resetTestingModule();
});

describe('cc-real-data-timeline: list', () => {
  it('shows an empty state with the six ways to add a record', async () => {
    const h = await mount();
    expect(h.text('timeline-empty')).toContain('Aún no hay datos reales');
    expect(h.all('timeline-entry')).toHaveLength(0);
    expect([...h.el.querySelectorAll('[data-testid="add-bar"] button')].map((b) => b.textContent?.trim())).toEqual(
      CASES.map((c) => c.add),
    );
  });

  it('lists every record in date order with its description', async () => {
    const h = await mount({
      seed: (x) => {
        x.payments.seed(payment('p1', '2026-05-31'));
        x.balances.seed(balance('b1', '2026-05-31', { installmentNumber: 4 }));
        x.events.seed(event('e3', '2026-01-15', { type: 'Prepayment', amount: '20000.00', mode: 'REDUCE_TERM' }));
      },
    });
    const entries = h.all('timeline-entry');
    expect(entries.map((entry) => entry.querySelector('h3')?.textContent?.trim())).toEqual([
      'Abono a capital',
      'Saldo reportado',
      'Pago real',
    ]);
    expect(entries[0]?.textContent).toContain('15/01/2026');
    expect(entries[0]?.textContent).toContain('Monto: Q 20,000.00');
    expect(entries[1]?.textContent).toContain('Saldo: Q 480,000.00');
  });

  it('says so when the loan does not exist and while the stores load', async () => {
    const missing = await mount({ loan: undefined });
    expect(missing.text('timeline-missing')).toContain('No encontramos este préstamo');
    TestBed.resetTestingModule();
    const loading = await mount({ seed: (x) => x.events.readySignal.set(false) });
    expect(loading.text('timeline-loading')).toContain('Cargando');
    expect(loading.testid('add-bar')).toBeNull();
  });
});

describe('cc-real-data-timeline: projected end date', () => {
  it('shows the end date of the real path and follows the facade', async () => {
    const h = await mount();
    expect(h.text('real-end-date')).toBe('Fin proyectado con tus datos reales: 31/01/2045');
    h.projection.realEndDate.set('2044-07-31');
    await h.fixture.whenStable();
    expect(h.text('real-end-date')).toBe('Fin proyectado con tus datos reales: 31/07/2044');
    h.projection.realEndDate.set(null);
    await h.fixture.whenStable();
    expect(h.testid('real-end-date')).toBeNull();
  });
});

describe('cc-real-data-timeline: add', () => {
  it.each(CASES)('adds a $kind through cc-event-form and shows it on the timeline', async (c) => {
    const h = await mount();
    await h.click(h.button(c.add));
    expect(h.el.querySelector('cc-event-form')).not.toBeNull();
    await c.fill(h);
    await h.submit();

    expect(h[c.store].created).toHaveLength(1);
    expect(h.checkRealWrite).toHaveBeenCalledTimes(1);
    expect(h.checkRealWrite.mock.calls[0]?.[0]).toBe(LOAN_ID);
    expect(h.el.querySelector('cc-event-form')).toBeNull();
    expect(h.all('timeline-entry')).toHaveLength(1);
    expect(h.all('timeline-entry')[0]?.querySelector('h3')?.textContent?.trim()).toBe(c.title);
    expect(h.polite).toHaveBeenCalledTimes(1);
    expect(String(h.polite.mock.calls[0]?.[0])).toContain('Se guardó');
  });

  it('shows the «Listo» banner after a save (announced once) and hides it when the next form opens', async () => {
    const h = await mount();
    await h.click(h.button('Agregar abono a capital'));
    await CASES[4]!.fill(h);
    await h.submit();
    await h.fixture.whenStable();
    const notice = h.testid('save-notice');
    const said = String(h.polite.mock.calls[0]?.[0]);
    expect(notice?.querySelector('[data-testid="banner-tone"]')?.textContent).toBe('Listo');
    expect(notice?.querySelector('.message')?.textContent?.trim()).toBe(said);
    expect(notice?.querySelector('[data-testid="banner"]')?.getAttribute('data-tone')).toBe('success');
    expect(notice?.querySelector('[data-testid="banner"]')?.hasAttribute('role')).toBe(false);
    expect(notice?.querySelector('.check')).not.toBeNull();
    expect(h.polite).toHaveBeenCalledTimes(1);
    await h.click(h.button('Agregar pago real'));
    expect(h.testid('save-notice')).toBeNull();
  });

  it('writes the loan id and the dry-run write sees the same record that the store gets', async () => {
    const h = await mount();
    await h.click(h.button('Agregar abono a capital'));
    await CASES[4]!.fill(h);
    await h.submit();
    const write = h.checkRealWrite.mock.calls[0]?.[1];
    expect(write?.entity).toBe('LoanEvent');
    expect(write?.record).toEqual(h.events.created[0]);
    expect(h.events.created[0]).toMatchObject({ loanId: LOAN_ID, type: 'Prepayment', amount: '20000.00' });
    expect('id' in (write?.record ?? {})).toBe(false);
  });

  it('moves focus into the form and, on cancel, back to the button that opened it', async () => {
    const h = await mount();
    const opener = h.button('Agregar pago real');
    await h.click(opener);
    expect((document.activeElement as HTMLElement).id).toMatch(/-date$/);
    await h.click(h.button('Cancelar'));
    expect(h.el.querySelector('cc-event-form')).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(h.checkRealWrite).not.toHaveBeenCalled();
  });
});

describe('cc-real-data-timeline: edit and delete', () => {
  it.each(CASES)('edits a $kind and keeps the record id', async (c) => {
    const h = await mount({ seed: c.seed });
    await h.click(h.testid('edit-entry'));
    expect(h.el.querySelector('cc-event-form')).not.toBeNull();
    await h.type('note', 'Revisado con el banco');
    await h.submit();

    const store = h[c.store];
    expect(store.updated).toHaveLength(1);
    expect(store.updated[0]).toMatchObject({ note: 'Revisado con el banco', loanId: LOAN_ID });
    const id = (store.updated[0] as { id: string }).id;
    expect(id).toMatch(/^[bpe]\d$/);
    expect(h.checkRealWrite.mock.calls[0]?.[1].record).toMatchObject({ id });
    expect(store.created).toHaveLength(0);
    expect(h.all('timeline-entry')).toHaveLength(1);
    expect(h.el.querySelector('cc-event-form')).toBeNull();
    expect(document.activeElement).toBe(h.testid('edit-entry'));
  });

  it.each(CASES)('deletes a $kind after confirming', async (c) => {
    const h = await mount({ seed: c.seed });
    await h.click(h.testid('delete-entry'));
    expect(h.testid('confirm-ok')).not.toBeNull();
    expect(h[c.store].deleted).toHaveLength(0);
    await h.click(h.testid('confirm-ok'));

    expect(h[c.store].deleted).toHaveLength(1);
    expect(h.all('timeline-entry')).toHaveLength(0);
    expect(h.testid('confirm-ok')).toBeNull();
    expect(h.polite).toHaveBeenCalledTimes(1);
    expect(String(h.polite.mock.calls[0]?.[0])).toContain('Se eliminó');
  });

  it('keeps the record when the confirmation is cancelled', async () => {
    const h = await mount({ seed: CASES[0]!.seed });
    const opener = h.testid('delete-entry');
    await h.click(opener);
    await h.click(h.testid('confirm-cancel'));
    expect(h.balances.deleted).toHaveLength(0);
    expect(h.all('timeline-entry')).toHaveLength(1);
    expect(h.testid('confirm-ok')).toBeNull();
    expect(h.polite).not.toHaveBeenCalled();
  });

  it('shows a Spanish error and keeps the record when the delete fails', async () => {
    const h = await mount({ seed: CASES[0]!.seed });
    h.balances.failWith = new DataError('STORAGE', 'secret 480000.00');
    await h.click(h.testid('delete-entry'));
    await h.click(h.testid('confirm-ok'));
    expect(h.all('timeline-entry')).toHaveLength(1);
    expect(h.text('write-error')).toContain('almacenamiento');
    expect(h.text('write-error')).not.toContain('480000');
  });
});

describe('cc-real-data-timeline: dry run and write errors (HU-10)', () => {
  it('shows a refused write inline, keeps the form and the typed values, and does not write', async () => {
    const h = await mount();
    h.refusal.value = new NegativeAmortizationError(
      'ALG.RATE.KEEP_INSTALLMENT',
      7,
      parseMoney('1000.00'),
      parseMoney('1234.56'),
    );
    await h.click(h.button('Agregar cambio de tasa'));
    await CASES[2]!.fill(h);
    await h.submit();

    expect(h.events.created).toHaveLength(0);
    expect(h.el.querySelector('cc-event-form')).not.toBeNull();
    const shown = h.text('write-error');
    expect(shown).toMatch(/amortización negativa/i);
    expect(shown).toContain('cuota 7');
    expect(shown).not.toContain('1234.56');
    expect(
      h.testid('write-error')?.querySelector('[role="alert"]') ?? h.testid('write-error')?.closest('[role="alert"]'),
    ).not.toBeNull();
    expect((h.el.querySelector('[id$="-interestRate"]') as HTMLInputElement).value).toContain('7.25');

    h.refusal.value = null;
    await h.submit();
    expect(h.events.created).toHaveLength(1);
    expect(h.testid('write-error')).toBeNull();
  });

  it('clears the refusal banner as soon as the user edits the form', async () => {
    const h = await mount();
    h.refusal.value = new InvalidInputError('INVALID_EVENT', 'x');
    await h.click(h.button('Agregar abono a capital'));
    await CASES[4]!.fill(h);
    await h.submit();
    expect(h.testid('write-error')).not.toBeNull();
    await h.type('amount', '15000');
    expect(h.testid('write-error')).toBeNull();
  });

  it('never throws when the facade reports another typed error', async () => {
    const h = await mount();
    h.refusal.value = new InvalidInputError('INSTALLMENT_OUT_OF_RANGE', 'x', { k: 0, max: 240 });
    await h.click(h.button('Agregar pago real'));
    await CASES[1]!.fill(h);
    await h.submit();
    expect(h.payments.created).toHaveLength(0);
    expect(h.text('write-error')).toContain('fuera del plazo');
  });

  it.each([
    ['STORAGE', 'almacenamiento'],
    ['NOT_FOUND', 'ya no existe'],
    ['VALIDATION', 'No se guardó'],
  ] as const)('maps the store rejection %s to Spanish text without its message', async (code, expected) => {
    const h = await mount();
    h.events.failWith = new DataError(code, 'secret 20000.00');
    await h.click(h.button('Agregar abono a capital'));
    await CASES[4]!.fill(h);
    await h.submit();
    expect(h.el.querySelector('cc-event-form')).not.toBeNull();
    expect(h.text('write-error')).toContain(expected);
    expect(h.text('write-error')).not.toContain('20000');
    expect(h.all('timeline-entry')).toHaveLength(0);
  });

  it('shows an engine error of the stored data inline instead of throwing', async () => {
    const h = await mount({ seed: CASES[2]!.seed });
    h.projection.error.set(new NegativeAmortizationError('ALG.TERM', 12, parseMoney('1000.00'), parseMoney('1234.56')));
    await h.fixture.whenStable();
    expect(h.text('engine-error')).toMatch(/amortización negativa/i);
    expect(h.text('engine-error')).toContain('cuota 12');
    expect(h.text('engine-error')).not.toContain('1234.56');
    expect(h.all('timeline-entry')).toHaveLength(1);
    h.projection.error.set(null);
    await h.fixture.whenStable();
    expect(h.testid('engine-error')).toBeNull();
  });
});

describe('cc-real-data-timeline: end date for the form', () => {
  it('uses the real path end date when the facade has one', async () => {
    const h = await mount();
    h.projection.realEndDate.set('2030-01-31');
    await h.click(h.button('Agregar abono a capital'));
    await h.type('date', '15/06/2031');
    await h.submit();
    expect(h.el.querySelector('cc-event-form')?.textContent).toContain('posterior al fin del préstamo (31/01/2030)');
  });

  it("falls back to the original plan's end date while realEndDate() is null", async () => {
    const h = await mount();
    h.projection.realEndDate.set(null);
    await h.click(h.button('Agregar abono a capital'));
    await h.type('date', '15/06/2045');
    await h.submit();
    expect(ORIGINAL_END).toBe('2045-01-31');
    expect(h.el.querySelector('cc-event-form')?.textContent).toContain(
      `posterior al fin del préstamo (${formatLocalDate(ORIGINAL_END)})`,
    );
  });
});

describe('cc-real-data-timeline: Real Δ and validation chip', () => {
  const delta = (over: Partial<AnchorDelta> = {}): AnchorDelta => ({
    eventId: 'b1',
    k: 4,
    reported: '480000.00' as Money,
    projected: '479900.00' as Money,
    realDelta: '100.00' as Money,
    status: 'AMBER',
    cause: null,
    ...over,
  });

  it('shows Real Δ = reported - projected and the traffic-light chip of each reported balance', async () => {
    const h = await mount({
      seed: (x) => {
        x.balances.seed(balance('b1', '2026-05-31'), balance('b2', '2026-06-30'), balance('b3', '2026-07-31'));
        x.projection.realDeltaPerAnchor.set([
          delta(),
          delta({
            eventId: 'b2',
            reported: '470000.00' as Money,
            projected: '470000.00' as Money,
            realDelta: '0.00' as Money,
            status: 'GREEN',
          }),
          delta({
            eventId: 'b3',
            reported: '400000.00' as Money,
            projected: '460000.00' as Money,
            realDelta: '-60000.00' as Money,
            status: 'RED',
          }),
        ]);
      },
    });
    const entries = h.all('timeline-entry');
    const read = (entry: HTMLElement, id: string) =>
      entry.querySelector(`[data-testid="${id}"]`)?.textContent?.replace(/\s+/g, ' ').trim();
    expect(entries.map((entry) => read(entry, 'real-delta'))).toEqual([
      'Real Δ: +Q 100.00',
      'Real Δ: Q 0.00',
      'Real Δ: -Q 60,000.00',
    ]);
    expect(entries.map((entry) => read(entry, 'projected-balance'))).toEqual([
      'Saldo proyectado: Q 479,900.00',
      'Saldo proyectado: Q 470,000.00',
      'Saldo proyectado: Q 460,000.00',
    ]);
    expect(entries.map((entry) => read(entry, 'chip-label'))).toEqual([
      'Diferencia pequeña',
      'Coincide',
      'Diferencia grande',
    ]);
  });

  it('shows neutral «Calculando…» text, not a chip, for a balance with no delta yet', async () => {
    const h = await mount({ seed: (x) => x.balances.seed(balance('b1', '2026-05-31')) });
    expect(h.testid('chip')).toBeNull();
    expect(h.testid('real-delta')).toBeNull();
    expect(h.text('delta-pending')).toContain('Calculando…');
    expect(h.el.textContent).not.toContain('Sin validar');
  });

  it('does not claim «Calculando…» or a chip while an engine error blocks the comparison', async () => {
    const h = await mount({ seed: (x) => x.balances.seed(balance('b1', '2026-05-31')) });
    h.projection.error.set(new InvalidInputError('INVALID_EVENT', 'x'));
    await h.fixture.whenStable();
    expect(h.testid('chip')).toBeNull();
    expect(h.text('delta-pending')).not.toContain('Calculando');
    expect(h.text('delta-pending')).toContain('no disponible');
  });

  it('treats an UNVALIDATED delta of the facade as unvalidated: chip and no hard failure', async () => {
    const h = await mount({
      seed: (x) => {
        x.balances.seed(balance('b1', '2026-05-31'));
        x.projection.realDeltaPerAnchor.set([delta({ status: 'UNVALIDATED' })]);
      },
    });
    expect(h.text('chip-label')).toBe('Sin validar');
    expect(h.text('real-delta')).toBe('Real Δ: +Q 100.00');
  });

  it('shows the cause of a delta when the facade names one', async () => {
    const h = await mount({
      seed: (x) => {
        x.balances.seed(balance('b1', '2026-05-31'));
        x.projection.realDeltaPerAnchor.set([delta({ status: 'RED', cause: 'INSTALLMENT_MISALIGNMENT' })]);
      },
    });
    expect(h.text('delta-cause')).toContain('otra cuota');
  });
});

describe('cc-real-data-timeline: informational fields', () => {
  it('shows the reported installment, rate and note of a reported balance when present', async () => {
    const h = await mount({
      seed: (x) =>
        x.balances.seed(
          balance('b1', '2026-05-31', { totalInstallment: '4658.47', reportedRate: '0.0725', note: 'Correo del 31' }),
        ),
    });
    const text = h.testid('timeline-entry')?.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(text).toContain('Cuota informada por el banco: Q 4,658.47');
    expect(text).toContain('Tasa informada: 7.25 %');
    expect(text).toContain('Nota: Correo del 31');
  });

  it('omits them when absent', async () => {
    const h = await mount({ seed: (x) => x.balances.seed(balance('b1', '2026-05-31')) });
    const text = h.testid('timeline-entry')?.textContent ?? '';
    expect(text).not.toContain('Cuota informada');
    expect(text).not.toContain('Tasa informada');
    expect(text).not.toContain('Nota:');
  });
});

describe('cc-real-data-timeline: focus', () => {
  it('opens the confirmation on «Cancelar»', async () => {
    const h = await mount({ seed: CASES[0]!.seed });
    await h.click(h.testid('delete-entry'));
    expect(document.activeElement).toBe(h.testid('confirm-cancel'));
  });

  it('moves focus to the timeline heading after a delete', async () => {
    const h = await mount({ seed: CASES[0]!.seed });
    await h.click(h.testid('delete-entry'));
    await h.click(h.testid('confirm-ok'));
    expect(document.activeElement).toBe(h.el.querySelector('#timeline-title'));
  });

  it('returns focus to the opener after a cancelled delete', async () => {
    const h = await mount({ seed: CASES[0]!.seed });
    const opener = h.testid('delete-entry');
    await h.click(opener);
    await h.click(h.testid('confirm-cancel'));
    expect(document.activeElement).toBe(opener);
  });

  it('returns focus to the opener after a failed delete', async () => {
    const h = await mount({ seed: CASES[0]!.seed });
    h.balances.failWith = new DataError('STORAGE');
    const opener = h.testid('delete-entry');
    await h.click(opener);
    await h.click(h.testid('confirm-ok'));
    expect(h.testid('write-error')).not.toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});

describe('cc-real-data-timeline: payments', () => {
  it('marks the installment of each ActualPayment as paid when the facade says so', async () => {
    const h = await mount({
      seed: (x) => {
        x.payments.seed(
          payment('p1', '2026-03-31', { installmentNumber: 3 }),
          payment('p2', '2026-04-30', { installmentNumber: 4 }),
        );
        x.projection.paidInstallments.set(new Set([3]));
      },
    });
    const [first, second] = h.all('timeline-entry');
    expect(first?.querySelector('[data-testid="paid-mark"]')?.textContent?.trim()).toBe('Cuota 3 pagada');
    expect(second?.querySelector('[data-testid="paid-mark"]')).toBeNull();
    h.projection.paidInstallments.set(new Set([3, 4]));
    await h.fixture.whenStable();
    expect(h.all('paid-mark').map((mark) => mark.textContent?.trim())).toEqual(['Cuota 3 pagada', 'Cuota 4 pagada']);
  });

  it('colours the paid mark with the accent (ya es tuyo), never the positive green reserved for «coincide»', () => {
    const src = readFileSync('apps/web/src/app/features/real-data/timeline/real-data-timeline.component.ts', 'utf8');
    expect(src).toMatch(/\.paid \{\s*color: var\(--cc-color-accent\);/);
    expect(src).not.toContain('--cc-color-positive');
  });

  it('shows Real Δ per component (real - projected) for a payment with a breakdown', async () => {
    const h = await mount({
      seed: (x) => {
        x.payments.seed(
          payment('p1', '2026-03-31', {
            breakdown: { capital: '1000.00', interest: '2800.00', insurance: '400.00', fixedCharges: '350.00' },
          }),
          payment('p2', '2026-04-30', { installmentNumber: 4 }),
        );
        x.projection.realDeltaPerComponent.set([
          {
            eventId: 'p1',
            k: 3,
            capital: '-1.50' as Money,
            interest: '2.00' as Money,
            insurance: '0.00' as Money,
            fixedCharges: '0.25' as Money,
          },
        ]);
      },
    });
    const [first, second] = h.all('timeline-entry');
    const rows = [...(first?.querySelectorAll('[data-testid="component-delta"]') ?? [])].map((row) =>
      row.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(rows).toEqual(['Capital: -Q 1.50', 'Interés: +Q 2.00', 'Seguro: Q 0.00', 'Cargos fijos: +Q 0.25']);
    expect(second?.querySelector('[data-testid="component-delta"]')).toBeNull();
  });
});
