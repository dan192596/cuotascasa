import { computed, signal, type Signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import {
  assertFirstDueDateConsistent,
  type DomainError,
  type FixedCharge,
  InvalidInputError,
  type LoanTerms,
  type Money,
  parseLocalDate,
  parseMoney,
  parsePaymentDay,
  parseRate,
} from '@cuotascasa/domain';
import type { Loan, LoanEvent, LoanStatus, Uuid } from '@cuotascasa/schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DataError,
  type LoanDraft,
  type LoanEventsStore,
  type LoanMetrics,
  type LoanProjection,
  type LoanProjectionService,
  type LoansStore,
  type LoanUpdate,
} from '../../../data/api.ts';
import { LOAN_EVENTS_STORE, LOAN_PROJECTION_SERVICE, LOANS_STORE } from '../../../data/tokens.ts';
import { Announcer } from '../../../ui/feedback/announcer.service.ts';
import { LoanDetailPageComponent } from './loan-detail-page.component.ts';

const LOAN_ID = '00000000-0000-4000-8000-0000000000aa' as Uuid;
const EVENT_ID = '00000000-0000-4000-8000-0000000000ee' as Uuid;

/** Synthetic loan with round figures. */
function loan(over: Partial<Loan> = {}): Loan {
  return {
    id: LOAN_ID,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    updatedByDevice: '00000000-0000-4000-8000-0000000000bb',
    deletedAt: null,
    name: 'Casa A',
    bank: 'Banco Ficticio',
    currency: 'GTQ',
    principal: '500000.00',
    termMonths: 240,
    disbursementDate: '2026-12-15',
    firstDueDate: '2027-01-31',
    paymentDay: 'END_OF_MONTH',
    interestRate: '0.07',
    insuranceRates: ['0.01', '0.0026'],
    fixedCharges: [{ label: 'IUSI', amount: '250.00', effectiveFrom: '2027-01-31' }],
    roundingProfile: 'FHA_GT_V1',
    rateType: 'VARIABLE',
    templateRef: { id: 'fha-gt', version: 1 },
    status: 'active',
    ...over,
  } as Loan;
}

class FakeLoansStore implements Partial<LoansStore> {
  readonly ready = signal(true);
  readonly all = signal<readonly Loan[]>([loan()]);
  readonly loans = this.all.asReadonly();
  readonly locked = signal(false);
  readonly statusCalls: { id: Uuid; status: LoanStatus }[] = [];
  readonly updates: LoanUpdate[] = [];
  readonly deleted: Uuid[] = [];
  failWith: Error | null = null;

  loan(id: Uuid): Signal<Loan | undefined> {
    return computed(() => this.all().find((candidate) => candidate.id === id));
  }

  isCurrencyLocked(): Signal<boolean> {
    return this.locked.asReadonly();
  }

  setStatus(id: Uuid, status: LoanStatus): Promise<Loan> {
    if (this.failWith) return Promise.reject(this.failWith);
    this.statusCalls.push({ id, status });
    this.all.update((current) => current.map((item) => (item.id === id ? ({ ...item, status } as Loan) : item)));
    return Promise.resolve(this.all().find((item) => item.id === id) as Loan);
  }

  update(update: LoanUpdate): Promise<Loan> {
    if (this.failWith) return Promise.reject(this.failWith);
    this.updates.push(update);
    const next = { ...(this.all().find((item) => item.id === update.id) as Loan), ...update } as Loan;
    this.all.update((current) => current.map((item) => (item.id === update.id ? next : item)));
    return Promise.resolve(next);
  }

  delete(id: Uuid): Promise<void> {
    if (this.failWith) return Promise.reject(this.failWith);
    this.deleted.push(id);
    this.all.update((current) => current.filter((item) => item.id !== id));
    return Promise.resolve();
  }
}

/** Events of the loan; the page never writes them, so every write method is a spy that must stay untouched. */
function fakeEvents() {
  const stored = signal<readonly LoanEvent[]>([{ id: EVENT_ID, loanId: LOAN_ID } as LoanEvent]);
  const store = {
    ready: signal(true).asReadonly(),
    listByLoan: () => stored.asReadonly(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  return { stored, store: store as unknown as LoanEventsStore, writes: [store.create, store.update, store.delete] };
}

function toLoanTerms(draft: LoanDraft): LoanTerms {
  const paymentDay = parsePaymentDay(draft.paymentDay);
  const firstDueDate = parseLocalDate(draft.firstDueDate);
  assertFirstDueDateConsistent(firstDueDate, paymentDay);
  const fixedCharges: FixedCharge[] = draft.fixedCharges.map((charge) => ({
    label: charge.label,
    amount: parseMoney(charge.amount),
    effectiveFrom: parseLocalDate(charge.effectiveFrom),
  }));
  return {
    principal: parseMoney(draft.principal),
    termMonths: draft.termMonths,
    disbursementDate: parseLocalDate(draft.disbursementDate),
    firstDueDate,
    paymentDay,
    currency: draft.currency,
    interestRate: parseRate(draft.interestRate),
    insuranceRates: draft.insuranceRates.map((value) => parseRate(value)),
    fixedCharges,
    roundingProfile: draft.roundingProfile,
    rateType: draft.rateType,
  };
}

/** Projection double: the metrics are a function of the stored principal, so a recomputation is observable. */
function fakeProjection(store: FakeLoansStore) {
  const suggestedPaid = signal(false);
  const error = signal<DomainError | null>(null);
  const current = computed(() => store.loan(LOAN_ID)());
  const negative = signal(false);
  const metrics = computed<LoanMetrics | null>(() => {
    const principal = current()?.principal ?? '0.00';
    return {
      realVsOriginal: {
        currency: 'GTQ',
        interestSaved: (negative() ? '-1234.50' : '1234.50') as Money,
        monthsSaved: negative() ? -3 : 12,
        baseEndDate: '2047-01-31',
        endDate: '2046-01-31',
        baseTotalPaid: principal as Money,
        totalPaid: '998765.43' as Money,
        netSaving: (negative() ? '-4321.00' : '4321.00') as Money,
      },
      activeScenarioVsReal: null,
    } as LoanMetrics;
  });
  const sig = <T>(value: T): Signal<T> => signal(value).asReadonly();
  const projection = {
    loanId: LOAN_ID,
    error: error.asReadonly(),
    paths: sig(null),
    metrics,
    percentPaid: sig('12.5'),
    balance: sig('437500.00' as Money),
    nextInstallmentTotal: sig('4658.47' as Money),
    currentInstallment: sig({ dueDate: '2027-02-28' }),
    realEndDate: sig('2046-01-31'),
    activeScenarioEndDate: sig(null),
    validation: sig({ status: 'GREEN', reportedBalanceId: null, k: null, realDelta: null, cause: null }),
    suggestedPaid: suggestedPaid.asReadonly(),
  } as unknown as LoanProjection;
  const service = { forLoan: () => projection, toLoanTerms } as unknown as LoanProjectionService;
  return { service, suggestedPaid, error, negative };
}

async function setup(initial: Partial<{ status: LoanStatus; ready: boolean; missing: boolean }> = {}) {
  const store = new FakeLoansStore();
  if (initial.status) store.all.set([loan({ status: initial.status })]);
  if (initial.missing) store.all.set([]);
  store.ready.set(initial.ready ?? true);
  const events = fakeEvents();
  const projection = fakeProjection(store);
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: LOANS_STORE, useValue: store },
      { provide: LOAN_EVENTS_STORE, useValue: events.store },
      { provide: LOAN_PROJECTION_SERVICE, useValue: projection.service },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const announce = vi.spyOn(TestBed.inject(Announcer), 'polite').mockResolvedValue();
  const fixture = TestBed.createComponent(LoanDetailPageComponent);
  fixture.componentRef.setInput('id', LOAN_ID);
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector);
  const text = (testId: string) => q(`[data-testid="${testId}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const settle = async () => {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
  };
  const button = (label: string) =>
    [...document.querySelectorAll('button')].find((candidate) => candidate.textContent?.trim() === label) as
      HTMLButtonElement | undefined;
  const click = async (label: string) => {
    const target = button(label);
    if (!target) throw new Error(`No button «${label}»`);
    target.click();
    await settle();
  };
  const type = async (selector: string, value: string) => {
    const input = document.querySelector<HTMLInputElement>(selector) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    await settle();
  };
  return { fixture, store, events, projection, navigate, announce, root, q, text, settle, button, click, type };
}

beforeEach(() => TestBed.resetTestingModule());

describe('LoanDetailPageComponent · shell', () => {
  it('keeps the page test id, drops the stub marker and titles the page with the alias', async () => {
    const { root, q } = await setup();
    expect(root.getAttribute('data-testid')).toBe('page-loan-detail');
    expect(root.hasAttribute('data-cc-stub')).toBe(false);
    expect(q('h1')?.textContent).toContain('Casa A');
    expect(q('h1')?.textContent).toContain('Banco Ficticio');
  });

  it('shows a loading note until the store is ready and a way back when the loan does not exist', async () => {
    const loading = await setup({ ready: false });
    expect(loading.q('[data-testid="loading"]')).not.toBeNull();
    TestBed.resetTestingModule();
    const missing = await setup({ missing: true });
    expect(missing.text('not-found')).toContain('No se encontró');
    expect(missing.q('a[href="/app"]')).not.toBeNull();
    expect(missing.q('[data-testid="loan-status"]')).toBeNull();
  });
});

describe('summary', () => {
  it('shows terms, template origin, insurance rows and fixed charges', async () => {
    const { text } = await setup();
    expect(text('term-principal')).toBe('Q 500,000.00');
    expect(text('term-months')).toBe('240 meses');
    expect(text('term-rate')).toContain('7.00 %');
    expect(text('term-rate-type')).toBe('Variable');
    expect(text('term-payment-day')).toBe('Fin de mes');
    expect(text('term-first-due')).toBe('31/01/2027');
    expect(text('term-disbursement')).toBe('15/12/2026');
    expect(text('term-rounding')).toContain('FHA_GT_V1');
    expect(text('term-template')).toContain('FHA');
    expect(text('term-insurance')).toContain('Seguro FHA / seguro de hipoteca');
    expect(text('term-insurance')).toContain('1.00 %');
    expect(text('term-insurance')).toContain('Desgravamen');
    expect(text('term-fixed')).toContain('IUSI');
    expect(text('term-fixed')).toContain('Q 250.00');
  });

  it('shows status, validation chip, balance and the house meter from the projection', async () => {
    const { text, q } = await setup();
    expect(text('loan-status')).toBe('Activo');
    expect(text('chip-label')).toBe('Coincide');
    expect(text('summary-balance')).toBe('Q 437,500.00');
    expect(text('summary-next')).toContain('Q 4,658.47');
    expect(q('[role="meter"]')).not.toBeNull();
  });

  it('compares the original plan with the real path', async () => {
    const { text } = await setup();
    expect(text('metric-end')).toContain('31/01/2047');
    expect(text('metric-end')).toContain('31/01/2046');
    expect(text('metric-total')).toContain('Q 500,000.00');
    expect(text('metric-total')).toContain('Q 998,765.43');
    expect(text('metric-months')).toContain('12');
    expect(text('metric-interest')).toContain('Q 1,234.50');
    expect(text('metric-net')).toContain('Q 4,321.00');
  });

  it('links to the table, the real data and the projections of this loan', async () => {
    const { q } = await setup();
    const base = `/app/prestamos/${LOAN_ID}`;
    expect(q(`a[href="${base}/tabla"]`)).not.toBeNull();
    expect(q(`a[href="${base}/datos-reales"]`)).not.toBeNull();
    expect(q(`a[href="${base}/proyecciones"]`)).not.toBeNull();
  });

  it('never shows a raw engine error: it maps the kind to Spanish text', async () => {
    const { projection, text, settle } = await setup();
    projection.error.set(new InvalidInputError('INVALID_TERMS', 'secret 123456.78'));
    await settle();
    expect(text('projection-error')).toContain('no es válido');
    expect(text('projection-error')).not.toContain('123456.78');
  });
});

describe('mark as paid', () => {
  it('shows the suggestion exactly when the projection says suggestedPaid (active loans)', async () => {
    const { projection, q, settle } = await setup();
    expect(q('[data-testid="suggested-paid"]')).toBeNull();
    projection.suggestedPaid.set(true);
    await settle();
    expect(q('[data-testid="suggested-paid"]')).not.toBeNull();
    projection.suggestedPaid.set(false);
    await settle();
    expect(q('[data-testid="suggested-paid"]')).toBeNull();
  });

  it('does not suggest it for a loan that is already paid', async () => {
    const { projection, q, settle } = await setup({ status: 'paid' });
    projection.suggestedPaid.set(true);
    await settle();
    expect(q('[data-testid="suggested-paid"]')).toBeNull();
  });

  it('the suggestion does not change the status: only the confirmed action does', async () => {
    const { projection, store, settle } = await setup();
    projection.suggestedPaid.set(true);
    await settle();
    expect(store.statusCalls).toEqual([]);
  });

  it('asks for confirmation, moves the loan to paid, announces it politely and focuses the heading', async () => {
    const { click, store, announce, q, settle } = await setup();
    await click('Marcar como pagado');
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(store.statusCalls).toEqual([]);
    (document.querySelector('[data-testid="confirm-ok"]') as HTMLButtonElement).click();
    await settle();
    expect(store.statusCalls).toEqual([{ id: LOAN_ID, status: 'paid' }]);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce.mock.calls[0]?.[0]).toContain('pagado');
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(q('[data-testid="loan-status"]')?.textContent).toContain('Pagado');
    expect(document.activeElement).toBe(q('h1'));
  });

  it('cancelling the confirmation writes nothing', async () => {
    const { click, store, settle, announce } = await setup();
    await click('Marcar como pagado');
    (document.querySelector('[data-testid="confirm-cancel"]') as HTMLButtonElement).click();
    await settle();
    expect(store.statusCalls).toEqual([]);
    expect(announce).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it('a paid loan can go back to active', async () => {
    const { click, store } = await setup({ status: 'paid' });
    await click('Volver a activo');
    expect(store.statusCalls).toEqual([{ id: LOAN_ID, status: 'active' }]);
  });
});

describe('archive and unarchive', () => {
  it('archives without a dialog, announces where to find it, and offers to unarchive', async () => {
    const { click, store, announce, text, button, q } = await setup();
    await click('Archivar');
    expect(store.statusCalls).toEqual([{ id: LOAN_ID, status: 'archived' }]);
    expect(announce.mock.calls[0]?.[0]).toContain('Archivados');
    expect(text('loan-status')).toBe('Archivado');
    expect(button('Archivar')).toBeUndefined();
    expect(button('Desarchivar')).toBeDefined();
    expect(document.activeElement).toBe(q('h1'));
  });

  it('does not offer to archive a paid loan', async () => {
    const { button } = await setup({ status: 'paid' });
    expect(button('Archivar')).toBeUndefined();
    expect(button('Desarchivar')).toBeUndefined();
  });

  it('unarchives back to active', async () => {
    const { click, store, announce, text } = await setup({ status: 'archived' });
    await click('Desarchivar');
    expect(store.statusCalls).toEqual([{ id: LOAN_ID, status: 'active' }]);
    expect(announce.mock.calls[0]?.[0]).toContain('Activos');
    expect(text('loan-status')).toBe('Activo');
  });

  it('shows a Spanish error and announces nothing when the write fails', async () => {
    const { click, store, announce, text } = await setup();
    store.failWith = new DataError('STORAGE', 'secret 1.00');
    await click('Archivar');
    expect(text('action-error')).toContain('almacenamiento');
    expect(text('action-error')).not.toContain('1.00');
    expect(announce).not.toHaveBeenCalled();
    expect(text('loan-status')).toBe('Activo');
  });
});

describe('negative savings', () => {
  const NOTE = 'Un valor negativo significa que, con tus datos reales, pagas más que en el plan original.';

  it('shows no note while the savings are not negative', async () => {
    const { q } = await setup();
    expect(q('[data-testid="negative-note"]')).toBeNull();
  });

  it('shows the signed values and the explanation when any saving is negative', async () => {
    const { projection, text, q, settle } = await setup();
    projection.negative.set(true);
    await settle();
    expect(text('metric-months')).toContain('-3');
    expect(text('metric-interest')).toContain('-');
    expect(text('metric-net')).toContain('-');
    expect(q('[data-testid="negative-note"]')?.textContent).toContain(NOTE);
    expect(q('[data-testid="negative-note"]')?.textContent).toContain('Un abono no siempre reduce el interés.');
  });
});

describe('delete', () => {
  it('needs the alias typed, tombstones through the store, announces and goes back to /app', async () => {
    const { click, type, store, navigate, announce, settle } = await setup();
    await click('Eliminar');
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    const confirm = () =>
      document.querySelector<HTMLButtonElement>('[data-testid="delete-confirm"]') as HTMLButtonElement;
    expect(confirm().disabled).toBe(true);
    await type('[data-testid="delete-alias"]', 'Casa A');
    expect(confirm().disabled).toBe(false);
    confirm().click();
    await settle();
    expect(store.deleted).toEqual([LOAN_ID]);
    expect(navigate).toHaveBeenCalledWith(['/app']);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce.mock.calls[0]?.[0]).toContain('eliminado');
  });

  it('does not flash «not found» while leaving', async () => {
    const { click, type, q, settle } = await setup();
    await click('Eliminar');
    await type('[data-testid="delete-alias"]', 'Casa A');
    (document.querySelector('[data-testid="delete-confirm"]') as HTMLButtonElement).click();
    await settle();
    expect(q('[data-testid="not-found"]')).toBeNull();
  });

  it('cancelling deletes nothing', async () => {
    const { click, store, settle } = await setup();
    await click('Eliminar');
    (document.querySelector('[data-testid="delete-cancel"]') as HTMLButtonElement).click();
    await settle();
    expect(store.deleted).toEqual([]);
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it('a failed deletion stays on the page with an error', async () => {
    const { click, type, store, navigate, text, settle } = await setup();
    store.failWith = new DataError('STORAGE');
    await click('Eliminar');
    await type('[data-testid="delete-alias"]', 'Casa A');
    (document.querySelector('[data-testid="delete-confirm"]') as HTMLButtonElement).click();
    await settle();
    expect(navigate).not.toHaveBeenCalled();
    expect(text('action-error')).toContain('almacenamiento');
  });
});

describe('edit', () => {
  it('opens the edit form with the stored values and cancelling returns to the summary and its heading', async () => {
    const { click, q, button, settle } = await setup();
    await click('Editar condiciones');
    expect(q('[data-testid="loan-edit-form"]')).not.toBeNull();
    expect(q('[data-testid="terms"]')).toBeNull();
    expect(button('Editar condiciones')).toBeUndefined();
    await click('Cancelar');
    await settle();
    expect(q('[data-testid="loan-edit-form"]')).toBeNull();
    expect(q('[data-testid="terms"]')).not.toBeNull();
    expect(document.activeElement).toBe(q('h1'));
  });

  it('editing the principal recomputes the projection and keeps the event ids', async () => {
    const { click, type, store, events, text, q, settle } = await setup();
    const eventIdsBefore = events.stored().map((event) => event.id);
    expect(text('metric-total')).toContain('Q 500,000.00');
    await click('Editar condiciones');
    await type('#principal', '600000');
    await click('Guardar cambios');
    await settle();
    expect(store.updates).toHaveLength(1);
    expect(store.updates[0]?.principal).toBe('600000.00');
    expect(q('[data-testid="loan-edit-form"]')).toBeNull();
    expect(text('term-principal')).toBe('Q 600,000.00');
    expect(text('metric-total')).toContain('Q 600,000.00');
    expect(events.stored().map((event) => event.id)).toEqual(eventIdsBefore);
    for (const write of events.writes) expect(write).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(q('h1'));
  });

  it('locks the currency of a loan with child records', async () => {
    const { click, store, q, settle } = await setup();
    store.locked.set(true);
    await settle();
    await click('Editar condiciones');
    expect(q('[data-testid="currency-locked"]')).not.toBeNull();
  });
});
