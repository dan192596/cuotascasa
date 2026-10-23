import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  installmentOnOrAfter,
  moneyIsZero,
  type Money,
  parseLocalDate,
  parseMoney,
  parsePaymentDay,
  PathKind,
  type Schedule,
  type YearlySubtotal,
} from '@cuotascasa/domain';
import type { Scenario, Uuid } from '@cuotascasa/schema';
import { LOAN_PROJECTION_SERVICE, LOANS_STORE, SCENARIOS_STORE } from '../../data/tokens.ts';
import { BannerComponent } from '../../ui/feedback/banner.component.ts';
import { ConfirmDialogComponent } from '../../ui/feedback/confirm-dialog.component.ts';
import { formatLocalDate, formatMoney } from '../../ui/format/format.ts';
import { LedgerTableComponent } from '../../ui/ledger-table/ledger-table.component.ts';
import type { LedgerCellEdit } from '../../ui/ledger-table/ledger-table.types.ts';
import { ExportMenuComponent, type ExportRequest } from '../export/export-menu.component.ts';
import { abonoSlotAt, type AbonoSlot, planAbonoEdit, type ScenarioEvent } from './scenario-abono.ts';
import { engineErrorText, writeErrorText } from './schedule-messages.ts';
import { buildLedger, SCHEDULE_VIEWS, type ScheduleView } from './schedule-model.ts';

const DRAFT_NAME = 'Borrador';
const ROW_KEY = /^k-(\d+)$/;

interface PendingAbono {
  readonly k: number;
  readonly dueDate: string;
  readonly amount: Money;
}

/**
 * /app/prestamos/:id/tabla (HU-07, HU-17, R15): the amortization ledger of the original plan, the real path or the
 * active scenario, with Real Δ, yearly subtotals and an abono cell that edits ONLY the active scenario. Every figure
 * comes from LoanProjectionService; nothing is recomputed here.
 */
@Component({
  selector: 'cc-schedule-page',
  imports: [RouterLink, BannerComponent, ConfirmDialogComponent, ExportMenuComponent, LedgerTableComponent],
  template: `
    @if (loan(); as loan) {
      <header class="head">
        <h1>Tabla de amortización · {{ loan.name }}</h1>
        <p class="sub">Montos en {{ loan.currency === 'USD' ? 'dólares (US$)' : 'quetzales (Q)' }}</p>
      </header>

      <div class="toolbar">
        <fieldset class="views">
          <legend>Vista</legend>
          @for (option of views; track option.id) {
            <label>
              <input
                type="radio"
                name="cc-schedule-view"
                [value]="option.id"
                [checked]="view() === option.id"
                [attr.data-testid]="'view-' + option.id"
                (change)="view.set(option.id)"
              />
              {{ option.label }}
            </label>
          }
        </fieldset>
        <div class="scenario">
          <label for="cc-schedule-scenario">Escenario activo</label>
          <select id="cc-schedule-scenario" data-testid="scenario-select" (change)="onScenarioChange($event)">
            <option value="" [selected]="activeId() === null">Sin escenario</option>
            @for (scenario of scenarios(); track scenario.id) {
              <option [value]="scenario.id" [selected]="scenario.id === activeId()">{{ scenario.name }}</option>
            }
          </select>
        </div>
        @if (exportRequest(); as request) {
          <cc-export-menu [request]="request" />
        }
      </div>

      @if (error(); as error) {
        <cc-banner tone="danger" [dismissible]="false" data-testid="schedule-error">{{ error }}</cc-banner>
      }
      <p class="status" role="status" aria-live="polite" data-testid="schedule-status">{{ message() }}</p>

      @if (summary(); as summary) {
        <p class="summary" data-testid="scenario-summary">{{ summary }}</p>
      }

      @if (view() === 'scenario' && fallback()) {
        <p class="note" data-testid="scenario-fallback">{{ fallbackText() }}</p>
      }

      @if (ledger(); as ledger) {
        <cc-ledger-table
          [columns]="ledger.columns"
          [rows]="ledger.rows"
          [label]="tableLabel()"
          [stickyColumns]="2"
          [flashKey]="flashKey()"
          (cellEdit)="onCellEdit($event)"
        />
        @if (hasLocked()) {
          <p class="note" data-testid="locked-note">
            * Hay varios eventos hipotéticos en esa cuota: edítalos en
            <a [routerLink]="'/app/prestamos/' + id() + '/proyecciones'">Proyecciones</a>.
          </p>
        }
        <p class="note">
          Para probar un abono, ve a la columna Abono, pulsa Enter, escribe el monto y vuelve a pulsar Enter. Solo
          cambia el escenario activo; los datos reales se registran en
          <a [routerLink]="'/app/prestamos/' + id() + '/datos-reales'">Datos reales</a>.
        </p>
      } @else if (!error()) {
        <p role="status" data-testid="schedule-loading">Calculando la tabla…</p>
      }

      <cc-confirm-dialog
        [open]="pending() !== null"
        heading="Usar el escenario «Borrador»"
        [message]="draftQuestion()"
        confirmLabel="Usar Borrador"
        cancelLabel="Ahora no"
        (confirmed)="acceptDraft()"
        (cancelled)="declineDraft()"
      />
    } @else {
      <h1>Tabla de amortización</h1>
      <p data-testid="schedule-missing">
        No encontramos este préstamo. <a routerLink="/app">Volver a Mis préstamos</a>
      </p>
    }
  `,
  styles: `
    :host {
      display: block;
      padding: 1rem;
      color: var(--cc-color-ink);
    }
    h1 {
      margin: 0;
      font-family: var(--cc-font-heading);
      font-size: 1.5rem;
    }
    .sub {
      margin: 0.125rem 0 0.75rem;
      color: var(--cc-color-ink-muted);
    }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.75rem 1.5rem;
      margin-bottom: 0.75rem;
    }
    .views {
      display: flex;
      align-items: center;
      gap: 0.25rem 1rem;
      margin: 0;
      padding: 0;
      border: 0;
    }
    .views legend {
      float: left;
      margin-inline-end: 0.75rem;
      padding: 0;
    }
    .views label {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
    }
    select {
      padding: 0.375rem 0.5rem;
      border: 1px solid var(--cc-color-control-border);
      border-radius: 0.25rem;
      color: var(--cc-color-ink);
      background: var(--cc-color-surface);
      font: inherit;
    }
    .scenario {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
    }
    .status {
      min-height: 1.5rem;
      margin: 0.5rem 0;
    }
    .summary {
      margin: 0.5rem 0;
      font-weight: 600;
    }
    .note {
      margin: 0.75rem 0;
      color: var(--cc-color-ink-muted);
    }
    a {
      color: var(--cc-color-ink);
    }
    cc-ledger-table {
      --cc-ledger-max-height: max(20rem, calc(100vh - 18rem));
      border: 1px solid var(--cc-color-rule);
    }
    input[type='radio']:focus-visible,
    select:focus-visible,
    a:focus-visible {
      outline: 2px solid var(--cc-color-ink);
      outline-offset: 2px;
    }
  `,
  host: { 'data-testid': 'page-schedule' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SchedulePageComponent {
  /** Route parameter :id, inherited from 'prestamos/:id/tabla'. */
  readonly id = input.required<Uuid>();

  private readonly loans = inject(LOANS_STORE);
  private readonly service = inject(LOAN_PROJECTION_SERVICE);
  private readonly scenarioStore = inject(SCENARIOS_STORE);

  protected readonly views = SCHEDULE_VIEWS;
  protected readonly view = signal<ScheduleView>('real');
  protected readonly message = signal('');
  protected readonly pending = signal<PendingAbono | null>(null);

  protected readonly loan = computed(() => this.loans.loan(this.id())());
  private readonly projection = computed(() => this.service.forLoan(this.id()));
  /** Flash the table only when the shown path changes (scenario or view switch), not on inline edits or syncs. */
  protected readonly flashKey = computed(() => `${this.view()}|${this.activeId() ?? ''}`);
  protected readonly scenarios = computed(() => this.scenarioStore.listByLoan(this.id())());
  protected readonly activeId = computed(() => this.scenarioStore.activeScenarioId(this.id())());
  private readonly active = computed<Scenario | null>(() => {
    const id = this.activeId();
    return id === null ? null : (this.scenarios().find((scenario) => scenario.id === id) ?? null);
  });
  private readonly draft = computed<Scenario | null>(
    () => this.scenarios().find((scenario) => scenario.name === DRAFT_NAME) ?? null,
  );

  /** Scenario events anchor to installments by [ALG.EVENTS.ANCHOR] rule 2 (first installment due on or after the date). */
  private readonly installmentOf = computed(() => {
    const loan = this.loan();
    if (loan === undefined) return () => 0;
    const first = parseLocalDate(loan.firstDueDate);
    const day = parsePaymentDay(loan.paymentDay);
    return (date: string) => installmentOnOrAfter(first, day, parseLocalDate(date));
  });

  /** The displayed path. The scenario view falls back to the real path while the scenario has no live events. */
  private readonly shown = computed<{
    readonly schedule: Schedule;
    readonly subtotals: readonly YearlySubtotal[];
    readonly pathKind: PathKind;
    readonly fallback: boolean;
  } | null>(() => {
    const projection = this.projection();
    const paths = projection.paths();
    if (paths === null) return null;
    const yearly = projection.yearlySubtotals();
    const view = this.view();
    if (view === 'original') {
      return {
        schedule: paths.original,
        subtotals: yearly?.original ?? [],
        pathKind: PathKind.ORIGINAL,
        fallback: false,
      };
    }
    if (view === 'scenario' && paths.scenario !== null) {
      return {
        schedule: paths.scenario,
        subtotals: yearly?.scenario ?? [],
        pathKind: PathKind.SCENARIO,
        fallback: false,
      };
    }
    return {
      schedule: paths.real,
      subtotals: yearly?.real ?? [],
      pathKind: PathKind.REAL,
      fallback: view === 'scenario',
    };
  });

  protected readonly fallback = computed(() => this.shown()?.fallback === true);

  /** Why the scenario view shows the real rows; one text per cause. */
  protected readonly fallbackText = computed(() => {
    const scenario = this.active();
    const hint = ' Escribe un monto en la columna Abono para probarlo.';
    if (scenario === null) return `No hay un escenario activo; se muestra el camino real.${hint}`;
    if (this.projection().error() !== null) {
      return `El escenario «${scenario.name}» no se pudo calcular; se muestra el camino real. Revisa el aviso de arriba.`;
    }
    return `El escenario «${scenario.name}» no tiene abonos todavía; se muestra el camino real.${hint}`;
  });

  /** Slot of every installment that has live hypothetical events in the active scenario. */
  private readonly slots = computed<ReadonlyMap<number, AbonoSlot>>(() => {
    const events = this.active()?.events ?? [];
    const installmentOf = this.installmentOf();
    const byK = new Map<number, ScenarioEvent[]>();
    for (const event of events) {
      if (event.deletedAt !== null) continue;
      const k = installmentOf(event.date);
      byK.set(k, [...(byK.get(k) ?? []), event]);
    }
    return new Map([...byK].map(([k, group]) => [k, abonoSlotAt(group, k, installmentOf)]));
  });

  protected readonly ledger = computed(() => {
    const shown = this.shown();
    if (shown === null) return null;
    const projection = this.projection();
    const slots = this.slots();
    return buildLedger({
      view: this.view(),
      schedule: shown.schedule,
      subtotals: shown.subtotals,
      cutoffK: projection.cutoffK(),
      currentK: projection.currentInstallment()?.k ?? null,
      paid: projection.paidInstallments(),
      anchors: projection.realDeltaPerAnchor(),
      components: projection.realDeltaPerComponent(),
      slotAt: (k) => slots.get(k) ?? { kind: 'none' },
      fallback: shown.fallback,
    });
  });

  protected readonly hasLocked = computed(
    () => this.view() !== 'original' && [...this.slots().values()].some((slot) => slot.kind === 'locked'),
  );

  protected readonly tableLabel = computed(() => {
    const view = SCHEDULE_VIEWS.find((option) => option.id === this.view());
    return `Tabla de amortización de ${this.loan()?.name ?? 'el préstamo'}, vista ${view?.label.toLowerCase() ?? ''}`;
  });

  protected readonly exportRequest = computed<ExportRequest | null>(() => {
    const shown = this.shown();
    const loan = this.loan();
    if (shown === null || loan === undefined) return null;
    return {
      kind: 'schedule',
      input: {
        schedule: shown.schedule,
        pathKind: shown.pathKind,
        loanLabel: loan.name,
        generatedOn: this.projection().asOf(),
      },
    };
  });

  protected readonly error = computed(() => {
    const error = this.projection().error();
    if (error === null) return null;
    return engineErrorText(error, this.projection().paths() !== null);
  });

  /** Active scenario against the real path ([ALG.METRICS]); every figure is the facade's. */
  protected readonly summary = computed(() => {
    const scenario = this.active();
    const metrics = this.projection().metrics()?.activeScenarioVsReal ?? null;
    const loan = this.loan();
    if (scenario === null || metrics === null || loan === undefined) return null;
    return (
      `Escenario «${scenario.name}» frente al camino real. ` +
      `Fin con el escenario: ${formatLocalDate(metrics.endDate)} (camino real: ${formatLocalDate(metrics.baseEndDate)}). ` +
      `Cuotas ahorradas: ${metrics.monthsSaved}. ` +
      `Intereses y seguros ahorrados: ${formatMoney(metrics.interestSaved, loan.currency)}.`
    );
  });

  protected readonly draftQuestion = computed(() =>
    this.draft() === null
      ? 'No hay un escenario activo. ¿Crear el escenario «Borrador» y guardar ahí este abono hipotético? Los datos reales no cambian.'
      : 'No hay un escenario activo. ¿Activar el escenario «Borrador» y guardar ahí este abono hipotético? Los datos reales no cambian.',
  );

  protected async onScenarioChange(event: Event): Promise<void> {
    const value = (event.target as HTMLSelectElement).value;
    const next = value === '' ? null : (this.scenarios().find((scenario) => scenario.id === value)?.id ?? null);
    try {
      await this.scenarioStore.setActiveScenario(this.id(), next);
      this.message.set(next === null ? 'Sin escenario activo.' : 'Escenario activo cambiado.');
    } catch {
      this.message.set('No se pudo cambiar el escenario activo. Inténtalo de nuevo.');
    }
  }

  /** Edits are applied one after another: each one re-reads the active scenario right before planning. */
  private queue: Promise<void> = Promise.resolve();

  private enqueue(task: () => Promise<void>): Promise<void> {
    this.queue = this.queue.then(task, task);
    return this.queue;
  }

  protected onCellEdit(edit: LedgerCellEdit): Promise<void> {
    const match = ROW_KEY.exec(edit.rowKey);
    const shown = this.shown();
    if (edit.columnKey !== 'prepayment' || match === null || shown === null) return Promise.resolve();
    const k = Number(match[1]);
    const row = shown.schedule.rows.find((candidate) => candidate.k === k);
    if (row === undefined) {
      this.message.set('Esa cuota ya no existe en esta vista.');
      return Promise.resolve();
    }
    if (k <= this.projection().cutoffK()) {
      this.message.set(`La cuota ${k} ya tiene datos reales y no admite abonos hipotéticos.`);
      return Promise.resolve();
    }
    let amount: Money;
    try {
      amount = parseMoney(edit.value);
    } catch {
      this.message.set('El monto del abono no es válido.');
      return Promise.resolve();
    }
    const abono: PendingAbono = { k, dueDate: row.dueDate, amount };
    return this.enqueue(async () => {
      const active = this.active();
      if (active !== null) {
        await this.save(active, abono, null);
        return;
      }
      if (moneyIsZero(amount)) {
        this.message.set(`No hay un abono en la cuota ${k} que quitar.`);
        return;
      }
      this.pending.set(abono);
    });
  }

  protected declineDraft(): void {
    this.pending.set(null);
    this.message.set('No se guardó el abono: no hay un escenario activo.');
  }

  protected acceptDraft(): Promise<void> {
    const pending = this.pending();
    this.pending.set(null);
    if (pending === null) return Promise.resolve();
    return this.enqueue(async () => {
      const existing = this.draft();
      if (existing !== null) {
        await this.save(existing, pending, 'activated');
        return;
      }
      const event: ScenarioEvent = {
        id: crypto.randomUUID(),
        date: pending.dueDate,
        type: 'Prepayment',
        amount: pending.amount,
        mode: 'REDUCE_TERM',
        deletedAt: null,
      };
      try {
        const created = await this.scenarioStore.create({ loanId: this.id(), name: DRAFT_NAME, events: [event] });
        await this.scenarioStore.setActiveScenario(this.id(), created.id);
        this.view.set('scenario');
        this.message.set(`${this.savedText(pending, DRAFT_NAME)} Escenario «${DRAFT_NAME}» creado y activado.`);
      } catch (error) {
        this.message.set(writeErrorText(error));
      }
    });
  }

  /**
   * Plans the edit on `scenario` and writes it. `activation`: the scenario was just offered to the user and still has to
   * be made active. Nothing is written when the cell is locked or there is nothing to change.
   */
  private async save(offered: Scenario, pending: PendingAbono, activation: 'activated' | null): Promise<void> {
    // Latest stored version of the scenario: a previous queued edit may have changed it.
    const scenario = this.scenarios().find((candidate) => candidate.id === offered.id) ?? offered;
    const plan = planAbonoEdit({
      events: scenario.events,
      k: pending.k,
      dueDate: pending.dueDate,
      amount: pending.amount,
      installmentOf: this.installmentOf(),
      newId: () => crypto.randomUUID(),
    });
    if (plan === null) {
      this.message.set(`La cuota ${pending.k} tiene varios eventos hipotéticos: edítalos en Proyecciones.`);
      return;
    }
    if (plan.outcome === 'unchanged') {
      this.message.set(
        moneyIsZero(pending.amount)
          ? `No hay un abono en la cuota ${pending.k} que quitar.`
          : `El abono de la cuota ${pending.k} ya tenía ese monto.`,
      );
      return;
    }
    try {
      if (activation !== null) await this.scenarioStore.setActiveScenario(this.id(), scenario.id);
      await this.scenarioStore.update({
        id: scenario.id,
        loanId: scenario.loanId,
        name: scenario.name,
        events: plan.events,
      });
      this.view.set('scenario');
      const text =
        plan.outcome === 'removed'
          ? `Abono de la cuota ${pending.k} quitado del escenario «${scenario.name}».`
          : this.savedText(pending, scenario.name);
      this.message.set(activation === null ? text : `${text} Escenario «${scenario.name}» activado.`);
    } catch (error) {
      this.message.set(writeErrorText(error));
    }
  }

  private savedText(pending: PendingAbono, scenarioName: string): string {
    const currency = this.loan()?.currency ?? 'GTQ';
    return `Abono de ${formatMoney(pending.amount, currency)} guardado en la cuota ${pending.k} del escenario «${scenarioName}». Ahora ves la vista Escenario.`;
  }
}
