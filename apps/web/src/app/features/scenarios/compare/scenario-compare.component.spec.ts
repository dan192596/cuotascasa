import { signal } from '@angular/core';
import { DeferBlockBehavior, DeferBlockState, TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { InvalidInputError, NegativeAmortizationError, type Money } from '@cuotascasa/domain';
import { describe, expect, it, vi } from 'vitest';
import type { LoanProjectionService, LoansStore, ScenarioComparison, ScenariosStore } from '../../../data/api.ts';
import { LOAN_PROJECTION_SERVICE, LOANS_STORE, SCENARIOS_STORE } from '../../../data/tokens.ts';
import { Announcer } from '../../../ui/feedback/announcer.service.ts';
import { formatLocalDate, formatMoney } from '../../../ui/format/format.ts';
import { ExportMenuComponent } from '../../export/export-menu.component.ts';
import { comparison, entry } from './testing/compare-fixtures.ts';
import { ScenarioCompareComponent } from './scenario-compare.component.ts';

const LOAN = 'a0000000-0000-4000-8000-000000000001';

interface Setup {
  readonly scenarios?: readonly { readonly id: string; readonly name: string }[];
  readonly ready?: boolean;
  readonly loanMissing?: boolean;
  /** Builds the comparison for the compared ids; null = engine could not compute it. */
  readonly compare?: (ids: readonly string[]) => ScenarioComparison | null;
}

const NAMES = [
  { id: 's1', name: 'Abono A' },
  { id: 's2', name: 'Abono B' },
  { id: 's3', name: 'Abono C' },
  { id: 's4', name: 'Abono D' },
];

function mount(setup: Setup = {}) {
  const scenarios = (setup.scenarios ?? NAMES).map((s) => ({ ...s, loanId: LOAN, events: [], deletedAt: null }));
  const compareSpy = vi.fn((_loanId: string, ids: readonly string[]) =>
    signal(
      (
        setup.compare ??
        ((picked) => comparison(picked.map((id) => entry(id, scenarios.find((s) => s.id === id)?.name ?? id))))
      )(ids),
    ).asReadonly(),
  );
  const polite = vi.fn((message: string) => Promise.resolve(message.length));
  TestBed.configureTestingModule({
    deferBlockBehavior: DeferBlockBehavior.Manual,
    providers: [
      { provide: Announcer, useValue: { polite } },
      {
        provide: SCENARIOS_STORE,
        useValue: {
          ready: signal(setup.ready ?? true).asReadonly(),
          listByLoan: () => signal(scenarios).asReadonly(),
        } as unknown as ScenariosStore,
      },
      {
        provide: LOANS_STORE,
        useValue: {
          loan: () =>
            signal(setup.loanMissing === true ? undefined : { id: LOAN, name: 'Casa A', currency: 'GTQ' }).asReadonly(),
        } as unknown as LoansStore,
      },
      {
        provide: LOAN_PROJECTION_SERVICE,
        useValue: {
          compareScenarios: compareSpy,
          asOf: signal('2026-10-16').asReadonly(),
          forLoan: () => ({ error: signal(null).asReadonly() }),
        } as unknown as LoanProjectionService,
      },
    ],
  });
  const fixture = TestBed.createComponent(ScenarioCompareComponent);
  fixture.componentRef.setInput('loanId', LOAN);
  fixture.detectChanges();
  return { fixture, compareSpy, polite };
}

const root = (f: ComponentFixture<unknown>) => f.nativeElement as HTMLElement;
const byId = (f: ComponentFixture<unknown>, id: string) => root(f).querySelector<HTMLElement>(`[data-testid="${id}"]`);
const text = (f: ComponentFixture<unknown>, id: string) =>
  byId(f, id)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
const options = (f: ComponentFixture<unknown>) => [
  ...root(f).querySelectorAll<HTMLInputElement>('input[data-testid="scenario-option"]'),
];
function click(f: ComponentFixture<unknown>, input: HTMLInputElement): void {
  input.click();
  f.detectChanges();
}
function row(f: ComponentFixture<unknown>, label: string): string[] {
  const tr = [...root(f).querySelectorAll('[data-testid="compare-metrics"] tbody tr')].find(
    (candidate) => candidate.querySelector('th')?.textContent?.trim() === label,
  );
  return [...(tr?.querySelectorAll('td') ?? [])].map((td) => td.textContent?.replace(/\s+/g, ' ').trim() ?? '');
}

describe('cc-scenario-compare: selection', () => {
  it('slides an indicator under the first active option with translateX', () => {
    const { fixture } = mount();
    const indicator = () => byId(fixture, 'scenario-indicator');
    expect(indicator()?.style.getPropertyValue('--cc-i')).toBe('0');
    expect(indicator()?.style.getPropertyValue('--cc-n')).toBe('4');
    click(fixture, options(fixture)[0] as HTMLInputElement);
    expect(indicator()?.style.getPropertyValue('--cc-i')).toBe('1');
    const css = [...document.head.querySelectorAll('style')].map((c) => c.textContent).join('\n');
    expect(css).toContain('translateX(calc(var(--cc-i) * 100%))');
    expect(css).toContain('var(--cc-ease-out)');
  });

  it('lists the scenarios of the loan and compares the first three by default', () => {
    const { fixture, compareSpy } = mount();
    expect(options(fixture).map((o) => o.checked)).toEqual([true, true, true, false]);
    expect(compareSpy).toHaveBeenLastCalledWith(LOAN, ['s1', 's2', 's3']);
  });

  it('blocks a 4th scenario with a message and keeps comparing the same three', () => {
    const { fixture, compareSpy } = mount();
    click(fixture, options(fixture)[3] as HTMLInputElement);
    expect(options(fixture).map((o) => o.checked)).toEqual([true, true, true, false]);
    expect(text(fixture, 'compare-status')).toContain('hasta 3 escenarios');
    expect(compareSpy.mock.calls.every(([, ids]) => ids.length <= 3)).toBe(true);
  });

  it('announces the limit on every blocked attempt, through the polite announcer', () => {
    const { fixture, polite } = mount();
    click(fixture, options(fixture)[3] as HTMLInputElement);
    click(fixture, options(fixture)[3] as HTMLInputElement);
    const limit = polite.mock.calls.filter(([message]) => String(message).includes('hasta 3 escenarios'));
    expect(limit).toHaveLength(2);
    expect(text(fixture, 'compare-status')).toContain('hasta 3 escenarios');
  });

  it('accepts the 4th after one is unchecked and clears the message', () => {
    const { fixture, compareSpy } = mount();
    click(fixture, options(fixture)[3] as HTMLInputElement);
    click(fixture, options(fixture)[0] as HTMLInputElement);
    expect(text(fixture, 'compare-status')).not.toContain('hasta 3 escenarios');
    click(fixture, options(fixture)[3] as HTMLInputElement);
    expect(options(fixture).map((o) => o.checked)).toEqual([false, true, true, true]);
    expect(compareSpy).toHaveBeenLastCalledWith(LOAN, ['s2', 's3', 's4']);
  });

  it('explains how to start when the loan has no scenarios', () => {
    const { fixture } = mount({ scenarios: [], compare: () => comparison([]) });
    expect(byId(fixture, 'compare-no-scenarios')).not.toBeNull();
    expect(options(fixture)).toHaveLength(0);
  });
});

describe('cc-scenario-compare: metrics', () => {
  it('shows the compareSchedules outputs of each scenario, including the Ahorro neto row', () => {
    const { fixture } = mount({
      compare: (ids) =>
        comparison(
          ids.map((id, i) =>
            entry(id, `Abono ${id}`, {
              interestSaved: `${String(1000 + i)}.50` as Money,
              monthsSaved: 3 + i,
              netSaving: `${String(2000 + i)}.25` as Money,
              totalPaid: `${String(28000 + i)}.00` as Money,
              endDate: `2030-0${String(i + 1)}-28` as never,
            }),
          ),
        ),
    });
    const headings = [...root(fixture).querySelectorAll('[data-testid="compare-metrics"] thead th')].map((th) =>
      th.textContent?.trim(),
    );
    expect(headings).toEqual(['Concepto', 'Original', 'Real (base)', 'Abono s1', 'Abono s2', 'Abono s3']);
    expect(row(fixture, 'Ahorro neto')).toEqual([
      '—',
      '—',
      formatMoney('2000.25', 'GTQ'),
      formatMoney('2001.25', 'GTQ'),
      formatMoney('2002.25', 'GTQ'),
    ]);
    expect(row(fixture, 'Interés ahorrado').slice(2)).toEqual([
      formatMoney('1000.50', 'GTQ'),
      formatMoney('1001.50', 'GTQ'),
      formatMoney('1002.50', 'GTQ'),
    ]);
    expect(row(fixture, 'Meses ahorrados').slice(2)).toEqual(['3 meses', '4 meses', '5 meses']);
    expect(row(fixture, 'Fecha de fin').slice(2)).toEqual([
      formatLocalDate('2030-01-28'),
      formatLocalDate('2030-02-28'),
      formatLocalDate('2030-03-28'),
    ]);
    expect(row(fixture, 'Total pagado').slice(2)).toEqual([
      formatMoney('28000.00', 'GTQ'),
      formatMoney('28001.00', 'GTQ'),
      formatMoney('28002.00', 'GTQ'),
    ]);
    expect(row(fixture, 'Total pagado').slice(0, 2)).toEqual([
      formatMoney('31000.00', 'GTQ'),
      formatMoney('30000.00', 'GTQ'),
    ]);
  });

  it('shows a negative result as it is, with its sign and a plain-words marker', () => {
    const { fixture } = mount({
      scenarios: [{ id: 's1', name: 'Abono A' }],
      compare: () =>
        comparison([
          entry('s1', 'Abono A', { interestSaved: '-12.34' as Money, netSaving: '-50.00' as Money, monthsSaved: -1 }),
        ]),
    });
    const net = row(fixture, 'Ahorro neto')[2] ?? '';
    expect(net).toContain(formatMoney('-50.00', 'GTQ'));
    expect(net).toContain('cuesta más');
    expect(row(fixture, 'Interés ahorrado')[2]).toContain(formatMoney('-12.34', 'GTQ'));
    expect(row(fixture, 'Meses ahorrados')[2]).toContain('-1 mes');
    expect(text(fixture, 'compare-negative-note')).toContain('negativo');
  });

  it('shows loading and engine-failure states instead of an empty table', () => {
    const loading = mount({ ready: false, compare: () => null });
    expect(byId(loading.fixture, 'compare-loading')).not.toBeNull();
    TestBed.resetTestingModule();
    const failed = mount({ compare: () => null });
    expect(byId(failed.fixture, 'compare-unavailable')).not.toBeNull();
    expect(byId(failed.fixture, 'compare-metrics')).toBeNull();
  });
});

describe('cc-scenario-compare: failed scenarios (D27)', () => {
  it('keeps the comparison and lists each failed scenario with its error mapped by code', () => {
    const { fixture } = mount({
      compare: () =>
        comparison(
          [entry('s1', 'Abono A')],
          [
            { scenarioId: 's2', error: new InvalidInputError('HYPOTHETICAL_BEFORE_CUTOFF', 'SECRET 777.77', { k: 5 }) },
            { scenarioId: 's3', error: new NegativeAmortizationError('ALG.TERM', 9, '1.00' as Money, '2.00' as Money) },
          ],
        ),
    });
    expect(byId(fixture, 'compare-metrics')).not.toBeNull();
    const failed = text(fixture, 'compare-failed') ?? '';
    expect(failed).toContain('Abono B');
    expect(failed).toContain('cuota 5');
    expect(failed).toContain('Abono C');
    expect(failed).toContain('cuota 9');
    expect(failed).not.toContain('SECRET');
    expect(failed).not.toContain('777.77');
  });
});

describe('cc-scenario-compare: chart and data table', () => {
  it('keeps the chart behind a deferred block: only a placeholder until it is visible', async () => {
    const { fixture } = mount();
    expect(byId(fixture, 'chart-placeholder')).not.toBeNull();
    expect(root(fixture).querySelector('canvas')).toBeNull();
    expect((await fixture.getDeferBlocks()).length).toBe(1);
  });

  it('can reach the loading state without importing the chart in the component file', async () => {
    const { fixture } = mount();
    const [block] = await fixture.getDeferBlocks();
    await block?.render(DeferBlockState.Loading);
    expect(root(fixture).querySelector('canvas')).toBeNull();
  });

  it('offers the same balances as a keyboard-reachable table of strings', () => {
    const { fixture } = mount({
      scenarios: [{ id: 's1', name: 'Abono A' }],
      compare: () => comparison([entry('s1', 'Abono A')]),
    });
    const details = byId(fixture, 'chart-data-details') as HTMLDetailsElement;
    expect(details.tagName).toBe('DETAILS');
    expect(details.querySelector('summary')).not.toBeNull();
    const region = byId(fixture, 'chart-data-region') as HTMLElement;
    expect(region.getAttribute('tabindex')).toBe('0');
    expect(region.getAttribute('role')).toBe('region');
    expect(region.getAttribute('aria-label')).toBeTruthy();
    const heads = [...region.querySelectorAll('thead th')].map((th) => th.textContent?.trim());
    expect(heads).toEqual(['Año', 'Original', 'Real', 'Abono A']);
    const first = [...region.querySelectorAll('tbody tr:first-child td')].map((td) => td.textContent?.trim());
    expect(first).toContain(formatMoney('600.00', 'GTQ'));
  });
});

describe('cc-scenario-compare: chart wording', () => {
  it('names the table by its summary, not by position', () => {
    const { fixture } = mount();
    expect(root(fixture).textContent).not.toContain('de abajo');
    expect(byId(fixture, 'chart-data-details')?.querySelector('summary')?.textContent?.trim()).toBe(
      'Ver los saldos de la gráfica en una tabla',
    );
  });
});

describe('cc-scenario-compare: chart error', () => {
  it('opens the data table when the chart fails to load', async () => {
    const { fixture } = mount();
    const details = byId(fixture, 'chart-data-details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    const [block] = await fixture.getDeferBlocks();
    await block?.render(DeferBlockState.Error);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root(fixture).textContent).toContain('Ver los saldos de la gráfica en una tabla');
    expect(details.open).toBe(true);
  });
});

describe('cc-scenario-compare: export', () => {
  it('offers no export when the loan does not exist', () => {
    const { fixture } = mount({ loanMissing: true });
    expect(fixture.debugElement.query(By.directive(ExportMenuComponent))).toBeNull();
  });

  it('hands the comparison to cc-export-menu', () => {
    const { fixture } = mount();
    const menu = fixture.debugElement.query(By.directive(ExportMenuComponent)).componentInstance as ExportMenuComponent;
    const request = menu.request();
    expect(request.kind).toBe('comparison');
    if (request.kind !== 'comparison') return;
    expect(request.input.loanLabel).toBe('Casa A');
    expect(request.input.base.label).toBe('Real');
    expect(request.input.scenarios.map((s) => s.label)).toEqual(['Abono A', 'Abono B', 'Abono C']);
    expect(request.input.scenarios[0]?.metrics.netSaving).toBe('2000.00');
    expect(request.input.generatedOn).toBe('2026-10-16');
  });
});
