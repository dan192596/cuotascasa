import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { buildSchedule, type Currency } from '@cuotascasa/domain';
import type { Uuid } from '@cuotascasa/schema';
import {
  LOAN_EVENTS_STORE,
  LOAN_PROJECTION_SERVICE,
  LOANS_STORE,
  PAYMENTS_STORE,
  REPORTED_BALANCES_STORE,
} from '../../../data/tokens.ts';
import { Announcer } from '../../../ui/feedback/announcer.service.ts';
import { BannerComponent } from '../../../ui/feedback/banner.component.ts';
import { ConfirmDialogComponent } from '../../../ui/feedback/confirm-dialog.component.ts';
import { StatusChipComponent, type ValidationStatus } from '../../../ui/feedback/status-chip.component.ts';
import { formatLocalDate, formatMoney } from '../../../ui/format/format.ts';
import {
  EVENT_FORM_KINDS,
  type EventFormContext,
  EventFormComponent,
  type EventFormKind,
  type EventFormValue,
} from '../forms/event-form.component.ts';
import {
  buildTimeline,
  describeCause,
  describeEngineError,
  describeEntry,
  describeSaveError,
  entryFormKind,
  entryToFormValue,
  formatDelta,
  KIND_NOUNS,
  type TimelineEntry,
  toRealWrite,
} from './timeline-model.ts';

const ADD_LABELS: Readonly<Record<EventFormKind, string>> = {
  ReportedBalance: 'Agregar saldo reportado',
  ActualPayment: 'Agregar pago real',
  RateChange: 'Agregar cambio de tasa',
  FixedChargeChange: 'Agregar cambio de cargos fijos',
  Prepayment: 'Agregar abono a capital',
  AdvanceInstallments: 'Adelantar cuotas',
};

interface Editor {
  readonly kind: EventFormKind;
  /** The entry being edited, or null when adding. */
  readonly entry: TimelineEntry | null;
  readonly value: EventFormValue | null;
  /** The button that opened the form (focus returns to it on cancel). */
  readonly opener: HTMLElement | null;
}

interface ComponentDeltaRow {
  readonly label: string;
  readonly text: string;
}

interface Row {
  readonly entry: TimelineEntry;
  readonly id: Uuid;
  readonly date: string;
  readonly title: string;
  readonly lines: readonly string[];
  readonly label: string;
  readonly delta: {
    /** null while the facade has no delta for the balance: no chip, only neutral text. */
    readonly status: ValidationStatus | null;
    readonly pending: string | null;
    readonly text: string | null;
    readonly projected: string | null;
    readonly cause: string | null;
  } | null;
  readonly paid: string | null;
  readonly components: readonly ComponentDeltaRow[];
}

/**
 * Real-data timeline of a loan (R4, R16; HU-09 to HU-12): reported balances, payments, rate changes, fixed charges,
 * prepayments and advances in date order, with add, edit and delete through cc-event-form. Before every write it asks
 * the facade for a dry run (`checkRealWrite`, HU-10) and shows a refusal inline instead of writing. Real Δ, the paid
 * mark and the per-component Real Δ come from the facade (LoanProjectionService), never from this component.
 */
@Component({
  selector: 'cc-real-data-timeline',
  imports: [BannerComponent, ConfirmDialogComponent, EventFormComponent, StatusChipComponent],
  template: `
    <section class="timeline" aria-labelledby="timeline-title">
      <h2 id="timeline-title" tabindex="-1" data-testid="timeline-title">Línea de tiempo</h2>

      @if (!ready()) {
        <p role="status" data-testid="timeline-loading">Cargando los datos reales…</p>
      } @else if (loan() === undefined) {
        <p data-testid="timeline-missing">No encontramos este préstamo. Vuelve a Mis préstamos y elige otro.</p>
      } @else {
        @if (engineError(); as text) {
          <p class="engine-error" role="status" data-testid="engine-error">
            <span aria-hidden="true">■</span> <strong>Error</strong> <span>{{ text }}</span>
          </p>
        }

        @if (realEndDate(); as end) {
          <p class="num" data-testid="real-end-date">Fin proyectado con tus datos reales: {{ end }}</p>
        }

        @if (context(); as ctx) {
          <div class="add-bar" role="group" aria-label="Agregar un registro real" data-testid="add-bar">
            @for (kind of kinds; track kind) {
              <button type="button" class="button" [attr.data-kind]="kind" (click)="open(kind, null, $event)">
                {{ addLabels[kind] }}
              </button>
            }
          </div>

          @if (writeError(); as text) {
            <cc-banner tone="danger" [dismissible]="false" data-testid="write-error">{{ text }}</cc-banner>
          }

          @if (editor(); as current) {
            <div
              class="form-panel"
              data-testid="form-panel"
              (input)="writeError.set(null)"
              (change)="writeError.set(null)"
            >
              <cc-event-form
                [kind]="current.kind"
                [context]="ctx"
                [value]="current.value"
                (submitted)="onSubmitted($event)"
                (cancelled)="onCancelled()"
              />
            </div>
          }
        } @else {
          <p data-testid="timeline-unavailable">
            No se pueden agregar registros porque las condiciones del préstamo no permiten calcular su plan.
          </p>
        }

        @if (rows().length === 0) {
          <p class="empty" data-testid="timeline-empty">
            Aún no hay datos reales. Agrega el saldo que te informa el banco, un pago, un abono o un cambio de tasa para
            comparar lo proyectado con lo real.
          </p>
        } @else {
          <ol class="entries">
            @for (row of rows(); track row.id) {
              <li class="entry" data-testid="timeline-entry" [attr.data-kind]="row.entry.entity">
                <div class="head">
                  <time [attr.datetime]="row.date" class="date">{{ row.dateText }}</time>
                  <h3>{{ row.title }}</h3>
                </div>
                <ul class="lines">
                  @for (line of row.lines; track $index) {
                    <li>{{ line }}</li>
                  }
                </ul>

                @if (row.delta; as delta) {
                  <div class="delta">
                    @if (delta.projected !== null) {
                      <p class="num" data-testid="projected-balance">Saldo proyectado: {{ delta.projected }}</p>
                    }
                    @if (delta.text !== null) {
                      <p class="num" data-testid="real-delta">Real Δ: {{ delta.text }}</p>
                    } @else {
                      <p class="muted" data-testid="delta-pending">Real Δ: {{ delta.pending }}</p>
                    }
                    @if (delta.status !== null) {
                      <cc-status-chip [status]="delta.status" />
                    }
                    @if (delta.cause !== null) {
                      <p class="muted" data-testid="delta-cause">{{ delta.cause }}</p>
                    }
                  </div>
                }

                @if (row.paid !== null) {
                  <p class="paid">
                    <span aria-hidden="true">✓</span> <span data-testid="paid-mark">{{ row.paid }}</span>
                  </p>
                }

                @if (row.components.length > 0) {
                  <div class="components">
                    <p class="muted">Real Δ por componente (real − proyectado)</p>
                    <ul>
                      @for (component of row.components; track component.label) {
                        <li class="num" data-testid="component-delta">{{ component.label }}: {{ component.text }}</li>
                      }
                    </ul>
                  </div>
                }

                <div class="actions">
                  <button
                    type="button"
                    class="button"
                    data-testid="edit-entry"
                    [attr.data-edit-id]="row.id"
                    [attr.aria-label]="'Editar ' + row.label"
                    (click)="open(kindOf(row.entry), row.entry, $event)"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    class="button"
                    data-testid="delete-entry"
                    [attr.aria-label]="'Eliminar ' + row.label"
                    (click)="askDelete(row.entry, $event)"
                  >
                    Eliminar
                  </button>
                </div>
              </li>
            }
          </ol>
        }
      }

      <cc-confirm-dialog
        [open]="pendingDelete() !== null"
        heading="¿Eliminar este registro?"
        [message]="deleteMessage()"
        confirmLabel="Eliminar"
        [destructive]="true"
        (confirmed)="confirmDelete()"
        (cancelled)="cancelDelete()"
      />
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .timeline {
      display: grid;
      gap: 1rem;
    }
    h2,
    h3,
    p,
    ul,
    ol {
      margin: 0;
    }
    h2:focus-visible {
      outline: 2px solid var(--cc-color-control-border);
      outline-offset: 2px;
    }
    .add-bar,
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .button {
      padding: 0.375rem 0.875rem;
      border: 1px solid var(--cc-color-control-border);
      border-radius: 0.25rem;
      background: var(--cc-color-surface);
      color: var(--cc-color-ink);
      font: inherit;
      cursor: pointer;
    }
    .button:focus-visible {
      outline: 2px solid var(--cc-color-control-border);
      outline-offset: 2px;
    }
    .form-panel {
      padding: 1rem;
      border: 1px solid var(--cc-color-control-border);
      border-radius: 0.5rem;
      background: var(--cc-color-surface);
    }
    .engine-error {
      padding: 0.625rem 0.75rem;
      border: 1px solid var(--cc-color-danger);
      border-left-width: 4px;
      border-radius: 0.375rem;
      background: var(--cc-color-surface);
      color: var(--cc-color-ink);
    }
    .engine-error span[aria-hidden] {
      color: var(--cc-color-danger);
    }
    .entries {
      display: grid;
      gap: 0.75rem;
      padding: 0;
      list-style: none;
    }
    .entry {
      display: grid;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
      border: 1px solid var(--cc-color-border);
      border-radius: 0.5rem;
      background: var(--cc-color-surface);
    }
    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0.75rem;
    }
    .date {
      font-family: var(--cc-font-mono, monospace);
      color: var(--cc-color-ink-muted);
    }
    h3 {
      font-family: var(--cc-font-heading);
      font-size: 1.125rem;
    }
    .lines {
      padding-inline-start: 1.25rem;
    }
    .delta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem 1rem;
    }
    .num {
      font-variant-numeric: tabular-nums;
    }
    .muted,
    .empty {
      color: var(--cc-color-ink-muted);
    }
    .paid {
      color: var(--cc-color-positive);
    }
    .components ul {
      padding-inline-start: 1.25rem;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RealDataTimelineComponent {
  readonly loanId = input.required<Uuid>();

  protected readonly kinds = EVENT_FORM_KINDS;
  protected readonly addLabels = ADD_LABELS;

  private readonly loans = inject(LOANS_STORE);
  private readonly eventsStore = inject(LOAN_EVENTS_STORE);
  private readonly balancesStore = inject(REPORTED_BALANCES_STORE);
  private readonly paymentsStore = inject(PAYMENTS_STORE);
  private readonly service = inject(LOAN_PROJECTION_SERVICE);
  private readonly announcer = inject(Announcer);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  private readonly loanSignal = computed(() => this.loans.loan(this.loanId()));
  protected readonly loan = computed(() => this.loanSignal()());
  private readonly projection = computed(() => this.service.forLoan(this.loanId()));
  private readonly events = computed(() => this.eventsStore.listByLoan(this.loanId())());
  private readonly balances = computed(() => this.balancesStore.listByLoan(this.loanId())());
  private readonly payments = computed(() => this.paymentsStore.listByLoan(this.loanId())());

  protected readonly ready = computed(
    () => this.loans.ready() && this.eventsStore.ready() && this.balancesStore.ready() && this.paymentsStore.ready(),
  );

  /** endDate of the original plan: the form's upper bound while the facade has no real end date. */
  private readonly originalEndDate = computed<string | null>(() => {
    const loan = this.loan();
    if (loan === undefined) {
      return null;
    }
    try {
      return buildSchedule(this.service.toLoanTerms(loan)).endDate;
    } catch {
      return null;
    }
  });

  protected readonly context = computed<EventFormContext | null>(() => {
    const loan = this.loan();
    if (loan === undefined) {
      return null;
    }
    const endDate = this.projection().realEndDate() ?? this.originalEndDate();
    if (endDate === null) {
      return null;
    }
    return {
      loanId: loan.id,
      currency: loan.currency,
      rateType: loan.rateType,
      disbursementDate: loan.disbursementDate,
      firstDueDate: loan.firstDueDate,
      paymentDay: loan.paymentDay,
      endDate,
    };
  });

  protected readonly realEndDate = computed(() => {
    const end = this.projection().realEndDate();
    return end === null ? null : formatLocalDate(end);
  });

  protected readonly engineError = computed(() => {
    const error = this.projection().error();
    return error === null ? null : describeEngineError(error);
  });

  protected readonly editor = linkedSignal<Uuid, Editor | null>({ source: this.loanId, computation: () => null });
  protected readonly writeError = signal<string | null>(null);
  protected readonly pendingDelete = signal<TimelineEntry | null>(null);
  private readonly saving = signal(false);
  private deleteOpener: HTMLElement | null = null;

  protected readonly deleteMessage = computed(() => {
    const entry = this.pendingDelete();
    return entry === null
      ? ''
      : `Se eliminará el ${KIND_NOUNS[entryFormKind(entry)]} del ${formatLocalDate(entry.date)}. La proyección se recalculará sin este registro.`;
  });

  protected readonly rows = computed<(Row & { readonly dateText: string })[]>(() => {
    const currency: Currency = this.loan()?.currency ?? 'GTQ';
    const projection = this.projection();
    const anchors = new Map(projection.realDeltaPerAnchor().map((delta) => [delta.eventId, delta]));
    const components = new Map(projection.realDeltaPerComponent().map((delta) => [delta.eventId, delta]));
    const paid = projection.paidInstallments();
    const pending = projection.error() === null ? 'Calculando…' : 'no disponible mientras haya un error en el cálculo.';
    return buildTimeline(this.balances(), this.payments(), this.events()).map((entry) => {
      const description = describeEntry(entry, currency);
      const id = entry.record.id;
      const dateText = formatLocalDate(entry.date);
      let delta: Row['delta'] = null;
      if (entry.entity === 'ReportedBalance') {
        const anchor = anchors.get(id);
        delta =
          anchor === undefined
            ? { status: null, pending, text: null, projected: null, cause: null }
            : {
                status: anchor.status,
                pending: null,
                text: formatDelta(anchor.realDelta, currency),
                projected: formatMoney(anchor.projected, currency),
                cause: describeCause(anchor.cause),
              };
      }
      const component = entry.entity === 'ActualPayment' ? components.get(id) : undefined;
      return {
        entry,
        id,
        date: entry.date,
        dateText,
        title: description.title,
        lines: description.lines,
        label: `${KIND_NOUNS[entryFormKind(entry)]} del ${dateText}`,
        delta,
        paid:
          entry.entity === 'ActualPayment' && paid.has(entry.record.installmentNumber)
            ? `Cuota ${String(entry.record.installmentNumber)} pagada`
            : null,
        components:
          component === undefined
            ? []
            : [
                { label: 'Capital', text: formatDelta(component.capital, currency) },
                { label: 'Interés', text: formatDelta(component.interest, currency) },
                { label: 'Seguro', text: formatDelta(component.insurance, currency) },
                { label: 'Cargos fijos', text: formatDelta(component.fixedCharges, currency) },
              ],
      };
    });
  });

  protected kindOf(entry: TimelineEntry): EventFormKind {
    return entryFormKind(entry);
  }

  protected open(kind: EventFormKind, entry: TimelineEntry | null, trigger: Event): void {
    this.writeError.set(null);
    this.editor.set({
      kind,
      entry,
      value: entry === null ? null : entryToFormValue(entry),
      opener: trigger.currentTarget instanceof HTMLElement ? trigger.currentTarget : null,
    });
    this.afterRender(() =>
      this.host.nativeElement.querySelector<HTMLElement>('cc-event-form :is(input, select)')?.focus(),
    );
  }

  protected onCancelled(): void {
    const opener = this.editor()?.opener ?? null;
    this.writeError.set(null);
    this.editor.set(null);
    this.afterRender(() => opener?.focus());
  }

  protected async onSubmitted(value: EventFormValue): Promise<void> {
    const current = this.editor();
    if (current === null || this.saving()) {
      return;
    }
    const editingId = current.entry?.record.id ?? null;
    this.writeError.set(null);
    // HU-10: the facade's dry run decides before anything is written.
    const refused = this.service.checkRealWrite(this.loanId(), toRealWrite(value, editingId));
    if (refused !== null) {
      this.writeError.set(describeEngineError(refused));
      return;
    }
    this.saving.set(true);
    try {
      const savedId = await this.persist(value, editingId);
      this.editor.set(null);
      const when = formatLocalDate(value.entity === 'ActualPayment' ? value.draft.paidDate : value.draft.date);
      const noun = KIND_NOUNS[current.kind];
      void this.announcer.polite(`Se guardó el ${noun} del ${when}.`);
      this.afterRender(() =>
        this.host.nativeElement.querySelector<HTMLElement>(`[data-edit-id="${savedId}"]`)?.focus(),
      );
    } catch (error) {
      this.writeError.set(describeSaveError(error));
    } finally {
      this.saving.set(false);
    }
  }

  private async persist(value: EventFormValue, editingId: Uuid | null): Promise<Uuid> {
    switch (value.entity) {
      case 'ReportedBalance':
        return (
          editingId === null
            ? await this.balancesStore.create(value.draft)
            : await this.balancesStore.update({ ...value.draft, id: editingId })
        ).id;
      case 'ActualPayment':
        return (
          editingId === null
            ? await this.paymentsStore.create(value.draft)
            : await this.paymentsStore.update({ ...value.draft, id: editingId })
        ).id;
      case 'LoanEvent':
        return (
          editingId === null
            ? await this.eventsStore.create(value.draft)
            : await this.eventsStore.update({ ...value.draft, id: editingId })
        ).id;
    }
  }

  protected askDelete(entry: TimelineEntry, trigger: Event): void {
    this.writeError.set(null);
    this.deleteOpener = trigger.currentTarget instanceof HTMLElement ? trigger.currentTarget : null;
    this.pendingDelete.set(entry);
  }

  protected cancelDelete(): void {
    this.pendingDelete.set(null);
    const opener = this.deleteOpener;
    this.afterRender(() => opener?.focus());
  }

  protected async confirmDelete(): Promise<void> {
    const entry = this.pendingDelete();
    if (entry === null) {
      return;
    }
    this.pendingDelete.set(null);
    try {
      await this.deleteRecord(entry);
      void this.announcer.polite(
        `Se eliminó el ${KIND_NOUNS[entryFormKind(entry)]} del ${formatLocalDate(entry.date)}.`,
      );
      this.afterRender(() => this.host.nativeElement.querySelector<HTMLElement>('#timeline-title')?.focus());
    } catch (error) {
      this.writeError.set(describeSaveError(error, 'delete'));
      const opener = this.deleteOpener;
      this.afterRender(() => opener?.focus());
    }
  }

  private deleteRecord(entry: TimelineEntry): Promise<void> {
    switch (entry.entity) {
      case 'ReportedBalance':
        return this.balancesStore.delete(entry.record.id);
      case 'ActualPayment':
        return this.paymentsStore.delete(entry.record.id);
      case 'LoanEvent':
        return this.eventsStore.delete(entry.record.id);
    }
  }

  private afterRender(work: () => void): void {
    afterNextRender(work, { injector: this.injector });
  }
}
