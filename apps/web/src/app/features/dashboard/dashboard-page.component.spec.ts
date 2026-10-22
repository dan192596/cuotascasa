import { signal, type Signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router, type Routes } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { DomainError, Money } from '@cuotascasa/domain';
import type {
  BackupService,
  CurrencyTotals,
  LoanProjection,
  LoanProjectionService,
  LoansStore,
  SyncService,
} from '../../data/api.ts';
import { BACKUP_SERVICE, LOAN_PROJECTION_SERVICE, LOANS_STORE, SYNC_SERVICE } from '../../data/tokens.ts';
import { DashboardPageComponent, DEVICE_CLEARED_NOTICE } from './dashboard-page.component.ts';

type Loan = ReturnType<LoansStore['loans']>[number];
const money = (value: string): Money => value as Money;

function loan(id: string, over: Partial<Loan> = {}): Loan {
  return { id, name: `Casa ${id}`, bank: 'Banco Ficticio', currency: 'GTQ', status: 'active', ...over } as Loan;
}

interface ProjectionSpec {
  readonly percent?: string | null;
  readonly balance?: string | null;
  readonly next?: string | null;
  readonly due?: string | null;
  readonly end?: string | null;
  readonly scenarioEnd?: string | null;
  readonly validation?: 'GREEN' | 'AMBER' | 'RED' | 'UNVALIDATED';
  readonly suggestedPaid?: boolean;
  readonly error?: DomainError | null;
}

function projection(id: string, s: ProjectionSpec = {}): LoanProjection {
  const sig = <T>(v: T): Signal<T> => signal(v).asReadonly();
  return {
    loanId: id,
    error: sig(s.error ?? null),
    percentPaid: sig(s.percent === undefined ? '2.0' : s.percent),
    balance: sig(s.balance === undefined ? '489756.31' : s.balance),
    nextInstallmentTotal: sig(s.next === undefined ? '4658.47' : s.next),
    currentInstallment: sig(
      s.due === null
        ? null
        : ({ dueDate: s.due ?? '2026-02-28' } as unknown as ReturnType<LoanProjection['currentInstallment']>),
    ),
    realEndDate: sig(s.end === undefined ? '2045-01-31' : s.end),
    activeScenarioEndDate: sig(s.scenarioEnd ?? null),
    validation: sig({
      status: s.validation ?? 'UNVALIDATED',
      reportedBalanceId: null,
      k: null,
      realDelta: null,
      cause: null,
    }),
    suggestedPaid: sig(s.suggestedPaid ?? false),
  } as unknown as LoanProjection;
}

interface Setup {
  readonly loans?: readonly Loan[];
  readonly ready?: boolean;
  readonly projections?: Readonly<Record<string, ProjectionSpec>>;
  readonly totals?: readonly CurrencyTotals[];
  readonly reminderDue?: boolean;
  readonly lastBackupAt?: string | null;
  readonly syncText?: string;
}

function configure(setup: Setup = {}, routes: Routes = []): void {
  const loans = setup.loans ?? [];
  const store = {
    ready: signal(setup.ready ?? true).asReadonly(),
    loans: signal(loans).asReadonly(),
  } as unknown as LoansStore;
  const service = {
    forLoan: (id: string) => projection(id, setup.projections?.[id]),
    totalsByCurrency: signal(setup.totals ?? []).asReadonly(),
  } as unknown as LoanProjectionService;
  const backup = {
    reminderDue: signal(setup.reminderDue ?? false).asReadonly(),
    lastBackupAt: signal(setup.lastBackupAt ?? null).asReadonly(),
    changesSinceBackup: signal(0).asReadonly(),
  } as unknown as BackupService;
  const sync = { statusText: signal(setup.syncText ?? 'No configurado').asReadonly() } as unknown as SyncService;
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes),
      { provide: LOANS_STORE, useValue: store },
      { provide: LOAN_PROJECTION_SERVICE, useValue: service },
      { provide: BACKUP_SERVICE, useValue: backup },
      { provide: SYNC_SERVICE, useValue: sync },
    ],
  });
}

function mount(setup: Setup = {}): ComponentFixture<DashboardPageComponent> {
  configure(setup);
  const fixture = TestBed.createComponent(DashboardPageComponent);
  fixture.detectChanges();
  return fixture;
}

const root = (f: ComponentFixture<unknown>) => f.nativeElement as HTMLElement;
const byId = (f: ComponentFixture<unknown>, id: string) => root(f).querySelector<HTMLElement>(`[data-testid="${id}"]`);
const all = (f: ComponentFixture<unknown>, id: string) => [
  ...root(f).querySelectorAll<HTMLElement>(`[data-testid="${id}"]`),
];
const text = (f: ComponentFixture<unknown>, id: string) =>
  byId(f, id)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;

function chooseFilter(f: ComponentFixture<unknown>, value: string): void {
  const select = byId(f, 'status-filter') as HTMLSelectElement;
  select.value = value;
  select.dispatchEvent(new Event('change'));
  f.detectChanges();
}

describe('DashboardPageComponent: cards', () => {
  it('keeps the page test id and shows a card per active loan with the values of the projection service', () => {
    const f = mount({
      loans: [loan('a'), loan('b')],
      projections: {
        a: { scenarioEnd: '2040-05-31' },
        b: { percent: '55.5', balance: money('1000.00'), next: '120.00' },
      },
    });
    expect(f.nativeElement.getAttribute('data-testid')).toBe('page-dashboard');
    const cards = all(f, 'loan-card');
    expect(cards).toHaveLength(2);
    const first = cards[0] as HTMLElement;
    const q = (id: string) => first.querySelector(`[data-testid="${id}"]`)?.textContent?.replace(/\s+/g, ' ').trim();
    expect(first.textContent).toContain('Casa a');
    expect(q('card-balance')).toContain('Q 489,756.31');
    expect(q('card-next')).toContain('Q 4,658.47');
    expect(q('card-due')).toContain('28/02/2026');
    expect(q('card-end')).toContain('31/01/2045');
    expect(q('card-scenario-end')).toContain('31/05/2040');
    expect(q('card-status')).toBe('Activo');
    expect(first.querySelector('[data-testid="house-text"]')?.textContent).toContain('2 %');
    const second = cards[1] as HTMLElement;
    expect(second.querySelector('[data-testid="card-scenario-end"]')).toBeNull();
    expect(second.querySelector('[data-testid="house-text"]')?.textContent).toContain('55.5 %');
  });

  it('shows Sin validar for an UNVALIDATED loan and the matching chip otherwise', () => {
    const f = mount({
      loans: [loan('a'), loan('b')],
      projections: { a: { validation: 'UNVALIDATED' }, b: { validation: 'GREEN' } },
    });
    const chips = all(f, 'chip-label').map((c) => c.textContent);
    expect(chips).toEqual(['Sin validar', 'Coincide']);
  });

  it('shows the paid suggestion only when the loan is active and the engine suggests it', () => {
    const f = mount({ loans: [loan('a')], projections: { a: { suggestedPaid: true } } });
    expect(text(f, 'card-suggested-paid')).toContain('pagado');
    TestBed.resetTestingModule();
    expect(byId(mount({ loans: [loan('a')] }), 'card-suggested-paid')).toBeNull();
    TestBed.resetTestingModule();
    const archived = mount({ loans: [loan('a', { status: 'archived' })], projections: { a: { suggestedPaid: true } } });
    chooseFilter(archived, 'archived');
    expect(byId(archived, 'card-suggested-paid')).toBeNull();
  });

  it('maps an engine error to fixed Spanish text and hides the figures', () => {
    const error = {
      kind: 'NegativeAmortization',
      message: 'secret 99999.99',
      rule: null,
      k: 3,
    } as unknown as DomainError;
    const f = mount({
      loans: [loan('a')],
      projections: { a: { error, percent: null, balance: null, next: null, due: null, end: null } },
    });
    expect(byId(f, 'card-error')?.getAttribute('role')).toBe('status');
    expect(text(f, 'card-error')).not.toContain('99999.99');
    expect(text(f, 'card-error')).toContain('cuota');
    expect(byId(f, 'card-balance')).toBeNull();
  });

  it('uses the loan currency for the amounts', () => {
    const f = mount({ loans: [loan('a', { currency: 'USD' })] });
    expect(text(f, 'card-balance')).toContain('US$ 489,756.31');
  });

  it('links each card to its detail, table, real data and projections', () => {
    const f = mount({ loans: [loan('abc')] });
    const hrefs = [...(byId(f, 'loan-card') as HTMLElement).querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual([
      '/app/prestamos/abc',
      '/app/prestamos/abc/tabla',
      '/app/prestamos/abc/datos-reales',
      '/app/prestamos/abc/proyecciones',
    ]);
  });
});

describe('DashboardPageComponent: totals', () => {
  it('renders GTQ and USD totals separately and a dash for a currency without loans', () => {
    const f = mount({
      loans: [loan('a')],
      totals: [{ currency: 'GTQ', loanCount: 1, balance: money('489756.31'), nextInstallmentTotal: money('4658.47') }],
    });
    expect(text(f, 'total-GTQ')).toContain('Q 489,756.31');
    expect(text(f, 'total-GTQ')).toContain('Q 4,658.47');
    expect(text(f, 'total-USD')).toContain('—');
    expect(text(f, 'total-USD')).not.toContain('Q');
  });

  it('never adds the two currencies', () => {
    const f = mount({
      loans: [loan('a'), loan('b', { currency: 'USD' })],
      totals: [
        { currency: 'GTQ', loanCount: 1, balance: money('1000.00'), nextInstallmentTotal: money('100.00') },
        { currency: 'USD', loanCount: 1, balance: money('2000.00'), nextInstallmentTotal: money('50.00') },
      ],
    });
    expect(text(f, 'total-GTQ')).toContain('Q 1,000.00');
    expect(text(f, 'total-GTQ')).not.toContain('2,000.00');
    expect(text(f, 'total-USD')).toContain('US$ 2,000.00');
    expect(text(f, 'total-USD')).not.toContain('1,000.00');
  });
});

describe('DashboardPageComponent: status filter', () => {
  const loans = [loan('a'), loan('p', { status: 'paid' }), loan('r', { status: 'archived' })];

  it('hides paid and archived loans by default and shows them through the filter', () => {
    const f = mount({ loans });
    expect(all(f, 'loan-card')).toHaveLength(1);
    chooseFilter(f, 'paid');
    expect(all(f, 'loan-card')).toHaveLength(1);
    expect(text(f, 'card-status')).toBe('Pagado');
    chooseFilter(f, 'archived');
    expect(text(f, 'card-status')).toBe('Archivado');
    chooseFilter(f, 'active');
    expect(text(f, 'card-status')).toBe('Activo');
  });

  it('offers the three options in Spanish', () => {
    const f = mount({ loans });
    const options = [...(byId(f, 'status-filter') as HTMLSelectElement).options].map((o) => o.textContent?.trim());
    expect(options).toEqual(['Activos', 'Pagados', 'Archivados']);
  });

  it('explains an empty filter result without showing the first-use actions', () => {
    const f = mount({ loans: [loan('p', { status: 'paid' })] });
    expect(all(f, 'loan-card')).toHaveLength(0);
    expect(byId(f, 'empty-state')).toBeNull();
    expect(text(f, 'filter-empty')).toContain('activos');
  });
});

describe('DashboardPageComponent: status widget', () => {
  it('shows the reminder exactly when BackupService.reminderDue() is true', () => {
    expect(byId(mount({ reminderDue: true }), 'backup-reminder')?.getAttribute('role')).toBe('status');
    TestBed.resetTestingModule();
    expect(byId(mount({ reminderDue: false }), 'backup-reminder')).toBeNull();
  });

  it('links the reminder to the settings page', () => {
    const f = mount({ reminderDue: true });
    expect(byId(f, 'backup-reminder')?.querySelector('a')?.getAttribute('href')).toBe('/app/ajustes');
  });

  it('announces the sync status politely', () => {
    expect(byId(mount(), 'sync-status')?.getAttribute('role')).toBe('status');
  });

  it('shows the sync status text and the last backup date', () => {
    const f = mount({ syncText: 'Cambios sin sincronizar (3)', lastBackupAt: '2026-10-04T12:00:00.000Z' });
    expect(text(f, 'sync-status')).toContain('Cambios sin sincronizar (3)');
    expect(text(f, 'backup-status')).toContain('04/10/2026');
  });

  it('says there is no backup yet', () => {
    expect(text(mount(), 'backup-status')).toContain('Aún sin respaldo');
  });

  it('contains no threshold logic for the reminder (grep test)', () => {
    const dir = 'apps/web/src/app/features/dashboard';
    const sources = readdirSync(dir).filter((n) => n.endsWith('.ts') && !n.endsWith('.spec.ts'));
    expect(sources.length).toBeGreaterThan(2);
    for (const name of sources) {
      let source = readFileSync(`${dir}/${name}`, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      // `new Date` is allowed only inside backupDateText (local calendar day of the stored instant).
      if (name === 'dashboard-model.ts') source = source.replace(/export function backupDateText[\s\S]*?\n}\n/, '');
      expect(source, name).not.toMatch(/changesSinceBackup|\b30\b|\b20\b|86_?400|Date\.now|new Date/);
    }
  });
});

describe('DashboardPageComponent: empty state', () => {
  it('shows the three first-use actions on a fresh profile', () => {
    const f = mount();
    const actions = [...(byId(f, 'empty-actions') as HTMLElement).querySelectorAll('a')];
    expect(actions.map((a) => a.textContent?.trim())).toEqual([
      'Crear un préstamo',
      'Restaurar un respaldo',
      'Conectar Drive',
    ]);
    expect(actions.map((a) => a.getAttribute('href'))).toEqual([
      '/app/prestamos/nuevo',
      '/app/ajustes',
      '/app/ajustes',
    ]);
    expect(all(f, 'loan-card')).toHaveLength(0);
  });

  it('shows nothing definitive while the stores are not ready', () => {
    const f = mount({ ready: false });
    expect(byId(f, 'empty-state')).toBeNull();
    expect(byId(f, 'loading')?.getAttribute('role')).toBe('status');
  });
});

describe('DashboardPageComponent: after «Borrar datos de este dispositivo»', () => {
  async function open(url: string) {
    configure({}, [{ path: 'app', component: DashboardPageComponent }]);
    const harness = await RouterTestingHarness.create(url);
    await harness.fixture.whenStable();
    const element = harness.fixture.nativeElement as HTMLElement;
    const notice = () => element.querySelector<HTMLElement>('[data-testid="device-cleared"]');
    return { harness, notice, router: TestBed.inject(Router) };
  }

  it('confirms the deletion once and drops the parameter from the URL', async () => {
    const { harness, notice, router } = await open('/app?borrado=1');
    expect(notice()?.getAttribute('role')).toBe('status');
    expect(notice()?.textContent).toContain(DEVICE_CLEARED_NOTICE);
    expect(router.url).toBe('/app');
    notice()?.querySelector('button')?.click();
    await harness.fixture.whenStable();
    expect(notice()).toBeNull();
  });

  it('shows nothing on a normal visit', async () => {
    const { notice } = await open('/app');
    expect(notice()).toBeNull();
  });
});
