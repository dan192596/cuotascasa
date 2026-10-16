import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { type FieldTree, FormField } from '@angular/forms/signals';
import type { Currency, Money } from '@cuotascasa/domain';
import { MoneyPipe } from '../../../../ui/format/money.pipe.ts';
import { MoneyInputComponent } from '../../../../ui/money-input/money-input.component.ts';
import { MESSAGES } from '../wizard-messages.ts';
import { type Breakdown, MAX_CHARGE_ROWS, type WizardModel } from '../wizard-model.ts';
import { FieldErrorsComponent, fieldInvalid } from './field-errors.component.ts';

/** Step 3 · cargos fijos: bank total − level, with an optional named breakdown. */
@Component({
  selector: 'cc-wizard-step-fixed-charges',
  imports: [FormField, FieldErrorsComponent, MoneyInputComponent, MoneyPipe],
  template: `
    @let f = form();
    <div class="cc-wiz-field">
      <label for="bankTotal">Cuota total que cobra el banco (opcional)</label>
      <cc-money-input inputId="bankTotal" [currency]="currency()" [formField]="f.bankTotal" />
      <p class="cc-wiz-hint">Déjala vacía si el préstamo no tiene cargos fijos (IUSI, seguro de daños).</p>
    </div>
    <dl class="cc-wiz-summary">
      <dt>Cuota nivelada (calculada)</dt>
      <dd data-testid="level">{{ level() | money: currency() }}</dd>
      <dt>Cargos fijos</dt>
      <dd data-testid="fixed-total">{{ breakdown().total | money: currency() }}</dd>
    </dl>
    @if (issue(); as message) {
      <p class="cc-wiz-issue" role="alert" tabindex="-1" data-wizard-issue data-testid="fixed-error">{{ message }}</p>
    }

    <fieldset class="cc-wiz-group">
      <legend>Conceptos (opcional)</legend>
      @for (row of f.charges; track $index) {
        <div class="cc-wiz-row">
          <div class="cc-wiz-field">
            <label [for]="'charge-' + $index + '-label'">Concepto {{ $index + 1 }}</label>
            <input
              type="text"
              autocomplete="off"
              [id]="'charge-' + $index + '-label'"
              [formField]="row.label"
              [attr.aria-invalid]="invalid(row.label)"
              [attr.aria-describedby]="invalid(row.label) ? 'charge-' + $index + '-label-errors' : null"
            />
            <cc-wizard-errors [id]="'charge-' + $index + '-label-errors'" [field]="row.label" />
          </div>
          <div class="cc-wiz-field">
            <label [for]="'charge-' + $index + '-amount'">Monto {{ $index + 1 }}</label>
            <cc-money-input
              [inputId]="'charge-' + $index + '-amount'"
              [currency]="currency()"
              [formField]="row.amount"
            />
          </div>
          <button
            type="button"
            class="cc-wiz-link"
            [attr.aria-label]="'Quitar concepto ' + ($index + 1)"
            (click)="removeCharge($index)"
          >
            Quitar
          </button>
        </div>
      }
      @if (canAdd()) {
        <button type="button" class="cc-wiz-secondary" (click)="addCharge()">Agregar concepto</button>
      }
    </fieldset>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WizardStepFixedChargesComponent {
  readonly form = input.required<FieldTree<WizardModel>>();
  /** Level installment of the step-2 conditions; null while they are not valid. */
  readonly level = input.required<Money | null>();
  readonly breakdown = input.required<Breakdown>();
  readonly currency = input.required<Currency>();

  protected readonly invalid = fieldInvalid;
  protected readonly canAdd = computed(() => this.form()().value().charges.length < MAX_CHARGE_ROWS);
  protected readonly issue = computed(() => {
    switch (this.breakdown().state) {
      case 'negative':
        return MESSAGES.fixedChargesNegative;
      case 'mismatch':
        return MESSAGES.fixedChargesMismatch;
      default:
        return null;
    }
  });

  protected removeCharge(index: number): void {
    this.form()().value.update((model) => ({
      ...model,
      charges: model.charges.filter((_, position) => position !== index),
    }));
  }

  protected addCharge(): void {
    this.form()().value.update((model) => ({ ...model, charges: [...model.charges, { label: '', amount: '' }] }));
  }
}
