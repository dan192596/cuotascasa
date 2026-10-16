import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { type FieldTree, FormField } from '@angular/forms/signals';
import type { Currency } from '@cuotascasa/domain';
import { StatusChipComponent, type ValidationStatus } from '../../../../ui/feedback/status-chip.component.ts';
import { LocalDatePipe } from '../../../../ui/format/local-date.pipe.ts';
import { MoneyPipe } from '../../../../ui/format/money.pipe.ts';
import { DateInputComponent } from '../../../../ui/money-input/date-input.component.ts';
import { MoneyInputComponent } from '../../../../ui/money-input/money-input.component.ts';
import { MESSAGES } from '../wizard-messages.ts';
import {
  type AnchorView,
  dueDateOfInstallment,
  REPORTED_BALANCE_SOURCES,
  SOURCE_LABELS,
  type WizardModel,
} from '../wizard-model.ts';
import { FieldErrorsComponent, fieldInvalid } from './field-errors.component.ts';

/** Step 4 · saldo real (ancla) y validación, opcional. The traffic light informs and never blocks saving. */
@Component({
  selector: 'cc-wizard-step-anchor',
  imports: [
    FormField,
    FieldErrorsComponent,
    MoneyInputComponent,
    DateInputComponent,
    StatusChipComponent,
    MoneyPipe,
    LocalDatePipe,
  ],
  template: `
    @let f = form();
    <p class="cc-wiz-hint">
      Opcional. Si ya pagaste cuotas, escribe el saldo que informa el banco y la cuota a la que corresponde (el saldo
      antes de pagarla). Si lo dejas vacío, el préstamo se guarda sin saldo real.
    </p>
    <div class="cc-wiz-field">
      <label for="anchorBalance">Saldo que informa el banco</label>
      <cc-money-input inputId="anchorBalance" [currency]="currency()" [formField]="f.anchorBalance" />
    </div>
    <div class="cc-wiz-field">
      <label for="anchorK">Cuota a la que corresponde (saldo antes de pagarla)</label>
      <input
        id="anchorK"
        type="text"
        inputmode="numeric"
        autocomplete="off"
        [formField]="f.anchorK"
        [attr.aria-invalid]="invalid(f.anchorK) || rangeMessage() !== null"
        [attr.aria-describedby]="describedBy()"
      />
      <cc-wizard-errors id="anchorK-errors" [field]="f.anchorK" />
      @if (rangeMessage(); as message) {
        <p class="cc-wiz-issue" role="alert" id="anchor-range" data-testid="anchor-error">{{ message }}</p>
      }
      @if (dueDate(); as due) {
        <p class="cc-wiz-hint" data-testid="anchor-due">Vence el {{ due | localDate }}</p>
      }
    </div>
    <div class="cc-wiz-field">
      <label for="anchorDate">Fecha del aviso del banco</label>
      <cc-date-input inputId="anchorDate" placeholder="dd/mm/aaaa" [formField]="f.anchorDate" />
    </div>
    <div class="cc-wiz-field">
      <label for="anchorSource">Dónde leíste el saldo</label>
      <select
        id="anchorSource"
        [formField]="f.anchorSource"
        [attr.aria-invalid]="invalid(f.anchorSource)"
        [attr.aria-describedby]="invalid(f.anchorSource) ? 'anchorSource-errors' : null"
      >
        @for (source of sources; track source) {
          <option [value]="source">{{ sourceLabel(source) }}</option>
        }
      </select>
      <cc-wizard-errors id="anchorSource-errors" [field]="f.anchorSource" />
    </div>

    <dl class="cc-wiz-summary" aria-live="polite">
      @if (result(); as r) {
        <dt>Saldo modelado</dt>
        <dd data-testid="anchor-modeled">{{ r.modeled | money: currency() }}</dd>
        <dt>Diferencia</dt>
        <dd data-testid="anchor-difference">{{ r.realDelta | money: currency() }}</dd>
      }
      <dt>Estado</dt>
      <dd data-testid="chip-status"><cc-status-chip [status]="status()" /></dd>
    </dl>
    @if (cause(); as text) {
      <p class="cc-wiz-issue cc-wiz-cause" data-testid="anchor-cause">{{ text }}</p>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WizardStepAnchorComponent {
  readonly form = input.required<FieldTree<WizardModel>>();
  readonly anchor = input.required<AnchorView>();
  readonly currency = input.required<Currency>();

  protected readonly sources = REPORTED_BALANCE_SOURCES;
  protected readonly invalid = fieldInvalid;
  protected readonly result = computed(() => {
    const view = this.anchor();
    return view.kind === 'result' ? view.result : null;
  });
  protected readonly status = computed<ValidationStatus>(() => this.result()?.status ?? 'UNVALIDATED');
  protected readonly rangeMessage = computed(() => {
    const view = this.anchor();
    return view.kind === 'error' ? view.message : null;
  });
  protected readonly cause = computed(() => {
    switch (this.result()?.cause) {
      case 'INSTALLMENT_MISALIGNMENT':
        return MESSAGES.causeMisalignment;
      case 'UNKNOWN':
        return MESSAGES.causeUnknown;
      default:
        return null;
    }
  });
  protected readonly dueDate = computed(() => dueDateOfInstallment(this.form()().value()));
  protected readonly describedBy = computed(() => {
    const ids = [
      ...(fieldInvalid(this.form().anchorK) ? ['anchorK-errors'] : []),
      ...(this.rangeMessage() === null ? [] : ['anchor-range']),
    ];
    return ids.length === 0 ? null : ids.join(' ');
  });

  protected sourceLabel(source: (typeof REPORTED_BALANCE_SOURCES)[number]): string {
    return SOURCE_LABELS[source];
  }
}
