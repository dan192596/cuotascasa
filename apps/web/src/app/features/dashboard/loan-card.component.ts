import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LOAN_PROJECTION_SERVICE } from '../../data/tokens.ts';
import { StatusChipComponent } from '../../ui/feedback/status-chip.component.ts';
import { LocalDatePipe } from '../../ui/format/local-date.pipe.ts';
import { MoneyPipe } from '../../ui/format/money.pipe.ts';
import { HouseMeterComponent } from '../../ui/house-meter/house-meter.component.ts';
import { type DashboardLoan, errorMessage, STATUS_LABELS } from './dashboard-model.ts';

/** One loan of the dashboard (HU-06, spec §9 «Valores derivados»): every figure comes from LoanProjectionService. */
@Component({
  selector: 'cc-loan-card',
  imports: [RouterLink, HouseMeterComponent, StatusChipComponent, MoneyPipe, LocalDatePipe],
  template: `
    @let p = projection();
    @let currency = loan().currency;
    <article
      class="card"
      [class.enter]="enter"
      data-testid="loan-card"
      [attr.aria-labelledby]="titleId()"
      [style.view-transition-name]="transitionName()"
    >
      <header>
        <h2 [id]="titleId()">
          <a [routerLink]="base()">{{ loan().name }}</a>
          @if (loan().bank) {
            <span class="bank"> · {{ loan().bank }}</span>
          }
        </h2>
        <span class="status" data-testid="card-status">{{ statusLabel() }}</span>
      </header>
      @if (p.error(); as error) {
        <p class="error" role="status" data-testid="card-error">{{ message(error) }}</p>
      } @else {
        <div class="body">
          @if (p.percentPaid(); as percent) {
            <cc-house-meter [percent]="percent" label="capital pagado" />
          }
          <dl>
            @if (p.balance(); as balance) {
              <dt>Saldo</dt>
              <dd class="num" data-testid="card-balance">{{ balance | money: currency }}</dd>
            }
            @if (p.nextInstallmentTotal(); as next) {
              <dt>Próxima cuota</dt>
              <dd data-testid="card-next">
                <span class="num">{{ next | money: currency }}</span>
                @if (p.currentInstallment(); as installment) {
                  <span class="muted" data-testid="card-due"> vence {{ installment.dueDate | localDate }}</span>
                }
              </dd>
            }
            @if (p.realEndDate(); as end) {
              <dt>Fin estimado</dt>
              <dd class="num" data-testid="card-end">{{ end | localDate }}</dd>
            }
            @if (p.activeScenarioEndDate(); as scenarioEnd) {
              <dt>Fin con el escenario activo</dt>
              <dd class="num" data-testid="card-scenario-end">{{ scenarioEnd | localDate }}</dd>
            }
            <dt>Validación</dt>
            <dd data-testid="card-validation"><cc-status-chip [status]="p.validation().status" /></dd>
          </dl>
        </div>
        @if (loan().status === 'active' && p.suggestedPaid()) {
          <p class="hint" data-testid="card-suggested-paid">
            Este préstamo parece pagado. Puedes marcarlo como pagado en su detalle.
          </p>
        }
      }
      <nav class="links" aria-label="Accesos del préstamo">
        <a [routerLink]="base() + '/tabla'">Tabla</a>
        <a [routerLink]="base() + '/datos-reales'">Datos reales</a>
        <a [routerLink]="base() + '/proyecciones'">Proyecciones</a>
      </nav>
    </article>
  `,
  styles: `
    :host {
      display: block;
    }
    .card {
      padding: 1.25rem;
      border: 1px solid var(--cc-color-rule);
      border-radius: var(--cc-radius-block);
      background: var(--cc-color-surface);
      color: var(--cc-color-ink);
    }
    @media (prefers-reduced-motion: no-preference) {
      .card.enter {
        animation: card-in var(--cc-duration-slow) var(--cc-ease-out) backwards;
        animation-delay: calc(var(--i, 0) * 60ms);
      }
      @keyframes card-in {
        from {
          /* Transform only: text keeps full contrast (and stays readable for axe) while the card settles. */
          transform: translateY(12px);
        }
      }
    }
    header {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: baseline;
      gap: 0.5rem;
    }
    h2 {
      margin: 0;
      font-family: var(--cc-font-heading);
      font-size: 1.25rem;
      font-weight: 800;
    }
    h2 a,
    .links a {
      color: var(--cc-color-ink);
      text-decoration: underline;
    }
    a:focus-visible {
      outline: 2px solid var(--cc-color-ink);
      outline-offset: 2px;
    }
    .bank,
    .muted {
      font-weight: normal;
      color: var(--cc-color-ink-muted);
    }
    .status {
      padding: 0.125rem 0.625rem;
      border: 1px solid var(--cc-color-control-border);
      border-radius: 999px;
      font-size: 0.875rem;
    }
    .body {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 1.5rem;
      margin-top: 0.75rem;
    }
    dl {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.25rem 1rem;
      margin: 0;
    }
    dt {
      color: var(--cc-color-ink-muted);
    }
    dd {
      margin: 0;
    }
    .num {
      font-family: var(--cc-font-numeric);
      font-variant-numeric: tabular-nums;
    }
    .error,
    .hint {
      margin: 0.75rem 0 0;
    }
    .error {
      color: var(--cc-color-danger);
    }
    .links {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      margin-top: 0.75rem;
      padding-top: 0.5rem;
      border-top: 1px solid var(--cc-color-rule);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoanCardComponent {
  private readonly service = inject(LOAN_PROJECTION_SERVICE);

  readonly loan = input.required<DashboardLoan>();

  /**
   * The card is the shared view-transition target: when it is created inside a route transition (the root carries
   * `cc-view-transition`, set in app.config.ts) its entrance would fight the morph, so it starts in place. Read once, so
   * the entrance never replays when the class leaves the root.
   */
  protected readonly enter = !inject(DOCUMENT).documentElement.classList.contains('cc-view-transition');

  protected readonly projection = computed(() => this.service.forLoan(this.loan().id));
  protected readonly base = computed(() => `/app/prestamos/${this.loan().id}`);
  /** Same name as the detail header, so the router's view transition morphs the card into it. */
  protected readonly transitionName = computed(() => `cc-loan-${this.loan().id}`);
  protected readonly titleId = computed(() => `cc-loan-title-${this.loan().id}`);
  protected readonly statusLabel = computed(() => STATUS_LABELS[this.loan().status]);
  protected readonly message = errorMessage;
}
