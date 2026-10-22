import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Currency } from '@cuotascasa/domain';
import type { CurrencyTotals } from '../../data/api.ts';
import { BACKUP_SERVICE, LOAN_PROJECTION_SERVICE, LOANS_STORE, SYNC_SERVICE } from '../../data/tokens.ts';
import { OdometerComponent } from '../../ui/motion/odometer.component.ts';
import { EmptyStateComponent } from '../../ui/feedback/empty-state.component.ts';
import { MoneyPipe } from '../../ui/format/money.pipe.ts';
import {
  backupDateText,
  DASHBOARD_FILTERS,
  type DashboardFilter,
  FILTER_LABELS,
  filterLoans,
} from './dashboard-model.ts';
import { LoanCardComponent } from './loan-card.component.ts';

const CURRENCY_ROWS: readonly { readonly currency: Currency; readonly label: string }[] = [
  { currency: 'GTQ', label: 'En quetzales' },
  { currency: 'USD', label: 'En dólares' },
];

const MAX_STAGGER_STEP = 7;

/** /app (HU-06, R13, R27, R28): loan cards, per-currency totals, status filter, sync/backup status, first-use state. */
@Component({
  selector: 'cc-dashboard-page',
  imports: [RouterLink, EmptyStateComponent, LoanCardComponent, MoneyPipe, OdometerComponent],
  template: `
    <h1>Mis préstamos</h1>

    <section class="status" aria-label="Estado de sincronización y respaldo" data-testid="status-widget">
      <p role="status" data-testid="sync-status">Drive: {{ sync.statusText() }}</p>
      <p data-testid="backup-status">Último respaldo: {{ lastBackup() }}</p>
      @if (backup.reminderDue()) {
        <p class="reminder" role="status" data-testid="backup-reminder">
          Conviene hacer un respaldo. <a routerLink="/app/ajustes">Ir a Ajustes</a>
        </p>
      }
    </section>

    @if (!store.ready()) {
      <p role="status" data-testid="loading">Cargando tus préstamos…</p>
    } @else if (store.loans().length === 0) {
      <cc-empty-state heading="Aún no tienes préstamos" layout="mosaic">
        Empieza creando uno, restaura un respaldo o conecta tu Google Drive.
        <a ccEmptyActions class="action primary" routerLink="/app/prestamos/nuevo">Crear un préstamo</a>
        <a ccEmptyActions class="action" routerLink="/app/ajustes">Restaurar un respaldo</a>
        <a ccEmptyActions class="action" routerLink="/app/ajustes">Conectar Drive</a>
      </cc-empty-state>
    } @else {
      <section class="totals" aria-label="Totales por moneda" data-testid="totals">
        @for (row of totalRows(); track row.currency) {
          <div class="total" [attr.data-testid]="'total-' + row.currency">
            <h2>Saldo total {{ row.label.toLowerCase() }}</h2>
            @if (row.totals; as totals) {
              <p class="num"><cc-odometer [value]="totals.balance | money: row.currency" /></p>
              <p class="muted">
                Próximas cuotas:
                <span class="num"><cc-odometer [value]="totals.nextInstallmentTotal | money: row.currency" /></span>
              </p>
            } @else {
              <p class="num">—</p>
            }
          </div>
        }
      </section>

      <div class="toolbar">
        <label for="cc-status-filter">Mostrar</label>
        <select id="cc-status-filter" data-testid="status-filter" [value]="filter()" (change)="setFilter($event)">
          @for (option of filters; track option) {
            <option [value]="option" [selected]="option === filter()">{{ labels[option] }}</option>
          }
        </select>
        <a class="action primary" routerLink="/app/prestamos/nuevo">Nuevo préstamo</a>
      </div>

      @if (visible().length === 0) {
        <p data-testid="filter-empty">No hay préstamos {{ labels[filter()].toLowerCase() }}.</p>
      } @else {
        <ul class="cards">
          @for (loan of visible(); track loan.id) {
            <li><cc-loan-card [loan]="loan" [style.--i]="staggerStep($index)" /></li>
          }
        </ul>
      }
    }
  `,
  styles: `
    :host {
      display: block;
      padding: 1rem;
      color: var(--cc-color-ink);
    }
    h1 {
      font-family: var(--cc-font-heading);
      font-weight: 800;
    }
    .status,
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.25rem 1.5rem;
    }
    .status p {
      margin: 0.25rem 0;
    }
    .reminder {
      padding: 0.25rem 0.75rem;
      border-left: 4px solid var(--cc-color-warning);
      background: var(--cc-color-surface);
    }
    .totals {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem 3rem;
      margin: 1rem 0;
    }
    .total {
      padding: 1rem 1.25rem;
      border-radius: var(--cc-radius-block);
      border: 1px solid var(--cc-color-rule);
      background: var(--cc-color-surface);
    }
    .total h2 {
      margin: 0;
      font-size: 1rem;
      font-weight: 800;
      color: var(--cc-color-ink-muted);
    }
    .total p {
      margin: 0.125rem 0;
    }
    .num {
      font-family: var(--cc-font-numeric);
      font-variant-numeric: tabular-nums;
    }
    .total > .num:first-of-type {
      font-size: 1.5rem;
    }
    .muted {
      color: var(--cc-color-ink-muted);
    }
    .toolbar {
      margin-bottom: 1rem;
    }
    select {
      padding: 0.375rem 0.5rem;
      border: 1px solid var(--cc-color-control-border);
      border-radius: 0.25rem;
      color: var(--cc-color-ink);
      background: var(--cc-color-surface);
      font: inherit;
    }
    .cards {
      display: grid;
      gap: 1rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .action {
      display: inline-block;
      padding: 0.5rem 1rem;
      border: 1px solid var(--cc-color-control-border);
      border-radius: 0.25rem;
      color: var(--cc-color-ink);
      background: var(--cc-color-surface);
      text-decoration: none;
    }
    .action.primary {
      border-color: var(--cc-color-ink);
      font-weight: bold;
    }
    a:focus-visible,
    select:focus-visible {
      outline: 2px solid var(--cc-color-ink);
      outline-offset: 2px;
    }
    .status a,
    .muted a {
      color: var(--cc-color-ink);
      text-decoration: underline;
    }
  `,
  host: { 'data-testid': 'page-dashboard' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPageComponent {
  protected readonly store = inject(LOANS_STORE);
  protected readonly backup = inject(BACKUP_SERVICE);
  protected readonly sync = inject(SYNC_SERVICE);
  private readonly projections = inject(LOAN_PROJECTION_SERVICE);

  protected readonly filters = DASHBOARD_FILTERS;
  protected readonly labels = FILTER_LABELS;
  /** Paid and archived loans stay hidden until the user asks for them (R28). */
  protected readonly filter = signal<DashboardFilter>('active');

  protected readonly visible = computed(() => filterLoans(this.store.loans(), this.filter()));
  protected readonly lastBackup = computed(() => backupDateText(this.backup.lastBackupAt()));
  /** GTQ first, then USD; a currency without active loans keeps its row with a dash (R27). */
  protected readonly totalRows = computed(() => {
    const totals = this.projections.totalsByCurrency();
    return CURRENCY_ROWS.map((row) => ({
      ...row,
      totals: totals.find((entry): entry is CurrencyTotals => entry.currency === row.currency) ?? null,
    }));
  });

  /** Entrance step of a card: 60 ms each in CSS, at most 8 steps. */
  protected staggerStep(index: number): number {
    return Math.min(index, MAX_STAGGER_STEP);
  }

  protected setFilter(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const next = DASHBOARD_FILTERS.find((option) => option === value);
    if (next !== undefined) this.filter.set(next);
  }
}
