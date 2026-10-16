import { signal, type Signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { InvalidInputError, NEGATIVE_AMORTIZATION_RULES, NegativeAmortizationError } from '@cuotascasa/domain';
import type {
  ComponentRealDelta,
  DomainError,
  Money,
  Paths,
  Schedule,
  ScheduleRow,
  YearlySubtotal,
} from '@cuotascasa/domain';
import { describe, expect, it, vi } from 'vitest';
import type {
  AnchorDelta,
  LoanEventsStore,
  LoanProjection,
  LoanProjectionService,
  LoansStore,
  PaymentsStore,
  ReportedBalancesStore,
  ScenariosStore,
} from '../../data/api.ts';
import {
  LOAN_EVENTS_STORE,
  LOAN_PROJECTION_SERVICE,
  LOANS_STORE,
  PAYMENTS_STORE,
  REPORTED_BALANCES_STORE,
  SCENARIOS_STORE,
} from '../../data/tokens.ts';
import type { ScenarioEvent } from './scenario-abono.ts';
import { SchedulePageComponent } from './schedule-page.component.ts';

type Loan = NonNullable<ReturnType<ReturnType<LoansStore['loan']>>>;
type Scenario = ReturnType<ScenariosStore['listByLoan']> extends Signal<readonly (infer S)[]> ? S : never;

const LOAN_ID = 'a0000000-0000-4000-8000-000000000001';
const SCENARIO_ID = 'b0000000-0000-4000-8000-000000000001';
const m = (value: string): Money => value as Money;
const DUES = ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'];

const LOAN = {
  id: LOAN_ID,
  name: 'Casa A',
  bank: 'Banco Ficticio',
  currency: 'GTQ',
  firstDueDate: '2026-01-31',
  paymentDay: 'END_OF_MONTH',
  status: 'active',
} as unknown as Loan;

function row(k: number, opening: string, over: Partial<ScheduleRow> = {}): ScheduleRow {
  return {
    k,
    dueDate: DUES[k - 1] ?? '2026-05-31',
    opening: m(opening),
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

function schedule(opening: string, over: Readonly<Record<number, Partial<ScheduleRow>>> = {}): Schedule {
  const rows = [1, 2, 3, 4].map((k) => row(k, k === 1 ? opening : '800.00', over[k]));
  return { currency: 'GTQ', rows, installmentCount: rows.length } as unknown as Schedule;
}

function subtotal(capital: string): YearlySubtotal {
  return {
    year: 2026,
    capital: m(capital),
    interest: m('40.00'),
    insurance: m('8.00'),
    fixedCharges: m('20.00'),
    prepayments: m('0.00'),
    commissions: m('0.00'),
    total: m('468.00'),
  } as YearlySubtotal;
}

function scenarioOf(events: readonly ScenarioEvent[], name = 'Borrador', id = SCENARIO_ID): Scenario {
  return { id, loanId: LOAN_ID, name, events, deletedAt: null } as unknown as Scenario;
}

function prepayment(id: string, date: string, amount: string, over: Record<string, unknown> = {}): ScenarioEvent {
  return { id, date, type: 'Prepayment', amount, mode: 'REDUCE_TERM', deletedAt: null, ...over } as ScenarioEvent;
}

interface Setup {
  readonly cutoffK?: number;
  readonly currentK?: number | null;
  readonly scenarios?: readonly Scenario[];
  readonly active?: string | null;
  readonly anchors?: readonly AnchorDelta[];
  readonly components?: readonly ComponentRealDelta[];
  readonly paid?: readonly number[];
  readonly realOver?: Readonly<Record<number, Partial<ScheduleRow>>>;
  readonly scenarioPath?: boolean;
  readonly error?: DomainError | null;
  readonly loan?: Loan | undefined;
  readonly updateRejects?: Error;
  readonly metrics?: { endDate: string; baseEndDate: string; monthsSaved: number; interestSaved: string } | null;
}

function mount(setup: Setup = {}) {
  const scenarios: WritableSignal<readonly Scenario[]> = signal(setup.scenarios ?? []);
  const active: WritableSignal<string | null> = signal(setup.active ?? null);
  const scenarioStore = {
    ready: signal(true).asReadonly(),
    listByLoan: () => scenarios.asReadonly(),
    activeScenarioId: () => active.asReadonly(),
    create: vi.fn(async (draft: { name: string; events: readonly ScenarioEvent[]; loanId: string }) => {
      const created = scenarioOf(draft.events, draft.name, 'c0000000-0000-4000-8000-000000000001');
      scenarios.update((all) => [...all, created]);
      return created;
    }),
    update: vi.fn(async (update: { id: string; events: readonly ScenarioEvent[]; name: string }) => {
      if (setup.updateRejects) throw setup.updateRejects;
      const next = scenarioOf(update.events, update.name, update.id);
      scenarios.update((all) => all.map((s) => (s.id === update.id ? next : s)));
      return next;
    }),
    delete: vi.fn(),
    setActiveScenario: vi.fn(async (_loanId: string, id: string | null) => {
      active.set(id);
    }),
  };
  const realStores = {
    events: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    balances: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    payments: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  };
  const paths = {
    original: schedule('1000.00'),
    real: schedule('2000.00', setup.realOver),
    scenario: setup.scenarioPath ? schedule('3000.00', { 1: { prepayment: m('50.00') } }) : null,
    cutoffK: setup.cutoffK ?? 0,
  } as unknown as Paths;
  const sig = <T>(value: T): Signal<T> => signal(value).asReadonly();
  const current = setup.currentK === undefined ? 2 : setup.currentK;
  const projection = {
    loanId: LOAN_ID,
    error: sig(setup.error ?? null),
    paths: sig(paths),
    yearlySubtotals: sig({
      original: [subtotal('401.00')],
      real: [subtotal('402.00')],
      scenario: setup.scenarioPath ? [subtotal('403.00')] : null,
    }),
    asOf: sig('2026-02-10'),
    currentInstallment: sig(current === null ? null : row(current, '800.00')),
    cutoffK: sig(setup.cutoffK ?? 0),
    paidInstallments: sig(new Set<number>(setup.paid ?? [])),
    metrics: sig({ realVsOriginal: {}, activeScenarioVsReal: setup.metrics ?? null }),
    activeScenarioEndDate: sig(setup.metrics?.endDate ?? null),
    realDeltaPerAnchor: sig(setup.anchors ?? []),
    realDeltaPerComponent: sig(setup.components ?? []),
  } as unknown as LoanProjection;
  const loan = 'loan' in setup ? setup.loan : LOAN;
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: LOANS_STORE, useValue: { ready: sig(true), loan: () => sig(loan) } as unknown as LoansStore },
      {
        provide: LOAN_PROJECTION_SERVICE,
        useValue: { forLoan: () => projection } as unknown as LoanProjectionService,
      },
      { provide: SCENARIOS_STORE, useValue: scenarioStore as unknown as ScenariosStore },
      { provide: LOAN_EVENTS_STORE, useValue: realStores.events as unknown as LoanEventsStore },
      { provide: REPORTED_BALANCES_STORE, useValue: realStores.balances as unknown as ReportedBalancesStore },
      { provide: PAYMENTS_STORE, useValue: realStores.payments as unknown as PaymentsStore },
    ],
  });
  const fixture = TestBed.createComponent(SchedulePageComponent);
  fixture.componentRef.setInput('id', LOAN_ID);
  fixture.detectChanges();
  return { fixture, scenarioStore, realStores, scenarios, active };
}

const root = (f: ComponentFixture<unknown>) => f.nativeElement as HTMLElement;
const byId = (f: ComponentFixture<unknown>, id: string) => root(f).querySelector<HTMLElement>(`[data-testid="${id}"]`);
const clean = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? null;

/** Rows of the ledger by their first cell text: '2' for installment 2, 'Subtotal' for a subtotal row. */
function ledgerRows(f: ComponentFixture<unknown>): HTMLElement[] {
  return [...root(f).querySelectorAll<HTMLElement>('[role="row"]')].slice(1);
}
function rowOf(f: ComponentFixture<unknown>, first: string): HTMLElement {
  const found = ledgerRows(f).find((r) => clean(r.querySelector('[data-c="0"]')) === first);
  if (!found) throw new Error(`row ${first} not found`);
  return found;
}
const COLUMN = { opening: 2, prepayment: 9, paid: 10, delta: 11 } as const;
const cell = (f: ComponentFixture<unknown>, first: string, c: number) =>
  rowOf(f, first).querySelector<HTMLElement>(`[data-c="${c}"]`) as HTMLElement;

async function chooseView(f: ComponentFixture<unknown>, view: 'original' | 'real' | 'scenario'): Promise<void> {
  const radio = byId(f, `view-${view}`) as HTMLInputElement;
  radio.click();
  await f.whenStable();
  f.detectChanges();
}

/** Types a value into the abono cell of installment k the way a user does: Enter opens, type, Enter confirms. */
async function typeAbono(f: ComponentFixture<unknown>, k: number, value: string): Promise<void> {
  const target = cell(f, String(k), COLUMN.prepayment);
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await f.whenStable();
  f.detectChanges();
  const input = root(f).querySelector<HTMLInputElement>('input.editor');
  if (!input) throw new Error(`cell ${k} did not open an editor`);
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await f.whenStable();
  f.detectChanges();
}

const settle = async (f: ComponentFixture<unknown>) => {
  await f.whenStable();
  f.detectChanges();
  await new Promise((resolve) => setTimeout(resolve, 5));
  await f.whenStable();
  f.detectChanges();
};

describe('SchedulePageComponent: views', () => {
  it('keeps the page test id and shows the loan alias', () => {
    const { fixture } = mount();
    expect(byId(fixture, 'page-schedule') ?? root(fixture)).toBeTruthy();
    expect(fixture.nativeElement.getAttribute('data-testid')).toBe('page-schedule');
    expect(clean(root(fixture).querySelector('h1'))).toContain('Casa A');
  });

  it('the toggle shows the rows of the matching path', async () => {
    const { fixture } = mount({ scenarioPath: true });
    expect((byId(fixture, 'view-real') as HTMLInputElement).checked).toBe(true);
    expect(clean(cell(fixture, '1', COLUMN.opening))).toBe('2,000.00');
    await chooseView(fixture, 'original');
    expect(clean(cell(fixture, '1', COLUMN.opening))).toBe('1,000.00');
    await chooseView(fixture, 'scenario');
    expect(clean(cell(fixture, '1', COLUMN.opening))).toBe('3,000.00');
    expect(clean(cell(fixture, '1', COLUMN.prepayment))).toBe('50.00');
  });

  it('without scenario events the scenario view shows the real rows and says so', async () => {
    const { fixture } = mount({ scenarioPath: false });
    await chooseView(fixture, 'scenario');
    expect(clean(cell(fixture, '1', COLUMN.opening))).toBe('2,000.00');
    expect(clean(byId(fixture, 'scenario-fallback'))).toContain('se muestra el camino real');
  });

  it('yearly subtotal rows equal the facade subtotals of the displayed path', async () => {
    const { fixture } = mount({ scenarioPath: true });
    expect(clean(cell(fixture, 'Subtotal', 5))).toBe('402.00');
    await chooseView(fixture, 'original');
    expect(clean(cell(fixture, 'Subtotal', 5))).toBe('401.00');
    await chooseView(fixture, 'scenario');
    expect(clean(cell(fixture, 'Subtotal', 5))).toBe('403.00');
    expect(clean(cell(fixture, 'Subtotal', 7))).toBe('468.00');
  });

  it('highlights the current installment of the projection and nothing when there is none', () => {
    const withCurrent = mount({ currentK: 3 });
    const current = [...root(withCurrent.fixture).querySelectorAll('[aria-current="true"]')];
    expect(current).toHaveLength(1);
    expect(clean(current[0]?.querySelector('[data-c="0"]'))).toContain('3');
    TestBed.resetTestingModule();
    const without = mount({ currentK: null });
    expect(root(without.fixture).querySelectorAll('[aria-current="true"]')).toHaveLength(0);
  });

  it('includes the export menu with the schedule request of the displayed path', () => {
    const { fixture } = mount();
    expect(root(fixture).querySelector('cc-export-menu')).not.toBeNull();
  });
});

describe('SchedulePageComponent: real data on the table', () => {
  it('Real Δ is reported − projected from the facade and appears only on rows with a reported balance', () => {
    const anchors = [
      {
        eventId: 'x',
        k: 2,
        reported: m('790.00'),
        projected: m('800.00'),
        realDelta: m('-10.00'),
        status: 'AMBER',
        cause: null,
      },
    ] as unknown as AnchorDelta[];
    const { fixture } = mount({ anchors });
    expect(clean(cell(fixture, '2', COLUMN.delta))).toBe('-10.00 ▲ Diferencia pequeña');
    expect(clean(cell(fixture, '1', COLUMN.delta))).toBe('');
    expect(clean(cell(fixture, '3', COLUMN.delta))).toBe('');
  });

  it('a row with an ActualPayment shows the paid mark', () => {
    const { fixture } = mount({ paid: [1] });
    expect(clean(cell(fixture, '1', COLUMN.paid))).toBe('✓');
    expect(clean(cell(fixture, '2', COLUMN.paid))).toBe('');
  });

  it('with a breakdown the row shows Real Δ per component = real − projected', () => {
    const components = [
      { eventId: 'p', k: 1, capital: m('-1.00'), interest: m('2.50'), insurance: m('0.00'), fixedCharges: m('3.00') },
    ] as unknown as ComponentRealDelta[];
    const { fixture } = mount({ components, paid: [1] });
    expect(clean(cell(fixture, '1', 12))).toBe('-1.00');
    expect(clean(cell(fixture, '1', 13))).toBe('2.50');
    expect(clean(cell(fixture, '1', 14))).toBe('0.00');
    expect(clean(cell(fixture, '1', 15))).toBe('3.00');
  });
});

describe('SchedulePageComponent: in-cell abono', () => {
  it('rows with k ≤ cutoffK reject editing and write nothing', async () => {
    const { fixture, scenarioStore } = mount({ cutoffK: 2, active: SCENARIO_ID, scenarios: [scenarioOf([])] });
    expect(cell(fixture, '2', COLUMN.prepayment).getAttribute('data-editable')).toBeNull();
    expect(cell(fixture, '3', COLUMN.prepayment).getAttribute('data-editable')).toBe('true');
    cell(fixture, '2', COLUMN.prepayment).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
    await fixture.whenStable();
    expect(root(fixture).querySelector('input.editor')).toBeNull();
    expect(scenarioStore.update).not.toHaveBeenCalled();
  });

  it('the original plan is read-only', async () => {
    const { fixture } = mount();
    await chooseView(fixture, 'original');
    expect(cell(fixture, '3', COLUMN.prepayment).getAttribute('data-editable')).toBeNull();
  });

  it('(a) a new amount creates one REDUCE_TERM Prepayment dated on the due date of k, without commission', async () => {
    const { fixture, scenarioStore, realStores } = mount({ active: SCENARIO_ID, scenarios: [scenarioOf([])] });
    await typeAbono(fixture, 3, '20000');
    await settle(fixture);
    expect(scenarioStore.update).toHaveBeenCalledTimes(1);
    const sent = scenarioStore.update.mock.calls[0]?.[0];
    expect(sent?.id).toBe(SCENARIO_ID);
    expect(sent?.events).toHaveLength(1);
    expect(sent?.events[0]).toMatchObject({
      type: 'Prepayment',
      date: '2026-03-31',
      amount: '20000.00',
      mode: 'REDUCE_TERM',
      deletedAt: null,
    });
    expect(sent?.events[0]).not.toHaveProperty('commission');
    expect(typeof sent?.events[0]?.id).toBe('string');
    expect(scenarioStore.create).not.toHaveBeenCalled();
    for (const store of Object.values(realStores)) {
      expect(store.create).not.toHaveBeenCalled();
      expect(store.update).not.toHaveBeenCalled();
      expect(store.delete).not.toHaveBeenCalled();
    }
  });

  it('on confirm the table switches to the scenario view and announces politely', async () => {
    const { fixture } = mount({ active: SCENARIO_ID, scenarios: [scenarioOf([])], scenarioPath: true });
    await typeAbono(fixture, 3, '500');
    await settle(fixture);
    expect((byId(fixture, 'view-scenario') as HTMLInputElement).checked).toBe(true);
    const status = byId(fixture, 'schedule-status');
    expect(status?.getAttribute('role')).toBe('status');
    expect(status?.getAttribute('aria-live')).toBe('polite');
    expect(clean(status)).toContain('cuota 3');
  });

  it('(b) with a single Prepayment at k the cell edits its amount and keeps id, mode and commission', async () => {
    const existing = prepayment('e0000000-0000-4000-8000-0000000000aa', '2026-03-31', '100.00', {
      mode: 'REDUCE_INSTALLMENT',
      commission: { kind: 'FLAT', amount: '5.00' },
    });
    const { fixture, scenarioStore } = mount({ active: SCENARIO_ID, scenarios: [scenarioOf([existing])] });
    await typeAbono(fixture, 3, '250.5');
    await settle(fixture);
    const sent = scenarioStore.update.mock.calls[0]?.[0];
    expect(sent?.events).toHaveLength(1);
    expect(sent?.events[0]).toEqual({ ...existing, amount: '250.50' });
  });

  it('(c) emptying the cell tombstones that Prepayment', async () => {
    const existing = prepayment('e0000000-0000-4000-8000-0000000000aa', '2026-03-31', '100.00');
    const { fixture, scenarioStore } = mount({ active: SCENARIO_ID, scenarios: [scenarioOf([existing])] });
    await typeAbono(fixture, 3, '');
    await settle(fixture);
    const sent = scenarioStore.update.mock.calls[0]?.[0];
    expect(sent?.events).toHaveLength(1);
    expect(sent?.events[0]).toMatchObject({ id: existing.id, deletedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) });
  });

  it('(c) typing 0 tombstones that Prepayment too', async () => {
    const existing = prepayment('e0000000-0000-4000-8000-0000000000aa', '2026-03-31', '100.00');
    const { fixture, scenarioStore } = mount({ active: SCENARIO_ID, scenarios: [scenarioOf([existing])] });
    await typeAbono(fixture, 3, '0');
    await settle(fixture);
    expect(scenarioStore.update.mock.calls[0]?.[0]?.events[0]?.deletedAt).not.toBeNull();
  });

  it('(d) with two prepayments at k the cell is read-only and points to Proyecciones', async () => {
    const events = [
      prepayment('e0000000-0000-4000-8000-0000000000a1', '2026-03-31', '100.00'),
      prepayment('e0000000-0000-4000-8000-0000000000a2', '2026-03-31', '200.00'),
    ];
    const { fixture, scenarioStore } = mount({ active: SCENARIO_ID, scenarios: [scenarioOf(events)] });
    const locked = cell(fixture, '3', COLUMN.prepayment);
    expect(locked.getAttribute('aria-readonly')).toBe('true');
    expect(locked.getAttribute('data-editable')).toBeNull();
    locked.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(root(fixture).querySelector('input.editor')).toBeNull();
    const link = byId(fixture, 'locked-note')?.querySelector('a');
    expect(link?.textContent).toContain('Proyecciones');
    expect(link?.getAttribute('href')).toContain('/proyecciones');
    expect(scenarioStore.update).not.toHaveBeenCalled();
  });

  it('(d) an AdvanceInstallments at k also locks the cell', () => {
    const advance = {
      id: 'e0000000-0000-4000-8000-0000000000a3',
      date: '2026-03-31',
      type: 'AdvanceInstallments',
      count: 2,
      deletedAt: null,
    } as ScenarioEvent;
    const { fixture } = mount({ active: SCENARIO_ID, scenarios: [scenarioOf([advance])] });
    expect(cell(fixture, '3', COLUMN.prepayment).getAttribute('aria-readonly')).toBe('true');
  });

  it('shows a Spanish message and does not switch views when the write fails', async () => {
    const { fixture } = mount({
      active: SCENARIO_ID,
      scenarios: [scenarioOf([])],
      updateRejects: new Error('Q 123.45'),
    });
    await typeAbono(fixture, 3, '10');
    await settle(fixture);
    const status = clean(byId(fixture, 'schedule-status'));
    expect(status).toContain('No se pudo guardar');
    expect(status).not.toContain('123.45');
    expect((byId(fixture, 'view-real') as HTMLInputElement).checked).toBe(true);
  });
});

describe('SchedulePageComponent: no active scenario (e)', () => {
  const dialog = (f: ComponentFixture<unknown>) => root(f).querySelector('[role="alertdialog"]');
  const press = async (f: ComponentFixture<unknown>, id: 'confirm-ok' | 'confirm-cancel') => {
    (root(f).querySelector(`[data-testid="${id}"]`) as HTMLElement).click();
    await settle(f);
  };

  it('offers «Borrador» and writes nothing until the user accepts', async () => {
    const { fixture, scenarioStore } = mount();
    await typeAbono(fixture, 3, '700');
    await settle(fixture);
    expect(dialog(fixture)?.textContent).toContain('Borrador');
    expect(scenarioStore.create).not.toHaveBeenCalled();
    expect(scenarioStore.update).not.toHaveBeenCalled();
    expect(scenarioStore.setActiveScenario).not.toHaveBeenCalled();
  });

  it('creates «Borrador» when it does not exist, activates it, saves there and announces it', async () => {
    const { fixture, scenarioStore } = mount();
    await typeAbono(fixture, 3, '700');
    await settle(fixture);
    await press(fixture, 'confirm-ok');
    expect(scenarioStore.create).toHaveBeenCalledTimes(1);
    const draft = scenarioStore.create.mock.calls[0]?.[0];
    expect(draft).toMatchObject({ loanId: LOAN_ID, name: 'Borrador' });
    expect(draft?.events).toHaveLength(1);
    expect(draft?.events[0]).toMatchObject({
      type: 'Prepayment',
      date: '2026-03-31',
      amount: '700.00',
      mode: 'REDUCE_TERM',
    });
    expect(scenarioStore.setActiveScenario).toHaveBeenCalledWith(LOAN_ID, 'c0000000-0000-4000-8000-000000000001');
    expect(dialog(fixture)).toBeNull();
    const status = byId(fixture, 'schedule-status');
    expect(status?.getAttribute('aria-live')).toBe('polite');
    expect(clean(status)).toContain('Borrador');
    expect((byId(fixture, 'view-scenario') as HTMLInputElement).checked).toBe(true);
  });

  it('activates the existing «Borrador» and saves into it, editing a single Prepayment it already has at k', async () => {
    const existing = prepayment('e0000000-0000-4000-8000-0000000000aa', '2026-03-31', '100.00');
    const { fixture, scenarioStore } = mount({ scenarios: [scenarioOf([existing])] });
    await typeAbono(fixture, 3, '900');
    await settle(fixture);
    await press(fixture, 'confirm-ok');
    expect(scenarioStore.create).not.toHaveBeenCalled();
    expect(scenarioStore.setActiveScenario).toHaveBeenCalledWith(LOAN_ID, SCENARIO_ID);
    expect(scenarioStore.update).toHaveBeenCalledTimes(1);
    expect(scenarioStore.update.mock.calls[0]?.[0]?.events).toEqual([{ ...existing, amount: '900.00' }]);
  });

  it('writes nothing when the user declines', async () => {
    const { fixture, scenarioStore, realStores } = mount({ scenarios: [scenarioOf([])] });
    await typeAbono(fixture, 3, '700');
    await settle(fixture);
    await press(fixture, 'confirm-cancel');
    expect(dialog(fixture)).toBeNull();
    expect(scenarioStore.create).not.toHaveBeenCalled();
    expect(scenarioStore.update).not.toHaveBeenCalled();
    expect(scenarioStore.setActiveScenario).not.toHaveBeenCalled();
    for (const store of Object.values(realStores)) expect(store.create).not.toHaveBeenCalled();
    expect((byId(fixture, 'view-real') as HTMLInputElement).checked).toBe(true);
  });

  it('typing 0 with no scenario neither asks nor writes', async () => {
    const { fixture, scenarioStore } = mount();
    await typeAbono(fixture, 3, '0');
    await settle(fixture);
    expect(dialog(fixture)).toBeNull();
    expect(scenarioStore.create).not.toHaveBeenCalled();
  });
});

describe('SchedulePageComponent: scenario summary', () => {
  it('shows the end date of the active scenario against the real path, from the facade metrics', () => {
    const { fixture } = mount({
      active: SCENARIO_ID,
      scenarios: [scenarioOf([])],
      metrics: { endDate: '2043-05-31', baseEndDate: '2045-01-31', monthsSaved: 20, interestSaved: '69172.80' },
    });
    const text = clean(byId(fixture, 'scenario-summary')) ?? '';
    expect(text).toContain('Borrador');
    expect(text).toContain('Fin con el escenario: 31/05/2043');
    expect(text).toContain('camino real: 31/01/2045');
    expect(text).toContain('Cuotas ahorradas: 20');
    expect(text).toContain('Q 69,172.80');
  });

  it('shows a negative saving with its sign', () => {
    const { fixture } = mount({
      active: SCENARIO_ID,
      scenarios: [scenarioOf([])],
      metrics: { endDate: '2045-02-28', baseEndDate: '2045-01-31', monthsSaved: -1, interestSaved: '-3.20' },
    });
    const text = clean(byId(fixture, 'scenario-summary')) ?? '';
    expect(text).toContain('Cuotas ahorradas: -1');
    expect(text).toContain('-Q 3.20');
  });

  it('is absent without an active scenario or without metrics', () => {
    expect(byId(mount().fixture, 'scenario-summary')).toBeNull();
    TestBed.resetTestingModule();
    expect(byId(mount({ active: SCENARIO_ID, scenarios: [scenarioOf([])] }).fixture, 'scenario-summary')).toBeNull();
  });
});

describe('SchedulePageComponent: scenario selector', () => {
  it('lists the loan scenarios and activates the chosen one', async () => {
    const { fixture, scenarioStore } = mount({
      scenarios: [scenarioOf([], 'Borrador'), scenarioOf([], 'Plan B', 'b0000000-0000-4000-8000-000000000002')],
    });
    const select = byId(fixture, 'scenario-select') as HTMLSelectElement;
    expect([...select.options].map((o) => o.text)).toEqual(['Sin escenario', 'Borrador', 'Plan B']);
    select.value = 'b0000000-0000-4000-8000-000000000002';
    select.dispatchEvent(new Event('change'));
    await settle(fixture);
    expect(scenarioStore.setActiveScenario).toHaveBeenCalledWith(LOAN_ID, 'b0000000-0000-4000-8000-000000000002');
  });

  it('choosing «Sin escenario» clears the active scenario', async () => {
    const { fixture, scenarioStore } = mount({ active: SCENARIO_ID, scenarios: [scenarioOf([])] });
    const select = byId(fixture, 'scenario-select') as HTMLSelectElement;
    select.value = '';
    select.dispatchEvent(new Event('change'));
    await settle(fixture);
    expect(scenarioStore.setActiveScenario).toHaveBeenCalledWith(LOAN_ID, null);
  });
});

describe('SchedulePageComponent: errors and states', () => {
  it('a missing loan shows a Spanish notice and no table', () => {
    const { fixture } = mount({ loan: undefined });
    expect(clean(byId(fixture, 'schedule-missing'))).toContain('No encontramos');
    expect(root(fixture).querySelector('[role="grid"]')).toBeNull();
  });

  it('shows engine errors by kind, never the raw message', () => {
    const error = new NegativeAmortizationError(NEGATIVE_AMORTIZATION_RULES[0], 3, m('987.65'), m('1000.00'));
    const { fixture } = mount({ error });
    const text = clean(byId(fixture, 'schedule-error')) ?? '';
    expect(text).toContain('La cuota no alcanza');
    expect(text).not.toContain('987.65');
  });

  it('an invalid-input error uses its own text', () => {
    const error = new InvalidInputError('INVALID_MONEY', 'x');
    const { fixture } = mount({ error });
    expect(clean(byId(fixture, 'schedule-error'))).toContain('no es válido');
  });
});
