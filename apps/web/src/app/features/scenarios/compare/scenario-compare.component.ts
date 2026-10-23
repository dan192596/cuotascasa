import {
  ChangeDetectionStrategy,
  Component,
  computed,
  Directive,
  effect,
  type ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { Uuid } from '@cuotascasa/schema';
import { LOAN_PROJECTION_SERVICE, LOANS_STORE, SCENARIOS_STORE } from '../../../data/tokens.ts';
import { Announcer } from '../../../ui/feedback/announcer.service.ts';
import { LocalDatePipe } from '../../../ui/format/local-date.pipe.ts';
import { MoneyPipe } from '../../../ui/format/money.pipe.ts';
import { type ExportRequest, ExportMenuComponent } from '../../export/export-menu.component.ts';
import { BalanceChartComponent } from './balance-chart.component.ts';
import {
  describeFailure,
  MAX_COMPARED,
  metricsTable,
  monthsText,
  toggleScenario,
  yearlyBalanceTable,
} from './compare-model.ts';

const LIMIT_MESSAGE = `Puedes comparar hasta ${String(MAX_COMPARED)} escenarios a la vez. Quita uno para elegir otro.`;

/** Tells the host that the block it sits in was rendered (here: the @error block of the deferred chart). */
@Directive({ selector: '[ccRendered]' })
export class RenderedDirective {
  readonly ccRendered = output<void>();

  constructor() {
    queueMicrotask(() => this.ccRendered.emit());
  }
}

/**
 * Comparison of up to 3 scenarios against the original and real paths of one loan (HU-16, R5, R17). Metrics are the
 * engine's `compareSchedules` outputs through the facade; nothing is computed here. The balance chart loads when it
 * scrolls into view; the same data is always available as a table.
 */
@Component({
  selector: 'cc-scenario-compare',
  imports: [BalanceChartComponent, ExportMenuComponent, LocalDatePipe, MoneyPipe, RenderedDirective],
  template: `
    <section class="compare" aria-labelledby="cc-compare-title">
      <h2 id="cc-compare-title">Comparar escenarios</h2>

      @if (!scenariosStore.ready()) {
        <p role="status" data-testid="compare-loading">Cargando los escenarios…</p>
      } @else {
        @if (scenarios().length === 0) {
          <p data-testid="compare-no-scenarios">
            Este préstamo aún no tiene escenarios. Crea uno en el editor para compararlo con tu camino real.
          </p>
        } @else {
          <fieldset class="picker" #picker>
            <legend>Escenarios a comparar (hasta {{ max }})</legend>
            <span
              class="indicator"
              [hidden]="selectedIds().length === 0 || wrapped()"
              aria-hidden="true"
              data-testid="scenario-indicator"
              [style.--cc-i]="activeIndex()"
              [style.--cc-n]="scenarios().length"
            ></span>
            @for (scenario of scenarios(); track scenario.id) {
              <label class="option">
                <input
                  type="checkbox"
                  data-testid="scenario-option"
                  [value]="scenario.id"
                  [checked]="selectedIds().includes(scenario.id)"
                  (change)="onToggle(scenario.id, $event)"
                />
                {{ scenario.name }}
              </label>
            }
          </fieldset>
          <p class="status" data-testid="compare-status">{{ statusText() }}</p>
        }

        @if (comparison(); as result) {
          @if (failures().length > 0) {
            <section class="failed" aria-labelledby="cc-compare-failed" data-testid="compare-failed">
              <h3 id="cc-compare-failed"><span aria-hidden="true">▲ </span>No se pudieron calcular</h3>
              <ul>
                @for (failure of failures(); track failure.id) {
                  <li>
                    <strong>{{ failure.name }}</strong
                    >: {{ failure.text }}
                  </li>
                }
              </ul>
            </section>
          }

          <div class="scroll" role="region" tabindex="0" aria-label="Métricas de la comparación">
            <table data-testid="compare-metrics">
              <caption>
                Métricas de cada escenario contra el camino real
              </caption>
              <thead>
                <tr>
                  <th scope="col">Concepto</th>
                  @for (column of table().columns; track column.key) {
                    <th scope="col">{{ column.heading }}</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (metric of table().rows; track metric.label) {
                  <tr>
                    <th scope="row">{{ metric.label }}</th>
                    @for (cell of metric.cells; track $index) {
                      <td class="num">
                        @if (cell.type === 'money') {
                          {{ cell.value | money: table().currency }}
                          @if (cell.negative) {
                            <span class="flag">(cuesta más)</span>
                          }
                        } @else if (cell.type === 'months') {
                          {{ monthsLabel(cell.value) }}
                          @if (cell.negative) {
                            <span class="flag">(más largo)</span>
                          }
                        } @else if (cell.type === 'date') {
                          {{ cell.value | localDate }}
                        } @else {
                          —
                        }
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (hasNegative()) {
            <p class="note" data-testid="compare-negative-note">
              Un valor negativo significa que ese escenario cuesta más que el camino real. Un abono no siempre baja el
              interés total, y se muestra tal cual.
            </p>
          }

          @if (exportRequest(); as request) {
            <cc-export-menu [request]="request" />
          }

          @defer (on viewport) {
            <cc-balance-chart [comparison]="result" />
          } @placeholder {
            <div class="chart-placeholder" data-testid="chart-placeholder">
              La gráfica del saldo se carga al llegar aquí.
            </div>
          } @loading {
            <p class="chart-placeholder" role="status">Cargando la gráfica…</p>
          } @error {
            <p class="chart-placeholder" (ccRendered)="chartFailed.set(true)">
              No se pudo cargar la gráfica. Usa la tabla «Ver los saldos de la gráfica en una tabla», que trae los
              mismos datos.
            </p>
          }

          <details class="data" data-testid="chart-data-details" [open]="chartFailed()">
            <summary>Ver los saldos de la gráfica en una tabla</summary>
            <div
              class="scroll"
              role="region"
              tabindex="0"
              aria-label="Saldo al cierre de cada año, por camino"
              data-testid="chart-data-region"
            >
              <table>
                <caption>
                  Saldo al cierre del último pago de cada año
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Año</th>
                    @for (heading of yearly().headings; track $index) {
                      <th scope="col">{{ heading }}</th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (year of yearly().rows; track year.year) {
                    <tr>
                      <th scope="row">{{ year.year }}</th>
                      @for (balance of year.balances; track $index) {
                        <td class="num">{{ balance === null ? '—' : (balance | money: table().currency) }}</td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </details>
        } @else {
          <p data-testid="compare-unavailable">
            No se pudo calcular la comparación. Revisa los datos reales del préstamo e inténtalo de nuevo.
          </p>
        }
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
      padding: 1rem;
      color: var(--cc-color-ink);
    }
    h2,
    h3 {
      font-family: var(--cc-font-heading);
    }
    .picker {
      position: relative;
      display: flex;
      flex-wrap: wrap;
      margin: 0 0 0.5rem;
      padding: 0.5rem 0.75rem 0.75rem;
      border: 1px solid var(--cc-color-control-border);
      border-radius: var(--cc-radius-block);
    }
    .picker legend {
      padding-inline: 0.25rem;
    }
    /* Equal shares on one row; below 9rem each option wraps to a new row instead of squeezing its name (375 px). */
    .option {
      flex: 1 1 0;
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      min-width: min(100%, 9rem);
      min-height: 2rem;
    }
    /*
     * Slides under the first active option; the options share the width equally, so the offset is exact. Hidden when
     * the options wrap to more than one row, where a single-row offset would point at the wrong option.
     */
    .indicator[hidden] {
      display: none;
    }
    .indicator {
      position: absolute;
      inset-inline-start: 0.75rem;
      bottom: 0.25rem;
      width: calc((100% - 1.5rem) / var(--cc-n, 1));
      height: 3px;
      border-radius: var(--cc-radius-pill);
      background: var(--cc-color-accent);
      transform: translateX(calc(var(--cc-i) * 100%));
      transition: transform var(--cc-duration-base) var(--cc-ease-out);
    }
    .status,
    .note {
      color: var(--cc-color-ink-muted);
    }
    .failed {
      margin: 1rem 0;
      padding: 0.25rem 0.75rem;
      border-left: 4px solid var(--cc-color-danger);
      background: var(--cc-color-surface);
    }
    .scroll {
      overflow-x: auto;
      margin: 1rem 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--cc-color-surface);
    }
    caption {
      padding: 0.25rem 0;
      text-align: left;
      color: var(--cc-color-ink-muted);
    }
    th,
    td {
      padding: 0.375rem 0.75rem;
      border-bottom: 1px solid var(--cc-color-rule);
      text-align: left;
    }
    td.num {
      font-family: var(--cc-font-numeric);
      font-variant-numeric: tabular-nums;
      text-align: right;
      white-space: nowrap;
    }
    tbody tr:nth-child(even) {
      background: var(--cc-color-band);
    }
    .flag {
      font-family: var(--cc-font-body);
      color: var(--cc-color-ink-muted);
    }
    .chart-placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 20rem;
      margin: 1rem 0;
      border: 1px dashed var(--cc-color-control-border);
      color: var(--cc-color-ink-muted);
    }
    .data summary {
      cursor: pointer;
      padding: 0.5rem 0;
    }
    .scroll:focus-visible,
    summary:focus-visible,
    input:focus-visible {
      outline: 2px solid var(--cc-color-ink);
      outline-offset: 2px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScenarioCompareComponent {
  readonly loanId = input.required<Uuid>();

  protected readonly scenariosStore = inject(SCENARIOS_STORE);
  private readonly loans = inject(LOANS_STORE);
  private readonly projections = inject(LOAN_PROJECTION_SERVICE);

  protected readonly max = MAX_COMPARED;
  /** What the user picked; null until the first click, so new scenarios show up on their own. */
  private readonly chosen = signal<readonly Uuid[] | null>(null);
  private readonly limitReached = signal(false);
  private readonly announcer = inject(Announcer);
  protected readonly chartFailed = signal(false);

  protected readonly scenarios = computed(() => this.scenariosStore.listByLoan(this.loanId())());
  protected readonly selectedIds = computed<readonly Uuid[]>(() => {
    const existing = this.scenarios().map((scenario) => scenario.id);
    const chosen = this.chosen();
    return chosen === null ? existing.slice(0, MAX_COMPARED) : chosen.filter((id) => existing.includes(id));
  });
  private readonly picker = viewChild<ElementRef<HTMLElement>>('picker');
  /** True when the options wrap to more than one row (narrow screens): the sliding indicator is then hidden. */
  protected readonly wrapped = signal(false);

  constructor() {
    effect((onCleanup) => {
      const picker = this.picker()?.nativeElement;
      if (picker === undefined || typeof ResizeObserver === 'undefined') return;
      const measure = (): void => {
        const tops = Array.from(picker.querySelectorAll<HTMLElement>('.option'), (option) => option.offsetTop);
        this.wrapped.set(tops.some((top) => top !== tops[0]));
      };
      const observer = new ResizeObserver(measure);
      observer.observe(picker);
      onCleanup(() => observer.disconnect());
    });
  }

  /** Index of the first compared scenario: where the sliding indicator sits. */
  protected readonly activeIndex = computed(() => {
    const first = this.selectedIds()[0];
    const index = this.scenarios().findIndex((scenario) => scenario.id === first);
    return index < 0 ? 0 : index;
  });
  protected readonly statusText = computed(() => {
    if (this.limitReached()) return LIMIT_MESSAGE;
    const count = this.selectedIds().length;
    if (count === 0) return 'Elige escenarios para compararlos; mientras, se muestran el camino original y el real.';
    return `Comparando ${String(count)} ${count === 1 ? 'escenario' : 'escenarios'}.`;
  });

  protected readonly comparison = computed(() =>
    this.projections.compareScenarios(this.loanId(), this.selectedIds())(),
  );
  protected readonly table = computed(() => {
    const result = this.comparison();
    return result === null ? { currency: 'GTQ' as const, columns: [], rows: [] } : metricsTable(result);
  });
  protected readonly yearly = computed(() => {
    const result = this.comparison();
    return result === null ? { headings: [], rows: [] } : yearlyBalanceTable(result);
  });
  protected readonly hasNegative = computed(() =>
    this.table().rows.some((row) => row.cells.some((cell) => 'negative' in cell && cell.negative)),
  );
  protected readonly failures = computed(() =>
    (this.comparison()?.failed ?? []).map((failure) => ({
      id: failure.scenarioId,
      name: this.scenarios().find((scenario) => scenario.id === failure.scenarioId)?.name ?? 'Escenario',
      text: describeFailure(failure.error),
    })),
  );
  protected readonly exportRequest = computed<ExportRequest | null>(() => {
    const result = this.comparison();
    const loan = this.loans.loan(this.loanId())();
    if (result === null || loan === undefined) return null;
    return {
      kind: 'comparison',
      input: {
        base: { label: 'Real', schedule: result.real },
        scenarios: result.scenarios.map((entry) => ({
          label: entry.name,
          schedule: entry.schedule,
          metrics: entry.metrics,
        })),
        loanLabel: loan.name,
        generatedOn: this.projections.asOf(),
      },
    };
  });

  protected readonly monthsLabel = monthsText;

  protected onToggle(id: Uuid, event: Event): void {
    const input = event.target as HTMLInputElement;
    const result = toggleScenario(this.selectedIds(), id, input.checked);
    this.chosen.set(result.ids);
    this.limitReached.set(result.blocked);
    // Same text on a second refusal changes nothing in the DOM, so the announcer says it again on every attempt.
    void this.announcer.polite(result.blocked ? LIMIT_MESSAGE : this.statusText());
    // A refused check must not stay ticked: the checkbox flipped on its own before this handler ran.
    input.checked = result.ids.includes(id);
  }
}
