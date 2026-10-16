import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { form, FormField, validate } from '@angular/forms/signals';
import {
  compareMoney,
  moneyIsNegative,
  moneyIsZero,
  parseMoney,
  parseRate,
  type PrepaymentMode,
} from '@cuotascasa/domain';
import { formatLocalDate, formatMoney } from '../../ui/format/format.ts';
import { MoneyInputComponent } from '../../ui/money-input/money-input.component.ts';
import { RateInputComponent } from '../../ui/money-input/rate-input.component.ts';
import { INSURANCE_LEGEND } from './simulator-legend.ts';
import { PUBLIC_CLOCK } from '../public-clock.ts';
import { type SimulationPrepayment, type SimulationResult, simulate } from './quick-simulation.ts';
import {
  describeSimulationError,
  DISCLAIMER,
  installmentRangeMessage,
  SIMULATOR_MESSAGES,
} from './simulator-messages.ts';

interface SimulatorModel {
  principal: string;
  /** Annual rate as a fraction string (the RateInput converts the typed percent). */
  rate: string;
  years: string;
  withPrepayment: boolean;
  prepayAmount: string;
  prepayInstallment: string;
  prepayMode: PrepaymentMode;
}

type Outcome =
  | { readonly kind: 'idle' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ok'; readonly result: SimulationResult };

const MAX_MONEY = '999999999999.99';
const DIGITS = /^\d+$/;
/** A fraction between 0 and 1 inclusive. */
const RATE_FRACTION = /^(?:0(?:\.\d+)?|1(?:\.0+)?)$/;
const ANNOUNCE_DELAY_MS = 600;
const MAX_YEARS = 30;

/** Interactive part of the quick simulator (spec §9 «Simulador»), loaded lazily by the host with a dynamic `import()`: domain only. */
@Component({
  selector: 'cc-quick-simulator-form',
  imports: [FormField, MoneyInputComponent, RateInputComponent],
  template: `
    <section class="sim" aria-labelledby="sim-title" data-testid="sim-form">
      <h2 id="sim-title" class="title">Simulador rápido</h2>
      <p class="template">Plantilla: FHA Guatemala v1 · Quetzales</p>
      <form
        novalidate
        (submit)="$event.preventDefault()"
        (input)="scheduleAnnouncement()"
        (change)="scheduleAnnouncement()"
      >
        <div class="field">
          <label for="sim-principal">Monto del préstamo (Q)</label>
          <cc-money-input
            inputId="sim-principal"
            currency="GTQ"
            placeholder="500,000.00"
            [formField]="form.principal"
          />
        </div>

        <div class="field">
          <label for="sim-rate">Tasa de interés anual</label>
          <div class="row">
            <cc-rate-input inputId="sim-rate" placeholder="7.00" [formField]="form.rate" />
            <span class="legend" data-testid="sim-rate-legend">{{ insuranceLegend }}</span>
          </div>
        </div>

        <div class="field">
          <label for="sim-years">Plazo en años</label>
          <div class="row">
            <input
              id="sim-years"
              type="text"
              inputmode="numeric"
              autocomplete="off"
              placeholder="20"
              [formField]="form.years"
              [attr.aria-invalid]="shows('years')"
              [attr.aria-describedby]="shows('years') ? 'sim-years-errors' : null"
            />
            <span class="legend">años (1 a 30)</span>
          </div>
          @if (shows('years')) {
            <ul id="sim-years-errors" class="errors">
              <li>{{ form.years().errors()[0]?.message }}</li>
            </ul>
          }
        </div>

        <div class="field toggle">
          <input id="sim-prepay-toggle" type="checkbox" [formField]="form.withPrepayment" />
          <label for="sim-prepay-toggle">Probar un abono a capital</label>
        </div>

        @if (model().withPrepayment) {
          <div class="prepay" data-testid="sim-prepay-fields">
            <div class="field">
              <label for="sim-prepay-amount">Monto del abono (Q)</label>
              <cc-money-input
                inputId="sim-prepay-amount"
                currency="GTQ"
                placeholder="20,000.00"
                [formField]="form.prepayAmount"
              />
            </div>
            <div class="field">
              <label for="sim-prepay-k">Después de la cuota número</label>
              <input
                id="sim-prepay-k"
                type="text"
                inputmode="numeric"
                autocomplete="off"
                placeholder="12"
                [formField]="form.prepayInstallment"
                [attr.aria-invalid]="shows('prepayInstallment')"
                [attr.aria-describedby]="shows('prepayInstallment') ? 'sim-prepay-k-errors' : null"
              />
              @if (shows('prepayInstallment')) {
                <ul id="sim-prepay-k-errors" class="errors">
                  <li>{{ form.prepayInstallment().errors()[0]?.message }}</li>
                </ul>
              }
            </div>
            <fieldset class="modes">
              <legend>Efecto del abono</legend>
              <label class="mode" for="sim-mode-term">
                <input id="sim-mode-term" type="radio" value="REDUCE_TERM" [formField]="form.prepayMode" />
                Reducir plazo
              </label>
              <label class="mode" for="sim-mode-installment">
                <input
                  id="sim-mode-installment"
                  type="radio"
                  value="REDUCE_INSTALLMENT"
                  [formField]="form.prepayMode"
                />
                Reducir cuota
              </label>
            </fieldset>
          </div>
        }
      </form>

      @let current = outcome();
      @if (current.kind === 'error') {
        <p class="errors" data-testid="sim-error">{{ current.message }}</p>
      }
      @if (current.kind === 'ok') {
        <div class="results" data-testid="sim-results">
          <h3 class="results-title">Resultados</h3>
          <dl>
            <div class="stat primary">
              <dt>Cuota nivelada</dt>
              <dd data-testid="sim-level">{{ money(current.result.level) }}</dd>
            </div>
            <div class="stat">
              <dt>Cuota 1: interés</dt>
              <dd data-testid="sim-first-interest">{{ money(current.result.firstInstallment.interest) }}</dd>
            </div>
            <div class="stat">
              <dt>Cuota 1: seguros FHA</dt>
              <dd data-testid="sim-first-insurance">{{ money(current.result.firstInstallment.insurance) }}</dd>
            </div>
            <div class="stat">
              <dt>Cuota 1: capital</dt>
              <dd data-testid="sim-first-capital">{{ money(current.result.firstInstallment.capital) }}</dd>
            </div>
            <div class="stat">
              <dt>Intereses y seguros totales</dt>
              <dd data-testid="sim-total">{{ money(current.result.totalInterestAndInsurance) }}</dd>
            </div>
            <div class="stat">
              <dt>Número de cuotas</dt>
              <dd data-testid="sim-count">{{ current.result.installmentCount }}</dd>
            </div>
            <div class="stat">
              <dt>Fecha de fin</dt>
              <dd data-testid="sim-end">{{ date(current.result.endDate) }}</dd>
            </div>
          </dl>
          @if (current.result.prepayment; as prepayment) {
            <h3 class="results-title">Con el abono</h3>
            <dl>
              <div class="stat primary">
                <dt>Intereses y seguros ahorrados</dt>
                <dd data-testid="sim-saved">{{ money(prepayment.interestSaved) }}</dd>
              </div>
              <div class="stat">
                <dt>Meses ahorrados</dt>
                <dd data-testid="sim-months-saved">{{ prepayment.monthsSaved }}</dd>
              </div>
              <div class="stat">
                <dt>Nuevo número de cuotas</dt>
                <dd data-testid="sim-new-count">{{ prepayment.installmentCount }}</dd>
              </div>
              <div class="stat">
                <dt>Nueva fecha de fin</dt>
                <dd data-testid="sim-new-end">{{ date(prepayment.endDate) }}</dd>
              </div>
              @if (prepayment.newLevel; as newLevel) {
                <div class="stat">
                  <dt>Nueva cuota nivelada</dt>
                  <dd data-testid="sim-new-level">{{ money(newLevel) }}</dd>
                </div>
              }
            </dl>
          }
          <p class="disclaimer" data-testid="sim-disclaimer">{{ disclaimer }}</p>
        </div>
      }
      <p class="visually-hidden" aria-live="polite" data-testid="sim-announcement">{{ announcement() }}</p>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .sim {
      background: var(--cc-color-surface);
      border: 1px solid var(--cc-color-rule);
      border-radius: 0.5rem;
      padding: 1.25rem;
      color: var(--cc-color-ink);
      font-family: var(--cc-font-body);
    }
    .title {
      margin: 0;
      font-family: var(--cc-font-heading);
      font-size: 1.375rem;
    }
    .template {
      margin: 0.25rem 0 1rem;
      color: var(--cc-color-ink-muted);
      font-size: 0.875rem;
    }
    .field {
      margin-bottom: 0.875rem;
    }
    label,
    legend {
      display: block;
      margin-bottom: 0.25rem;
      font-size: 0.9375rem;
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem 0.75rem;
    }
    .legend {
      color: var(--cc-color-ink-muted);
      font-size: 0.875rem;
    }
    input[type='text'] {
      min-height: 2.5rem;
      padding: 0 0.5rem;
      border: 1px solid var(--cc-color-control-border);
      border-radius: 0.25rem;
      background: var(--cc-color-paper);
      color: var(--cc-color-ink);
      font-family: var(--cc-font-numeric);
      font-size: 1rem;
    }
    input:focus-visible {
      outline: 2px solid var(--cc-color-accent);
      outline-offset: 2px;
    }
    .toggle {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .toggle label {
      margin: 0;
    }
    .prepay {
      margin-bottom: 0.5rem;
      padding: 0.75rem;
      border: 1px solid var(--cc-color-rule);
      border-radius: 0.375rem;
      background: var(--cc-color-band);
    }
    .modes {
      margin: 0;
      padding: 0;
      border: 0;
    }
    .mode {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      margin-right: 1rem;
    }
    .errors {
      margin: 0.25rem 0 0;
      padding: 0;
      list-style: none;
      color: var(--cc-color-danger);
      font-size: 0.875rem;
    }
    .results {
      margin-top: 1rem;
      padding-top: 0.75rem;
      border-top: 1px solid var(--cc-color-rule);
    }
    .results-title {
      margin: 0.5rem 0 0.25rem;
      font-family: var(--cc-font-heading);
      font-size: 1.0625rem;
    }
    dl {
      margin: 0;
    }
    .stat {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.375rem 0;
      border-bottom: 1px solid var(--cc-color-rule);
    }
    .stat dt {
      color: var(--cc-color-ink-muted);
    }
    .stat dd {
      margin: 0;
      font-family: var(--cc-font-numeric);
      font-variant-numeric: tabular-nums;
      text-align: right;
    }
    .primary dd {
      font-size: 1.25rem;
      font-weight: 600;
    }
    .disclaimer {
      margin: 0.75rem 0 0;
      color: var(--cc-color-ink-muted);
      font-size: 0.875rem;
    }
    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: -1px;
      padding: 0;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
      border: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuickSimulatorFormComponent {
  private readonly clock = inject(PUBLIC_CLOCK);

  protected readonly disclaimer = DISCLAIMER;
  protected readonly insuranceLegend = INSURANCE_LEGEND;
  protected readonly model = signal<SimulatorModel>({
    principal: '',
    rate: '',
    years: '',
    withPrepayment: false,
    prepayAmount: '',
    prepayInstallment: '',
    prepayMode: 'REDUCE_TERM',
  });
  protected readonly form = form(this.model, (path) => {
    validate(path.principal, ({ value }) => moneyError(value(), 'principal'));
    validate(path.rate, ({ value }) => {
      if (value() === '') return { kind: 'required', message: SIMULATOR_MESSAGES.rateRequired };
      return RATE_FRACTION.test(value()) ? undefined : { kind: 'range', message: SIMULATOR_MESSAGES.rateRange };
    });
    validate(path.years, ({ value }) => {
      const years = value().trim();
      if (years === '') return { kind: 'required', message: SIMULATOR_MESSAGES.yearsRequired };
      if (!DIGITS.test(years)) return { kind: 'integer', message: SIMULATOR_MESSAGES.yearsInteger };
      return years.length > 2 || Number(years) < 1 || Number(years) > MAX_YEARS
        ? { kind: 'range', message: SIMULATOR_MESSAGES.yearsRange }
        : undefined;
    });
    validate(path.prepayAmount, ({ value, valueOf }) =>
      valueOf(path.withPrepayment) ? moneyError(value(), 'prepay') : undefined,
    );
    validate(path.prepayInstallment, ({ value, valueOf }) => {
      if (!valueOf(path.withPrepayment)) return undefined;
      const text = value().trim();
      if (text === '') return { kind: 'required', message: SIMULATOR_MESSAGES.prepayInstallmentRequired };
      if (!DIGITS.test(text)) return { kind: 'integer', message: SIMULATOR_MESSAGES.prepayInstallmentInteger };
      const termMonths = termMonthsOf(valueOf(path.years));
      const max = termMonths === null ? null : termMonths - 1;
      const installment = text.length > 4 ? Number.POSITIVE_INFINITY : Number(text);
      if (installment < 1 || (max !== null && installment > max)) {
        return {
          kind: 'range',
          message: max === null ? SIMULATOR_MESSAGES.prepayInstallmentMin : installmentRangeMessage(max),
        };
      }
      return undefined;
    });
  });

  protected readonly outcome = computed<Outcome>(() => {
    const { principal, rate, years, withPrepayment, prepayAmount, prepayInstallment, prepayMode } = this.model();
    const termMonths = termMonthsOf(years);
    if (
      termMonths === null ||
      !this.form.principal().valid() ||
      !this.form.rate().valid() ||
      !this.form.years().valid()
    ) {
      return { kind: 'idle' };
    }
    let prepayment: SimulationPrepayment | null = null;
    if (withPrepayment) {
      const empty = prepayAmount === '' || prepayInstallment.trim() === '';
      if (!empty) {
        if (!this.form.prepayAmount().valid() || !this.form.prepayInstallment().valid()) return { kind: 'idle' };
        prepayment = {
          amount: parseMoney(prepayAmount),
          afterInstallment: Number(prepayInstallment.trim()),
          mode: prepayMode,
        };
      }
    }
    try {
      const result = simulate({
        principal: parseMoney(principal),
        annualRate: parseRate(rate),
        termMonths,
        today: this.clock.today(),
        prepayment,
      });
      return { kind: 'ok', result };
    } catch (error: unknown) {
      return { kind: 'error', message: describeSimulationError(error) };
    }
  });

  /** Debounced text of the single polite live region. Empty while there are no results. */
  protected readonly announcement = signal('');

  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  /**
   * Called on every change of the form: clears the live region at once and refills it after a pause, so a burst of
   * keystrokes produces a single announcement. No `effect`: it keeps the shared core chunk of the landing small.
   */
  protected scheduleAnnouncement(): void {
    clearTimeout(this.timer);
    this.announcement.set('');
    this.timer = setTimeout(() => {
      const current = this.outcome();
      // The single polite region also carries a calculation error, so no assertive alert is needed.
      this.announcement.set(
        current.kind === 'ok' ? announcementFor(current.result) : current.kind === 'error' ? current.message : '',
      );
    }, ANNOUNCE_DELAY_MS);
  }

  protected shows(field: 'years' | 'prepayInstallment'): boolean {
    const state = this.form[field]();
    return state.touched() && state.invalid();
  }

  protected money(value: string): string {
    return formatMoney(value, 'GTQ');
  }

  protected date(value: string): string {
    return formatLocalDate(value);
  }
}

function announcementFor(result: SimulationResult): string {
  const base = `Cuota nivelada ${formatMoney(result.level, 'GTQ')}. Intereses y seguros totales ${formatMoney(result.totalInterestAndInsurance, 'GTQ')}.`;
  if (result.prepayment === null) return base;
  return `${base} Con el abono ahorras ${formatMoney(result.prepayment.interestSaved, 'GTQ')} en intereses y seguros y ${String(result.prepayment.monthsSaved)} meses.`;
}

/** `years` × 12 when `years` is an integer from 1 to 30; null otherwise. */
function termMonthsOf(years: string): number | null {
  const text = years.trim();
  if (!DIGITS.test(text) || text.length > 2) return null;
  const value = Number(text);
  return value >= 1 && value <= MAX_YEARS ? value * 12 : null;
}

function moneyError(value: string, scope: 'principal' | 'prepay') {
  const required =
    scope === 'principal' ? SIMULATOR_MESSAGES.principalRequired : SIMULATOR_MESSAGES.prepayAmountRequired;
  if (value === '') return { kind: 'required', message: required };
  const amount = parseMoney(value);
  if (moneyIsZero(amount) || moneyIsNegative(amount)) {
    return {
      kind: 'positive',
      message: scope === 'principal' ? SIMULATOR_MESSAGES.principalPositive : SIMULATOR_MESSAGES.prepayAmountPositive,
    };
  }
  return compareMoney(amount, parseMoney(MAX_MONEY)) > 0
    ? {
        kind: 'max',
        message: scope === 'principal' ? SIMULATOR_MESSAGES.principalMax : SIMULATOR_MESSAGES.prepayAmountMax,
      }
    : undefined;
}
