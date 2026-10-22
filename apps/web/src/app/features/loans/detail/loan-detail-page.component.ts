import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { LoanStatus, Uuid } from '@cuotascasa/schema';
import { LOAN_PROJECTION_SERVICE, LOANS_STORE } from '../../../data/tokens.ts';
import { Announcer } from '../../../ui/feedback/announcer.service.ts';
import { ConfirmDialogComponent } from '../../../ui/feedback/confirm-dialog.component.ts';
import { StatusChipComponent } from '../../../ui/feedback/status-chip.component.ts';
import { LocalDatePipe } from '../../../ui/format/local-date.pipe.ts';
import { MoneyPipe } from '../../../ui/format/money.pipe.ts';
import { RatePipe } from '../../../ui/format/rate.pipe.ts';
import { HouseMeterComponent } from '../../../ui/house-meter/house-meter.component.ts';
import { RATE_TYPE_OPTIONS } from '../wizard/wizard-model.ts';
import { WIZARD_STYLES } from '../wizard/wizard-styles.ts';
import { DeleteLoanDialogComponent } from './delete-loan-dialog.component.ts';
import {
  describeActionError,
  describeProjectionError,
  insuranceLines,
  paymentDayLabel,
  STATUS_LABELS,
  templateLabel,
} from './loan-detail-model.ts';
import { LoanEditFormComponent } from './loan-edit-form.component.ts';

/**
 * WIZARD_STYLES scopes the control rules to the wizard host, so the detail host repeats them for the reused step
 * components (the `.cc-wiz-*` classes come with WIZARD_STYLES itself). Design tokens only (ADR-0012 §5).
 */
const DETAIL_STYLES = `
  cc-loan-detail-page {
    display: block;
    max-width: 56rem;
    margin: 0 auto;
    padding: 1rem;
    color: var(--cc-color-ink);
    font-family: var(--cc-font-body);
  }
  cc-loan-detail-page h1,
  cc-loan-detail-page h2 {
    font-family: var(--cc-font-heading);
  }
  cc-loan-detail-page input,
  cc-loan-detail-page select {
    min-height: 2.5rem;
    padding: 0.375rem 0.5rem;
    border: 1px solid var(--cc-color-control-border);
    border-radius: 0.375rem;
    background: var(--cc-color-surface);
    color: var(--cc-color-ink);
    font: inherit;
  }
  cc-loan-detail-page input[aria-invalid='true'],
  cc-loan-detail-page select[aria-invalid='true'] {
    border-color: var(--cc-color-danger);
  }
  cc-loan-detail-page :focus-visible,
  cc-loan-detail-page h2:focus {
    outline: 2px solid var(--cc-color-accent);
    outline-offset: 2px;
  }
  cc-loan-detail-page button {
    min-height: 2.5rem;
    padding: 0.375rem 1rem;
    border: 1px solid var(--cc-color-control-border);
    border-radius: 0.375rem;
    background: var(--cc-color-surface);
    color: var(--cc-color-ink);
    font: inherit;
    cursor: pointer;
  }
  cc-loan-detail-page button.cc-wiz-primary {
    border-color: var(--cc-color-accent);
    background: var(--cc-color-accent);
    color: var(--cc-color-paper);
  }
  cc-loan-detail-page button:disabled {
    cursor: progress;
    opacity: 0.6;
  }
  cc-loan-detail-page button.cc-wiz-link {
    border-color: transparent;
    background: transparent;
    color: var(--cc-color-accent);
    text-decoration: underline;
  }
  cc-loan-detail-page button.cc-wiz-secondary {
    border-style: dashed;
  }
  cc-loan-detail-page .cc-det-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.5rem 1rem;
    padding: 1.25rem;
    border: 1px solid var(--cc-color-rule);
    border-radius: var(--cc-radius-block);
    background: var(--cc-color-surface);
  }
  cc-loan-detail-page .cc-det-meter {
    flex-basis: 100%;
  }
  cc-loan-detail-page h1 {
    font-weight: 800;
  }
  cc-loan-detail-page h1:focus {
    outline: 2px solid var(--cc-color-accent);
    outline-offset: 2px;
  }
  cc-loan-detail-page .cc-det-bank {
    font-weight: normal;
    color: var(--cc-color-ink-muted);
  }
  cc-loan-detail-page .cc-det-status {
    padding: 0.125rem 0.625rem;
    border: 1px solid var(--cc-color-control-border);
    border-radius: 999px;
    font-size: 0.875rem;
  }
  cc-loan-detail-page .cc-det-back,
  cc-loan-detail-page .cc-det-links a {
    color: var(--cc-color-ink);
    text-decoration: underline;
  }
  cc-loan-detail-page .cc-det-links {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    margin: 1rem 0;
    padding-top: 0.5rem;
    border-top: 1px solid var(--cc-color-rule);
  }
  cc-loan-detail-page .cc-det-section {
    margin: 1.5rem 0;
  }
  cc-loan-detail-page .cc-det-section h2 {
    font-size: 1.125rem;
  }
  cc-loan-detail-page .cc-det-summary {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1rem 2rem;
  }
  cc-loan-detail-page .cc-det-grid {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.25rem 1.5rem;
    margin: 0;
  }
  cc-loan-detail-page .cc-det-grid dt {
    color: var(--cc-color-ink-muted);
  }
  cc-loan-detail-page .cc-det-grid dd {
    margin: 0;
  }
  cc-loan-detail-page .cc-det-grid ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  cc-loan-detail-page .cc-det-num {
    font-family: var(--cc-font-numeric);
    font-variant-numeric: tabular-nums;
  }
  cc-loan-detail-page table {
    border-collapse: collapse;
    width: 100%;
  }
  cc-loan-detail-page th,
  cc-loan-detail-page td {
    padding: 0.375rem 0.5rem;
    border-bottom: 1px solid var(--cc-color-rule);
    text-align: left;
  }
  cc-loan-detail-page td.cc-det-num {
    text-align: right;
  }
  cc-loan-detail-page .cc-det-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  cc-loan-detail-page button.cc-det-danger {
    border-color: var(--cc-color-danger);
    color: var(--cc-color-danger);
  }
  cc-loan-detail-page .cc-det-hint {
    margin: 1rem 0;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--cc-color-warning);
    border-left-width: 4px;
    border-radius: 0.375rem;
    background: var(--cc-color-surface);
  }
`;

const RATE_TYPE_LABELS: Readonly<Record<string, string>> = Object.fromEntries(
  RATE_TYPE_OPTIONS.map((option) => [option.value, option.label]),
);

type Pending = 'paid' | 'delete' | null;

/**
 * /app/prestamos/:id (HU-08, R5, R14, R28): terms and template origin, original-vs-real metrics, status, and the
 * actions that change the loan: edit conditions (the wizard's step components), mark as paid, archive or unarchive,
 * and delete. Every figure comes from LoanProjectionService; this page only shows it. Destructive actions ask for
 * confirmation, results are announced politely and focus returns to the heading.
 */
@Component({
  selector: 'cc-loan-detail-page',
  imports: [
    RouterLink,
    ConfirmDialogComponent,
    DeleteLoanDialogComponent,
    HouseMeterComponent,
    LoanEditFormComponent,
    LocalDatePipe,
    MoneyPipe,
    RatePipe,
    StatusChipComponent,
  ],
  template: `
    <p><a class="cc-det-back" routerLink="/app">← Mis préstamos</a></p>
    <div class="cc-det-head" [style.view-transition-name]="transitionName()">
      <h1 #title tabindex="-1">
        {{ loan()?.name ?? 'Préstamo' }}
        @if (loan()?.bank) {
          <span class="cc-det-bank"> · {{ loan()?.bank }}</span>
        }
      </h1>
      @if (loan(); as l) {
        <span class="cc-det-status" data-testid="loan-status">{{ statusLabel() }}</span>
        @if (projection().percentPaid(); as percent) {
          <cc-house-meter class="cc-det-meter" [percent]="percent" label="capital pagado" />
        }
      }
    </div>

    @if (!store.ready()) {
      <p role="status" data-testid="loading">Cargando el préstamo…</p>
    } @else if (loan(); as l) {
      @let p = projection();
      @let currency = l.currency;

      @if (actionError(); as message) {
        <p class="cc-wiz-issue" role="alert" data-testid="action-error">{{ message }}</p>
      }

      @if (l.status === 'active' && p.suggestedPaid()) {
        <p class="cc-det-hint" data-testid="suggested-paid">
          Este préstamo parece pagado. Si ya lo terminaste de pagar, márcalo como pagado; tú decides el estado.
        </p>
      }

      <section class="cc-det-section" aria-labelledby="det-summary">
        <h2 id="det-summary">Resumen</h2>
        @if (p.error(); as error) {
          <p class="cc-wiz-issue" role="status" data-testid="projection-error">{{ projectionError(error) }}</p>
        } @else {
          <div class="cc-det-summary">
            <dl class="cc-det-grid">
              @if (p.balance(); as balance) {
                <dt>Saldo</dt>
                <dd class="cc-det-num" data-testid="summary-balance">{{ balance | money: currency }}</dd>
              }
              @if (p.nextInstallmentTotal(); as next) {
                <dt>Próxima cuota</dt>
                <dd data-testid="summary-next">
                  <span class="cc-det-num">{{ next | money: currency }}</span>
                  @if (p.currentInstallment(); as installment) {
                    <span> vence {{ installment.dueDate | localDate }}</span>
                  }
                </dd>
              }
              @if (p.realEndDate(); as end) {
                <dt>Fin estimado</dt>
                <dd class="cc-det-num" data-testid="summary-end">{{ end | localDate }}</dd>
              }
              <dt>Validación</dt>
              <dd><cc-status-chip [status]="p.validation().status" /></dd>
            </dl>
          </div>
        }
      </section>

      @if (p.metrics(); as metrics) {
        @let m = metrics.realVsOriginal;
        <section class="cc-det-section" aria-labelledby="det-metrics">
          <h2 id="det-metrics">Plan original frente a lo real</h2>
          <table data-testid="metrics">
            <caption class="cc-wiz-hint">
              El camino real incluye tus eventos reales; sin datos reales es igual al plan original.
            </caption>
            <thead>
              <tr>
                <th scope="col">Cifra</th>
                <th scope="col">Plan original</th>
                <th scope="col">Camino real</th>
              </tr>
            </thead>
            <tbody>
              <tr data-testid="metric-end">
                <th scope="row">Fecha de fin</th>
                <td class="cc-det-num">{{ m.baseEndDate | localDate }}</td>
                <td class="cc-det-num">{{ m.endDate | localDate }}</td>
              </tr>
              <tr data-testid="metric-total">
                <th scope="row">Total pagado</th>
                <td class="cc-det-num">{{ m.baseTotalPaid | money: currency }}</td>
                <td class="cc-det-num">{{ m.totalPaid | money: currency }}</td>
              </tr>
            </tbody>
          </table>
          <dl class="cc-det-grid">
            <dt>Cuotas ahorradas</dt>
            <dd class="cc-det-num" data-testid="metric-months">{{ m.monthsSaved }}</dd>
            <dt>Intereses y seguros ahorrados</dt>
            <dd class="cc-det-num" data-testid="metric-interest">{{ m.interestSaved | money: currency }}</dd>
            <dt>Ahorro neto</dt>
            <dd class="cc-det-num" data-testid="metric-net">{{ m.netSaving | money: currency }}</dd>
          </dl>
          @if (hasNegative(m)) {
            <p class="cc-wiz-hint" data-testid="negative-note">
              Un valor negativo significa que, con tus datos reales, pagas más que en el plan original. Un abono no
              siempre reduce el interés.
            </p>
          }
        </section>
      }

      @if (editing()) {
        <cc-loan-edit-form
          [loan]="l"
          [currencyLocked]="currencyLocked()"
          (saved)="closeEdit()"
          (cancelled)="closeEdit()"
        />
      } @else {
        <section class="cc-det-section" aria-labelledby="det-terms" data-testid="terms">
          <h2 id="det-terms">Condiciones</h2>
          <dl class="cc-det-grid">
            <dt>Plantilla de origen</dt>
            <dd data-testid="term-template">{{ template() }}</dd>
            <dt>Monto del préstamo</dt>
            <dd class="cc-det-num" data-testid="term-principal">{{ l.principal | money: currency }}</dd>
            <dt>Plazo</dt>
            <dd data-testid="term-months">{{ l.termMonths }} meses</dd>
            <dt>Tasa de interés original</dt>
            <dd class="cc-det-num" data-testid="term-rate">{{ l.interestRate | rate }}</dd>
            <dt>Tipo de tasa</dt>
            <dd data-testid="term-rate-type">{{ rateTypeLabel() }}</dd>
            <dt>Día de pago</dt>
            <dd data-testid="term-payment-day">{{ paymentDay() }}</dd>
            <dt>Primera cuota</dt>
            <dd class="cc-det-num" data-testid="term-first-due">{{ l.firstDueDate | localDate }}</dd>
            <dt>Desembolso</dt>
            <dd class="cc-det-num" data-testid="term-disbursement">{{ l.disbursementDate | localDate }}</dd>
            <dt>Seguros</dt>
            <dd data-testid="term-insurance">
              <ul>
                @for (line of insurance(); track $index) {
                  <li>
                    {{ line.label }}: <span class="cc-det-num">{{ line.rate | rate }}</span>
                  </li>
                } @empty {
                  <li>Sin seguros porcentuales</li>
                }
              </ul>
            </dd>
            <dt>Cargos fijos</dt>
            <dd data-testid="term-fixed">
              <ul>
                @for (charge of l.fixedCharges; track $index) {
                  <li>
                    {{ charge.label }}: <span class="cc-det-num">{{ charge.amount | money: currency }}</span>
                  </li>
                } @empty {
                  <li>Sin cargos fijos</li>
                }
              </ul>
            </dd>
            <dt>Perfil de redondeo</dt>
            <dd data-testid="term-rounding">{{ l.roundingProfile }}</dd>
            <dt>Moneda</dt>
            <dd>{{ l.currency }}</dd>
          </dl>
        </section>
      }

      <nav class="cc-det-links" aria-label="Pantallas de este préstamo">
        <a [routerLink]="base() + '/tabla'">Tabla de amortización</a>
        <a [routerLink]="base() + '/datos-reales'">Datos reales</a>
        <a [routerLink]="base() + '/proyecciones'">Proyecciones</a>
      </nav>

      <section class="cc-det-section" aria-labelledby="det-actions">
        <h2 id="det-actions">Acciones</h2>
        <div class="cc-det-actions">
          @if (!editing()) {
            <button type="button" data-testid="action-edit" (click)="openEdit()">Editar condiciones</button>
          }
          @if (l.status === 'active') {
            <button type="button" data-testid="action-paid" [disabled]="busy()" (click)="pending.set('paid')">
              Marcar como pagado
            </button>
          }
          @if (l.status === 'paid') {
            <button type="button" data-testid="action-reactivate" [disabled]="busy()" (click)="reactivate()">
              Volver a activo
            </button>
          }
          @if (l.status === 'archived') {
            <button type="button" data-testid="action-unarchive" [disabled]="busy()" (click)="unarchive()">
              Desarchivar
            </button>
          } @else if (l.status === 'active') {
            <button type="button" data-testid="action-archive" [disabled]="busy()" (click)="archive()">Archivar</button>
          }
          <button type="button" class="cc-det-danger" data-testid="action-delete" (click)="pending.set('delete')">
            Eliminar
          </button>
        </div>
      </section>

      <cc-confirm-dialog
        [open]="pending() === 'paid'"
        heading="Marcar como pagado"
        [message]="
          'Vas a marcar «' +
          l.name +
          '» como pagado. Dejará de sumar en los totales del panel y se ocultará de la lista de activos. Podrás volver a activarlo.'
        "
        confirmLabel="Sí, marcar como pagado"
        (confirmed)="markPaid()"
        (cancelled)="pending.set(null)"
      />
      <cc-delete-loan-dialog
        [open]="pending() === 'delete'"
        [alias]="l.name"
        [busy]="busy()"
        (confirmed)="remove()"
        (cancelled)="pending.set(null)"
      />
    } @else if (!leaving()) {
      <p data-testid="not-found">
        No se encontró este préstamo. Puede que lo hayas eliminado. <a routerLink="/app">Volver a Mis préstamos</a>
      </p>
    }
  `,
  styles: [WIZARD_STYLES, DETAIL_STYLES],
  encapsulation: ViewEncapsulation.None,
  host: { 'data-testid': 'page-loan-detail' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoanDetailPageComponent {
  protected readonly store = inject(LOANS_STORE);
  private readonly service = inject(LOAN_PROJECTION_SERVICE);
  private readonly announcer = inject(Announcer);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  /** Route parameter :id (withComponentInputBinding). */
  readonly id = input.required<Uuid>();

  /** Same name as the dashboard card of this loan, so the router's view transition morphs one into the other. */
  protected readonly transitionName = computed(() => `cc-loan-${this.id()}`);
  protected readonly loan = computed(() => this.store.loan(this.id())());
  protected readonly projection = computed(() => this.service.forLoan(this.id()));
  protected readonly currencyLocked = computed(() => this.store.isCurrencyLocked(this.id())());
  protected readonly base = computed(() => `/app/prestamos/${this.id()}`);

  protected readonly editing = signal(false);
  protected readonly pending = signal<Pending>(null);
  protected readonly busy = signal(false);
  protected readonly leaving = signal(false);
  protected readonly actionError = signal<string | null>(null);

  protected readonly projectionError = describeProjectionError;
  protected readonly statusLabel = computed(() => {
    const status = this.loan()?.status;
    return status === undefined ? '' : STATUS_LABELS[status];
  });
  protected readonly template = computed(() => {
    const loan = this.loan();
    return loan === undefined ? '' : templateLabel(loan.templateRef);
  });
  protected readonly rateTypeLabel = computed(() => RATE_TYPE_LABELS[this.loan()?.rateType ?? ''] ?? '');
  protected readonly paymentDay = computed(() => {
    const loan = this.loan();
    return loan === undefined ? '' : paymentDayLabel(loan.paymentDay);
  });
  protected readonly insurance = computed(() => {
    const loan = this.loan();
    return loan === undefined ? [] : insuranceLines(loan);
  });

  private readonly title = viewChild.required<ElementRef<HTMLHeadingElement>>('title');

  /** [ALG.METRICS] A saving can be negative: the real path may cost more than the original plan. */
  protected hasNegative(metrics: {
    readonly monthsSaved: number;
    readonly interestSaved: string;
    readonly netSaving: string;
  }): boolean {
    return metrics.monthsSaved < 0 || metrics.interestSaved.startsWith('-') || metrics.netSaving.startsWith('-');
  }

  protected openEdit(): void {
    this.actionError.set(null);
    this.editing.set(true);
  }

  protected closeEdit(): void {
    this.editing.set(false);
    this.focusTitle();
  }

  protected markPaid(): void {
    this.pending.set(null);
    void this.changeStatus('paid', (name) => `«${name}» marcado como pagado.`);
  }

  protected reactivate(): void {
    void this.changeStatus('active', (name) => `«${name}» vuelve a estar activo.`);
  }

  protected archive(): void {
    void this.changeStatus(
      'archived',
      (name) => `«${name}» archivado. Ya no aparece entre los Activos; búscalo en el filtro Archivados.`,
    );
  }

  protected unarchive(): void {
    void this.changeStatus('active', (name) => `«${name}» desarchivado. Vuelve a aparecer entre los Activos.`);
  }

  protected async remove(): Promise<void> {
    const loan = this.loan();
    if (loan === undefined || this.busy()) return;
    this.busy.set(true);
    this.actionError.set(null);
    try {
      await this.store.delete(loan.id);
      this.leaving.set(true);
      this.pending.set(null);
      void this.announcer.polite(`«${loan.name}» eliminado.`);
      await this.router.navigate(['/app']);
    } catch (error) {
      this.pending.set(null);
      this.actionError.set(describeActionError(error));
    } finally {
      this.busy.set(false);
    }
  }

  private async changeStatus(status: LoanStatus, message: (name: string) => string): Promise<void> {
    const loan = this.loan();
    if (loan === undefined || this.busy()) return;
    this.busy.set(true);
    this.actionError.set(null);
    try {
      await this.store.setStatus(loan.id, status);
      void this.announcer.polite(message(loan.name));
      this.focusTitle();
    } catch (error) {
      this.actionError.set(describeActionError(error));
    } finally {
      this.busy.set(false);
    }
  }

  /** The clicked button may have disappeared (its label changes with the status): focus goes to the heading. */
  private focusTitle(): void {
    afterNextRender(() => this.title().nativeElement.focus(), { injector: this.injector });
  }
}
