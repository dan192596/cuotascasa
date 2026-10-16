import { computed, type Signal, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import {
  buildPaths,
  compareLocalDate,
  compareMoney,
  compareSchedules,
  DomainError,
  type DomainEvent,
  goalSeek,
  type LoanTerms,
  parseLocalDate,
  parseMoney,
  parsePaymentDay,
  parseRate,
  type Paths,
} from '@cuotascasa/domain';
import type { Loan, Scenario, ScenarioEvent, Uuid } from '@cuotascasa/schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DataError,
  type LoanMetrics,
  type LoanProjection,
  type LoanProjectionService,
  type LoansStore,
  type ScenarioDraft,
  type ScenariosStore,
  type ScenarioUpdate,
} from '../../../data/api.ts';
import { LOAN_PROJECTION_SERVICE, LOANS_STORE, SCENARIOS_STORE } from '../../../data/tokens.ts';
import { ScenarioEditorComponent } from './scenario-editor.component.ts';
import { toDomainScenarioEvents } from './scenario-editor.logic.ts';

const LOAN_ID = 'a0000000-0000-4000-8000-000000000001';
const STAMP = {
  createdAt: '2026-10-04T15:00:00.000Z',
  updatedAt: '2026-10-04T15:00:00.000Z',
  updatedByDevice: 'd0000000-0000-4000-8000-000000000001',
  deletedAt: null,
} as const;

/** Synthetic loan of docs/algorithm.md [ALG.EXAMPLE]. */
const LOAN: Loan = {
  id: LOAN_ID,
  ...STAMP,
  name: 'Casa A',
  bank: 'Banco Ficticio',
  currency: 'GTQ',
  principal: '500000.00',
  termMonths: 240,
  disbursementDate: '2025-01-15',
  firstDueDate: '2025-02-28',
  paymentDay: 'END_OF_MONTH',
  interestRate: '0.07',
  insuranceRates: ['0.01', '0.0026'],
  fixedCharges: [{ label: 'IUSI', amount: '350.00', effectiveFrom: '2025-02-28' }],
  roundingProfile: 'FHA_GT_V1',
  rateType: 'VARIABLE',
  templateRef: { id: 'fha-gt', version: 1 },
  status: 'active',
};

const TERMS: LoanTerms = {
  principal: parseMoney('500000.00'),
  termMonths: 240,
  disbursementDate: parseLocalDate('2025-01-15'),
  firstDueDate: parseLocalDate('2025-02-28'),
  paymentDay: parsePaymentDay('END_OF_MONTH'),
  currency: 'GTQ',
  interestRate: parseRate('0.07'),
  insuranceRates: [parseRate('0.01'), parseRate('0.0026')],
  fixedCharges: [{ label: 'IUSI', amount: parseMoney('350.00'), effectiveFrom: parseLocalDate('2025-02-28') }],
  roundingProfile: 'FHA_GT_V1',
  rateType: 'VARIABLE',
};

const ID = (n: number): Uuid => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;

class FakeScenarios implements ScenariosStore {
  readonly ready = signal(true).asReadonly();
  readonly list = signal<readonly Scenario[]>([]);
  readonly active = signal<Uuid | null>(null);
  readonly created: ScenarioDraft[] = [];
  readonly updated: ScenarioUpdate[] = [];
  failNext: DataError | null = null;
  failActivate = false;
  private counter = 100;

  listByLoan(): Signal<readonly Scenario[]> {
    return this.list.asReadonly();
  }
  activeScenarioId(): Signal<Uuid | null> {
    return this.active.asReadonly();
  }
  setActiveScenario(_loanId: Uuid, scenarioId: Uuid | null): Promise<void> {
    if (this.failActivate) {
      return Promise.reject(new DataError('STORAGE'));
    }
    this.active.set(scenarioId);
    return Promise.resolve();
  }
  create(draft: ScenarioDraft): Promise<Scenario> {
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      return Promise.reject(error);
    }
    this.created.push(draft);
    const scenario: Scenario = { id: ID(++this.counter), ...STAMP, ...draft };
    this.list.update((current) => [...current, scenario]);
    return Promise.resolve(scenario);
  }
  async update(update: ScenarioUpdate): Promise<Scenario> {
    // A real write takes a turn: concurrent callers must not read the scenario before the previous write landed.
    for (let hop = 0; hop < 5; hop++) await Promise.resolve();
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      throw error;
    }
    this.updated.push(update);
    const scenario: Scenario = { ...STAMP, ...update };
    this.list.update((current) => current.map((item) => (item.id === update.id ? scenario : item)));
    return scenario;
  }
  delete(id: Uuid): Promise<void> {
    this.list.update((current) => current.filter((item) => item.id !== id));
    if (this.active() === id) this.active.set(null);
    return Promise.resolve();
  }
}

function scenario(id: number, name: string, events: readonly ScenarioEvent[] = []): Scenario {
  return { id: ID(id), ...STAMP, loanId: LOAN_ID, name, events: [...events] };
}

function prepayment(n: number, date: string, amount: string): ScenarioEvent {
  return { id: ID(n), type: 'Prepayment', date, amount, mode: 'REDUCE_TERM', deletedAt: null };
}

interface Options {
  readonly real?: readonly DomainEvent[];
  readonly metrics?: LoanMetrics | null;
}

function projectionFor(store: FakeScenarios, real: readonly DomainEvent[], options: Options): LoanProjection {
  const computation = computed(() => {
    const found = store.list().find((item) => item.id === store.active());
    const live = found === undefined ? [] : toDomainScenarioEvents(found.events);
    try {
      return {
        paths: buildPaths({ terms: TERMS, realEvents: real, scenarioEvents: live.length === 0 ? null : live }),
        error: null as DomainError | null,
      };
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      return { paths: buildPaths({ terms: TERMS, realEvents: real, scenarioEvents: null }), error };
    }
  });
  const paths: Signal<Paths | null> = computed(() => computation().paths);
  return {
    loanId: LOAN_ID,
    error: computed(() => computation().error),
    paths,
    cutoffK: computed(() => computation().paths.cutoffK),
    metrics: computed(() => {
      if (options.metrics !== undefined) return options.metrics;
      const current = computation().paths;
      return {
        realVsOriginal: compareSchedules(current.original, current.real),
        activeScenarioVsReal: current.scenario === null ? null : compareSchedules(current.real, current.scenario),
      };
    }),
  } as unknown as LoanProjection;
}

interface Harness {
  readonly fixture: ComponentFixture<ScenarioEditorComponent>;
  readonly element: HTMLElement;
  readonly store: FakeScenarios;
  announced(): string;
  paths(): Paths;
  text(): string;
  byTestId(id: string): HTMLElement | null;
  type(name: string, text: string): Promise<void>;
  choose(name: string, value: string): Promise<void>;
  click(testId: string): Promise<void>;
  submit(testId: string): Promise<void>;
  settle(): Promise<void>;
}

async function setup(scenarios: readonly Scenario[] = [], active: Uuid | null = null, options: Options = {}) {
  const store = new FakeScenarios();
  store.list.set(scenarios);
  store.active.set(active);
  const projection = projectionFor(store, options.real ?? [], options);
  const service = { forLoan: () => projection } as unknown as LoanProjectionService;
  const loans = { ready: signal(true).asReadonly(), loan: () => signal(LOAN).asReadonly() } as unknown as LoansStore;
  TestBed.configureTestingModule({
    providers: [
      { provide: SCENARIOS_STORE, useValue: store },
      { provide: LOAN_PROJECTION_SERVICE, useValue: service },
      { provide: LOANS_STORE, useValue: loans },
    ],
  });
  const fixture = TestBed.createComponent(ScenarioEditorComponent);
  fixture.componentRef.setInput('loanId', LOAN_ID);
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  const control = (name: string) =>
    element.querySelector<HTMLInputElement>(`[id$="-${name}"]:is(input, select, textarea)`) as HTMLInputElement;
  const harness: Harness = {
    fixture,
    element,
    store,
    announced: () => element.querySelector('[data-testid="status"]')?.textContent ?? '',
    paths: () => projection.paths() as Paths,
    text: () => element.textContent?.replace(/\s+/g, ' ') ?? '',
    byTestId: (id) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`),
    async type(name, text) {
      const target = control(name);
      target.value = text;
      target.dispatchEvent(new Event('input'));
      target.dispatchEvent(new Event('blur'));
      await fixture.whenStable();
    },
    async choose(name, value) {
      const target = control(name);
      target.value = value;
      target.dispatchEvent(new Event('input'));
      target.dispatchEvent(new Event('change'));
      target.dispatchEvent(new Event('blur'));
      await fixture.whenStable();
    },
    async click(testId) {
      element.querySelector<HTMLElement>(`[data-testid="${testId}"]`)?.click();
      await fixture.whenStable();
    },
    async submit(testId) {
      element.querySelector<HTMLFormElement>(`[data-testid="${testId}"]`)?.requestSubmit();
      await fixture.whenStable();
    },
    settle: () => fixture.whenStable(),
  };
  return harness;
}

beforeEach(() => TestBed.resetTestingModule());

describe('scenario list: create, activate, rename, duplicate, delete', () => {
  it('shows an empty state and disables the tools without an active scenario', async () => {
    const h = await setup();
    expect(h.text()).toContain('Aún no tienes escenarios');
    expect(h.byTestId('tools')).toBeNull();
    expect(h.text()).toContain('Activa o crea un escenario');
  });

  it('creates a scenario with the typed name and makes it active when none is', async () => {
    const h = await setup();
    await h.type('name', '  Plan A ');
    await h.submit('name-form');
    expect(h.store.created).toEqual([{ loanId: LOAN_ID, name: 'Plan A', events: [] }]);
    expect(h.store.active()).toBe(ID(101));
    expect(h.element.querySelectorAll('[data-testid="scenario-row"]')).toHaveLength(1);
    expect(h.announced()).toContain('Plan A');
  });

  it('rejects an empty name in Spanish and writes nothing', async () => {
    const h = await setup();
    await h.type('name', '   ');
    await h.submit('name-form');
    expect(h.store.created).toHaveLength(0);
    expect(h.text()).toContain('Escribe un nombre para el escenario.');
  });

  it('activates another scenario', async () => {
    const h = await setup([scenario(1, 'Plan A'), scenario(2, 'Plan B')], ID(1));
    const rows = h.element.querySelectorAll('[data-testid="scenario-row"]');
    expect(rows[0]?.textContent).toContain('Activo');
    (rows[1]?.querySelector('[data-testid="activate"]') as HTMLElement).click();
    await h.settle();
    expect(h.store.active()).toBe(ID(2));
  });

  it('renames a scenario through the same form', async () => {
    const h = await setup([scenario(1, 'Plan A')], ID(1));
    await h.click('rename');
    expect((h.element.querySelector('[id$="-name"]') as HTMLInputElement).value).toBe('Plan A');
    await h.type('name', 'Plan Z');
    await h.submit('name-form');
    expect(h.store.updated.at(-1)).toMatchObject({ id: ID(1), name: 'Plan Z', loanId: LOAN_ID });
    expect(h.text()).toContain('Plan Z');
  });

  it('duplicates a scenario with its events under new ids', async () => {
    const original = scenario(1, 'Plan A', [prepayment(10, '2026-03-31', '5000.00')]);
    const h = await setup([original], ID(1));
    await h.click('duplicate');
    const draft = h.store.created[0]!;
    expect(draft.name).toBe('Copia de Plan A');
    expect(draft.events).toHaveLength(1);
    expect(draft.events[0]).toMatchObject({ type: 'Prepayment', amount: '5000.00' });
    expect(draft.events[0]!.id).not.toBe(ID(10));
  });

  it('asks for confirmation before deleting and clears the active scenario', async () => {
    const h = await setup([scenario(1, 'Plan A')], ID(1));
    await h.click('delete');
    expect(h.byTestId('confirm-ok')).not.toBeNull();
    await h.click('confirm-cancel');
    expect(h.store.list()).toHaveLength(1);
    await h.click('delete');
    await h.click('confirm-ok');
    expect(h.store.list()).toHaveLength(0);
    expect(h.store.active()).toBeNull();
  });

  it('shows a Spanish message when the store rejects a write, never the raw error', async () => {
    const h = await setup();
    h.store.failNext = new DataError('STORAGE', 'raw detail 4321');
    await h.type('name', 'Plan A');
    await h.submit('name-form');
    expect(h.text()).toContain('No se pudo guardar');
    expect(h.text()).not.toContain('raw detail');
  });
});

describe('hypothetical events', () => {
  it('adds an abono that changes the metrics of the active scenario', async () => {
    const h = await setup([scenario(1, 'Plan A')], ID(1));
    expect(h.text()).toContain('Sin eventos');
    await h.type('abono-date', '31/03/2026');
    await h.type('abono-amount', '20,000.00');
    await h.choose('abono-mode', 'REDUCE_TERM');
    await h.submit('abono-form');
    const saved = h.store.updated.at(-1)!;
    expect(saved.events).toHaveLength(1);
    expect(saved.events[0]).toMatchObject({
      type: 'Prepayment',
      amount: '20000.00',
      mode: 'REDUCE_TERM',
      date: '2026-03-31',
    });
    expect(h.byTestId('metrics')).not.toBeNull();
    expect(h.byTestId('metric-months')?.textContent).toMatch(/\d/);
    expect(h.text()).toContain('Abono de Q 20,000.00');
  });

  it('adds a commission when chosen', async () => {
    const h = await setup([scenario(1, 'Plan A')], ID(1));
    await h.type('abono-date', '31/03/2026');
    await h.type('abono-amount', '20000');
    await h.choose('abono-commissionKind', 'FLAT');
    await h.type('abono-commissionAmount', '25');
    await h.submit('abono-form');
    expect(h.store.updated.at(-1)!.events[0]).toMatchObject({ commission: { kind: 'FLAT', amount: '25.00' } });
  });

  it('rejects an event at k <= cutoffK with the Spanish text of the domain error and writes nothing', async () => {
    const real: DomainEvent = {
      type: 'Prepayment',
      id: 'r1',
      date: parseLocalDate('2025-06-30'),
      amount: parseMoney('10000.00'),
      mode: 'REDUCE_TERM',
    };
    const h = await setup([scenario(1, 'Plan A')], ID(1), { real: [real] });
    await h.type('abono-date', '31/05/2025');
    await h.type('abono-amount', '5000');
    await h.submit('abono-form');
    expect(h.store.updated).toHaveLength(0);
    expect(h.byTestId('abono-failure')?.textContent).toContain('cuota 4');
    expect(h.byTestId('abono-failure')?.textContent).toContain('datos reales');
  });

  it('adds an advance of N installments', async () => {
    const h = await setup([scenario(1, 'Plan A')], ID(1));
    await h.type('advance-date', '31/03/2026');
    await h.type('advance-count', '6');
    await h.submit('advance-form');
    expect(h.store.updated.at(-1)!.events[0]).toMatchObject({
      type: 'AdvanceInstallments',
      count: 6,
      date: '2026-03-31',
    });
    expect(h.text()).toContain('Adelantar 6 cuotas');
  });

  it('rejects an advance before the cutoff too', async () => {
    const real: DomainEvent = {
      type: 'Prepayment',
      id: 'r1',
      date: parseLocalDate('2025-06-30'),
      amount: parseMoney('10000.00'),
      mode: 'REDUCE_TERM',
    };
    const h = await setup([scenario(1, 'Plan A')], ID(1), { real: [real] });
    await h.type('advance-date', '30/04/2025');
    await h.type('advance-count', '3');
    await h.submit('advance-form');
    expect(h.store.updated).toHaveLength(0);
    expect(h.byTestId('advance-failure')?.textContent).toContain('datos reales');
  });

  it('removes an event from the list', async () => {
    const h = await setup([scenario(1, 'Plan A', [prepayment(10, '2026-03-31', '5000.00')])], ID(1));
    await h.click('remove-event');
    expect(h.store.updated.at(-1)!.events).toHaveLength(0);
  });

  it('edits the amount and mode of an existing abono', async () => {
    const h = await setup([scenario(1, 'Plan A', [prepayment(10, '2026-03-31', '5000.00')])], ID(1));
    await h.click('edit-event');
    expect((h.element.querySelector('[id$="-abono-amount"]') as HTMLInputElement).value).toBe('5,000.00');
    await h.type('abono-amount', '7500');
    await h.choose('abono-mode', 'REDUCE_INSTALLMENT');
    await h.submit('abono-form');
    const saved = h.store.updated.at(-1)!;
    expect(saved.events).toHaveLength(1);
    expect(saved.events[0]).toMatchObject({ id: ID(10), amount: '7500.00', mode: 'REDUCE_INSTALLMENT' });
  });

  it('shows engine metrics as they are, with their sign, and promises no savings', async () => {
    const metrics: LoanMetrics = {
      realVsOriginal: undefined as never,
      activeScenarioVsReal: {
        currency: 'GTQ',
        interestSaved: parseMoney('-12.34'),
        monthsSaved: -1,
        baseEndDate: parseLocalDate('2045-01-31'),
        endDate: parseLocalDate('2045-02-28'),
        baseTotalPaid: parseMoney('1000.00'),
        totalPaid: parseMoney('1012.34'),
        netSaving: parseMoney('-12.34'),
      },
    };
    const h = await setup([scenario(1, 'Plan A', [prepayment(10, '2026-03-31', '5000.00')])], ID(1), { metrics });
    expect(h.byTestId('metric-interest')?.textContent).toContain('-Q 12.34');
    expect(h.byTestId('metric-net')?.textContent).toContain('-Q 12.34');
    expect(h.byTestId('metric-months')?.textContent).toContain('-1');
    expect(h.text()).toContain('no siempre reduce el interés total');
    expect(h.text()).not.toMatch(/te ahorrar|garantiza ahorr|siempre ahorr/i);
  });
});

describe('goal-seek', () => {
  async function seek(h: Harness, kind: 'FINISH_BY' | 'MAX_INSTALLMENT', target: string) {
    await h.choose('goal-kind', kind);
    await h.type('goal-date', '31/03/2026');
    await h.type(kind === 'FINISH_BY' ? 'goal-target-date' : 'goal-target-amount', target);
    await h.submit('goal-form');
    await vi.waitFor(() => expect(h.byTestId('goal-result')).not.toBeNull());
  }

  it('shows a busy state while it works and announces the result politely', async () => {
    const h = await setup([scenario(1, 'Plan A')], ID(1));
    await h.choose('goal-kind', 'FINISH_BY');
    await h.type('goal-date', '31/03/2026');
    await h.type('goal-target-date', '31/12/2040');
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    try {
      h.element.querySelector<HTMLFormElement>('[data-testid="goal-form"]')?.requestSubmit();
      for (let turn = 0; turn < 20; turn++) await Promise.resolve();
      h.fixture.detectChanges();
      expect(h.byTestId('goal-busy')).not.toBeNull();
      expect(h.element.querySelector('[data-testid="goal-submit"]')?.hasAttribute('disabled')).toBe(true);
      vi.advanceTimersByTime(1);
    } finally {
      vi.useRealTimers();
    }
    await vi.waitFor(() => expect(h.byTestId('goal-result')).not.toBeNull());
    expect(h.byTestId('goal-busy')).toBeNull();
    expect(/abono mínimo/i.test(h.announced())).toBe(true);
  });

  it('suggests the exact domain amount and applying it meets a finish-by-date goal', async () => {
    const h = await setup([scenario(1, 'Plan A')], ID(1));
    await seek(h, 'FINISH_BY', '31/12/2040');
    const direct = goalSeek(h.paths(), {
      basePath: 'REAL',
      prepaymentDate: parseLocalDate('2026-03-31'),
      goal: { kind: 'FINISH_BY', date: parseLocalDate('2040-12-31') },
    });
    if (direct.kind !== 'FOUND') throw new Error('expected FOUND');
    const shown = h.byTestId('goal-amount')?.textContent ?? '';
    const [whole, cents] = direct.amount.split('.');
    expect(shown.replace(/\s/g, '')).toBe(`Q${whole!.replace(/\B(?=(\d{3})+$)/g, ',')}.${cents}`);
    await h.click('goal-apply');
    const saved = h.store.updated.at(-1)!;
    expect(saved.events).toHaveLength(1);
    expect(saved.events[0]).toMatchObject({
      type: 'Prepayment',
      mode: 'REDUCE_TERM',
      amount: direct.amount,
      date: '2026-03-31',
    });
    expect(compareLocalDate(h.paths().scenario!.endDate, parseLocalDate('2040-12-31'))).toBeLessThanOrEqual(0);
    expect(h.byTestId('goal-result')).toBeNull();
  });

  it('applying a max-installment goal keeps the next installment within the target', async () => {
    const h = await setup([scenario(1, 'Plan A')], ID(1));
    await seek(h, 'MAX_INSTALLMENT', '4200');
    await h.click('goal-apply');
    const saved = h.store.updated.at(-1)!;
    expect(saved.events[0]).toMatchObject({ mode: 'REDUCE_INSTALLMENT' });
    const row = h.paths().scenario!.rows.find((item) => item.k === 15);
    expect(row === undefined || compareMoney(row.total, parseMoney('4200.00')) <= 0).toBe(true);
  });

  it('uses the scenario base when the active scenario already has events', async () => {
    const h = await setup([scenario(1, 'Plan A', [prepayment(10, '2025-09-30', '20000.00')])], ID(1));
    await seek(h, 'FINISH_BY', '31/12/2040');
    const direct = goalSeek(h.paths(), {
      basePath: 'SCENARIO',
      prepaymentDate: parseLocalDate('2026-03-31'),
      goal: { kind: 'FINISH_BY', date: parseLocalDate('2040-12-31') },
    });
    if (direct.kind !== 'FOUND') throw new Error('expected FOUND');
    expect(h.byTestId('goal-amount')?.textContent).toContain(direct.amount.split('.')[1]);
    await h.click('goal-apply');
    expect(h.store.updated.at(-1)!.events).toHaveLength(2);
  });

  it('says the goal is already met, with no apply button', async () => {
    const h = await setup([scenario(1, 'Plan A')], ID(1));
    await seek(h, 'FINISH_BY', '31/01/2045');
    expect(h.byTestId('goal-result')?.textContent).toContain('ya se cumple');
    expect(h.byTestId('goal-apply')).toBeNull();
  });

  it('explains an infeasible goal and shows the payoff amount without error styling', async () => {
    const h = await setup([scenario(1, 'Plan A')], ID(1));
    await seek(h, 'FINISH_BY', '31/01/2026');
    expect(h.byTestId('goal-result')?.textContent).toMatch(/no se puede|liquidar/i);
    expect(h.byTestId('goal-amount')?.textContent).toContain('Q ');
    expect(h.byTestId('goal-apply')).toBeNull();
  });

  it('shows domain input errors in Spanish', async () => {
    const real: DomainEvent = {
      type: 'Prepayment',
      id: 'r1',
      date: parseLocalDate('2025-06-30'),
      amount: parseMoney('10000.00'),
      mode: 'REDUCE_TERM',
    };
    const h = await setup([scenario(1, 'Plan A')], ID(1), { real: [real] });
    await h.choose('goal-kind', 'FINISH_BY');
    await h.type('goal-date', '31/05/2025');
    await h.type('goal-target-date', '31/12/2040');
    await h.submit('goal-form');
    await vi.waitFor(() => expect(h.byTestId('goal-failure')).not.toBeNull());
    expect(h.byTestId('goal-failure')?.textContent).toContain('datos reales');
  });

  it('discards a stale result when the scenario changes', async () => {
    const h = await setup([scenario(1, 'Plan A'), scenario(2, 'Plan B')], ID(1));
    await seek(h, 'FINISH_BY', '31/12/2040');
    const rows = h.element.querySelectorAll('[data-testid="scenario-row"]');
    (rows[1]?.querySelector('[data-testid="activate"]') as HTMLElement).click();
    await h.settle();
    expect(h.byTestId('goal-result')).toBeNull();
  });
});

const REAL_PREPAYMENT: DomainEvent = {
  type: 'Prepayment',
  id: 'r1',
  date: parseLocalDate('2025-06-30'),
  amount: parseMoney('10000.00'),
  mode: 'REDUCE_TERM',
};

async function runGoal(h: Harness, date: string, targetDate: string): Promise<void> {
  await h.choose('goal-kind', 'FINISH_BY');
  await h.type('goal-date', date);
  await h.type('goal-target-date', targetDate);
  await h.submit('goal-form');
  await vi.waitFor(() => expect(h.byTestId('goal-result')).not.toBeNull());
}

describe('C1: own events that would fall after the new end', () => {
  const late = prepayment(10, '2042-03-31', '1000.00');

  it('asks before applying, listing the events by cuota and date, and saves nothing yet', async () => {
    const h = await setup([scenario(1, 'Plan A', [late])], ID(1));
    await runGoal(h, '31/03/2026', '31/12/2035');
    const before = h.store.updated.length;
    await h.click('goal-apply');
    expect(h.store.updated).toHaveLength(before);
    const confirmation = h.byTestId('apply-confirmation')!;
    expect(confirmation.textContent).toContain('el préstamo termina antes');
    expect(confirmation.textContent).toContain('Cuota 206');
    expect(confirmation.textContent).toContain('31/03/2042');
    expect(confirmation.textContent).toContain('Aplicar y quitarlos');
  });

  it('«Aplicar y quitarlos» saves the goal abono without the late events; «Cancelar» leaves everything', async () => {
    const h = await setup([scenario(1, 'Plan A', [late])], ID(1));
    await runGoal(h, '31/03/2026', '31/12/2035');
    await h.click('goal-apply');
    await h.click('apply-cancel');
    expect(h.byTestId('apply-confirmation')).toBeNull();
    expect(h.store.updated).toHaveLength(0);
    await h.click('goal-apply');
    await h.click('apply-confirm');
    const saved = h.store.updated.at(-1)!;
    expect(saved.events).toHaveLength(1);
    expect(saved.events[0]).toMatchObject({ type: 'Prepayment', date: '2026-03-31', mode: 'REDUCE_TERM' });
    expect(compareLocalDate(h.paths().scenario!.endDate, parseLocalDate('2035-12-31'))).toBeLessThanOrEqual(0);
  });
});

describe('C2: tie order', () => {
  it('does not offer the search on a date where the scenario already has an abono or advance', async () => {
    const h = await setup([scenario(1, 'Plan A', [prepayment(10, '2026-03-31', '1000.00')])], ID(1));
    await h.choose('goal-kind', 'FINISH_BY');
    await h.type('goal-date', '31/03/2026');
    await h.type('goal-target-date', '31/12/2038');
    await h.submit('goal-form');
    expect(h.byTestId('goal-failure')?.textContent).toContain(
      'Ya hay un abono o adelanto en esa fecha en el escenario. Elige otra fecha o quítalo primero.',
    );
    expect(h.byTestId('goal-result')).toBeNull();
  });
});

describe('I1: stale results', () => {
  it('drops the result when the data changes while the engine was about to run', async () => {
    const h = await setup([scenario(1, 'Plan A')], ID(1));
    await h.choose('goal-kind', 'FINISH_BY');
    await h.type('goal-date', '31/03/2026');
    await h.type('goal-target-date', '31/12/2038');
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    try {
      h.element.querySelector<HTMLFormElement>('[data-testid="goal-form"]')?.requestSubmit();
      for (let turn = 0; turn < 20; turn++) await Promise.resolve();
      h.store.list.update((current) => [{ ...current[0]!, events: [prepayment(10, '2025-09-30', '5000.00')] }]);
      vi.advanceTimersByTime(1);
    } finally {
      vi.useRealTimers();
    }
    await vi.waitFor(() => expect(h.byTestId('goal-busy')).toBeNull());
    expect(h.byTestId('goal-result')).toBeNull();
  });

  it('clears the result when an event of the scenario changes', async () => {
    const h = await setup([scenario(1, 'Plan A', [prepayment(10, '2025-09-30', '5000.00')])], ID(1));
    await runGoal(h, '31/03/2026', '31/12/2038');
    await h.click('remove-event');
    expect(h.byTestId('goal-result')).toBeNull();
  });
});

describe('I2: no lost writes', () => {
  it('two quick removes both land', async () => {
    const events = [prepayment(10, '2025-09-30', '5000.00'), prepayment(11, '2025-11-30', '6000.00')];
    const h = await setup([scenario(1, 'Plan A', events)], ID(1));
    const buttons = h.element.querySelectorAll<HTMLElement>('[data-testid="remove-event"]');
    buttons[0]!.click();
    buttons[1]!.click();
    await vi.waitFor(() => expect(h.store.list()[0]!.events).toHaveLength(0));
  });

  it('a remove followed at once by an apply never resurrects the removed event nor saves a stale goal', async () => {
    const h = await setup([scenario(1, 'Plan A', [prepayment(10, '2025-09-30', '5000.00')])], ID(1));
    await runGoal(h, '31/03/2026', '31/12/2038');
    h.element.querySelector<HTMLElement>('[data-testid="remove-event"]')!.click();
    h.element.querySelector<HTMLElement>('[data-testid="goal-apply"]')?.click();
    await h.settle();
    await vi.waitFor(() => expect(h.store.list()[0]!.events).toHaveLength(0));
  });
});

describe('I3, M1, M2: a scenario the engine cannot compute', () => {
  const broken = [prepayment(10, '2025-04-30', '5000.00')];

  it('keeps the abono form and «Editar» available, hides the goal search and the empty-metrics text', async () => {
    const h = await setup([scenario(1, 'Plan A', broken)], ID(1), { real: [REAL_PREPAYMENT] });
    expect(h.byTestId('scenario-error')?.textContent).toContain('datos reales');
    expect(h.byTestId('scenario-error')?.textContent).toContain('Quita o edita el evento');
    expect(h.byTestId('abono-form')).not.toBeNull();
    expect(h.byTestId('goal-form')).toBeNull();
    expect(h.byTestId('goal-unavailable')).not.toBeNull();
    expect(h.byTestId('no-metrics')).toBeNull();
    await h.click('edit-event');
    await h.type('abono-date', '31/12/2025');
    await h.submit('abono-form');
    expect(h.store.updated.at(-1)!.events[0]).toMatchObject({ id: ID(10), date: '2025-12-31' });
    expect(h.byTestId('scenario-error')).toBeNull();
  });
});

describe('I4, I5: focus', () => {
  it('moves focus to the active scenario title after activating', async () => {
    const h = await setup([scenario(1, 'Plan A'), scenario(2, 'Plan B')], ID(1));
    const rows = h.element.querySelectorAll('[data-testid="scenario-row"]');
    (rows[1]?.querySelector('[data-testid="activate"]') as HTMLElement).click();
    await vi.waitFor(() => expect(document.activeElement?.id.endsWith('-active-title')).toBe(true));
  });

  it('moves focus to the events title after removing an event', async () => {
    const h = await setup([scenario(1, 'Plan A', [prepayment(10, '2025-09-30', '5000.00')])], ID(1));
    await h.click('remove-event');
    await vi.waitFor(() => expect(document.activeElement?.id.endsWith('-events-title')).toBe(true));
  });

  it('moves focus to the first invalid control on a failed submit, and the error list is not an alert', async () => {
    const h = await setup();
    await h.submit('name-form');
    await vi.waitFor(() => expect(document.activeElement?.id.endsWith('-name')).toBe(true));
    expect(h.element.querySelector('[role="alert"]')).toBeNull();
    expect(h.text()).toContain('Escribe un nombre para el escenario.');
  });
});

describe('I7, I8, M6: goal result details', () => {
  it('says what the metrics are against, by base', async () => {
    const real = await setup([scenario(1, 'Plan A')], ID(1));
    await runGoal(real, '31/03/2026', '31/12/2038');
    expect(real.byTestId('goal-base')?.textContent).toContain('Frente al camino real');
    TestBed.resetTestingModule();
    const scenarioBase = await setup([scenario(1, 'Plan A', [prepayment(10, '2025-09-30', '5000.00')])], ID(1));
    await runGoal(scenarioBase, '31/03/2026', '31/12/2038');
    expect(scenarioBase.byTestId('goal-base')?.textContent).toContain('Frente al escenario actual sin este abono');
  });

  it('shows the new level installment for a max-installment goal', async () => {
    const h = await setup([scenario(1, 'Plan A')], ID(1));
    await h.choose('goal-kind', 'MAX_INSTALLMENT');
    await h.type('goal-date', '31/03/2026');
    await h.type('goal-target-amount', '4200');
    await h.submit('goal-form');
    await vi.waitFor(() => expect(h.byTestId('goal-result')).not.toBeNull());
    expect(h.byTestId('goal-level')?.textContent).toMatch(/Q [\d,]+\.\d{2}/);
  });

  it('shows the amount to pay of an advance in the event list', async () => {
    const advance: ScenarioEvent = {
      id: ID(10),
      type: 'AdvanceInstallments',
      date: '2026-03-31',
      count: 6,
      deletedAt: null,
    };
    const h = await setup([scenario(1, 'Plan A', [advance])], ID(1));
    expect(h.byTestId('event-extra')?.textContent).toMatch(/Monto a pagar: Q [\d,]+\.\d{2}/);
  });

  it('applies a payoff result when the minimum trial throws', async () => {
    const rateChange: DomainEvent = {
      type: 'RateChange',
      id: 'rc-future',
      date: parseLocalDate('2027-01-31'),
      interestRate: parseRate('0.0701'),
      policy: 'KEEP_INSTALLMENT_ADJUST_TERM',
    };
    const h = await setup([scenario(1, 'Plan A')], ID(1), { real: [rateChange] });
    await h.choose('goal-kind', 'MAX_INSTALLMENT');
    await h.type('goal-date', '15/01/2026');
    await h.type('goal-target-amount', '0');
    await h.submit('goal-form');
    await vi.waitFor(() => expect(h.byTestId('goal-result')).not.toBeNull());
    expect(h.byTestId('goal-result')?.textContent).toContain('liquida el préstamo');
    await h.click('goal-apply');
    expect(h.store.updated.at(-1)!.events[0]).toMatchObject({ type: 'Prepayment', mode: 'REDUCE_INSTALLMENT' });
  });
});

describe('M7', () => {
  it('Escape cancels the inline delete confirmation', async () => {
    const h = await setup([scenario(1, 'Plan A')], ID(1));
    await h.click('delete');
    h.element
      .querySelector('[data-testid="confirm-ok"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await h.settle();
    expect(h.byTestId('confirm-ok')).toBeNull();
    expect(h.store.list()).toHaveLength(1);
  });

  it('says exactly that the scenario was created but could not be activated', async () => {
    const h = await setup();
    h.store.failActivate = true;
    await h.type('name', 'Plan A');
    await h.submit('name-form');
    expect(h.store.created).toHaveLength(1);
    expect(h.byTestId('scenarios-failure')?.textContent).toContain(
      'Se creó el escenario «Plan A», pero no se pudo activar',
    );
  });
});
