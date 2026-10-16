import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { type FieldTree, FormField } from '@angular/forms/signals';
import { DateInputComponent } from '../../../../ui/money-input/date-input.component.ts';
import { MoneyInputComponent } from '../../../../ui/money-input/money-input.component.ts';
import { RateInputComponent } from '../../../../ui/money-input/rate-input.component.ts';
import {
  INSURANCE_LABELS,
  MAX_INSURANCE_ROWS,
  PAYMENT_DAY_OPTIONS,
  RATE_TYPE_OPTIONS,
  ROUNDING_PROFILE_OPTIONS,
  type WizardModel,
} from '../wizard-model.ts';
import { FieldErrorsComponent, fieldInvalid } from './field-errors.component.ts';

/** Step 2 · condiciones originales. `engineError` is the Spanish text of a typed engine error, or null. */
@Component({
  selector: 'cc-wizard-step-conditions',
  imports: [FormField, FieldErrorsComponent, MoneyInputComponent, RateInputComponent, DateInputComponent],
  template: `
    @let f = form();
    <div class="cc-wiz-field">
      <label for="principal">Monto del préstamo</label>
      <cc-money-input inputId="principal" [currency]="f.currency().value()" [formField]="f.principal" />
    </div>
    <div class="cc-wiz-field">
      <label for="termMonths">Plazo (meses)</label>
      <input
        id="termMonths"
        type="text"
        inputmode="numeric"
        autocomplete="off"
        [formField]="f.termMonths"
        [attr.aria-invalid]="invalid(f.termMonths)"
        [attr.aria-describedby]="invalid(f.termMonths) ? 'termMonths-errors' : null"
      />
      <cc-wizard-errors id="termMonths-errors" [field]="f.termMonths" />
    </div>
    <div class="cc-wiz-field">
      <label for="interestRate">Tasa de interés original del contrato</label>
      <div role="group" aria-describedby="interestRate-hint">
        <cc-rate-input inputId="interestRate" [formField]="f.interestRate" />
      </div>
      <p class="cc-wiz-hint" id="interestRate-hint">
        Es la tasa vigente al desembolso. Los cambios posteriores se registran después como cambios de tasa.
      </p>
    </div>
    <div class="cc-wiz-field">
      <label for="rateType">Tipo de tasa</label>
      <select
        id="rateType"
        [formField]="f.rateType"
        [attr.aria-invalid]="invalid(f.rateType)"
        [attr.aria-describedby]="invalid(f.rateType) ? 'rateType-errors' : null"
      >
        <option value="">Elige el tipo de tasa</option>
        @for (option of rateTypes; track option.value) {
          <option [value]="option.value">{{ option.label }}</option>
        }
      </select>
      <cc-wizard-errors id="rateType-errors" [field]="f.rateType" />
    </div>
    <div class="cc-wiz-field">
      <label for="paymentDay">Día de pago</label>
      <select
        id="paymentDay"
        [formField]="f.paymentDay"
        [attr.aria-invalid]="invalid(f.paymentDay)"
        [attr.aria-describedby]="invalid(f.paymentDay) ? 'paymentDay-errors' : null"
      >
        <option value="">Elige el día de pago</option>
        @for (option of paymentDays; track option.value) {
          <option [value]="option.value">{{ option.label }}</option>
        }
      </select>
      <cc-wizard-errors id="paymentDay-errors" [field]="f.paymentDay" />
    </div>
    <div class="cc-wiz-field">
      <label for="firstDueDate">Fecha de la primera cuota</label>
      <div role="group" aria-describedby="firstDueDate-hint">
        <cc-date-input inputId="firstDueDate" placeholder="dd/mm/aaaa" [formField]="f.firstDueDate" />
      </div>
      <p class="cc-wiz-hint" id="firstDueDate-hint">
        Su día debe coincidir con el día de pago; al cambiar el día de pago se ajusta sola.
      </p>
    </div>
    <div class="cc-wiz-field">
      <label for="disbursementDate">Fecha de desembolso (informativa)</label>
      <cc-date-input inputId="disbursementDate" placeholder="dd/mm/aaaa" [formField]="f.disbursementDate" />
    </div>

    <fieldset class="cc-wiz-group">
      <legend>Seguros (% anual sobre saldo)</legend>
      @for (row of f.insurance; track $index) {
        <div class="cc-wiz-row">
          <div class="cc-wiz-field">
            <label [for]="'insurance-' + $index + '-rate'">{{ labelOf(row.kind().value()) }}</label>
            <cc-rate-input [inputId]="'insurance-' + $index + '-rate'" [formField]="row.rate" />
          </div>
          <button
            type="button"
            class="cc-wiz-link"
            [attr.data-testid]="'insurance-remove-' + $index"
            [attr.aria-label]="'Quitar ' + labelOf(row.kind().value())"
            (click)="removeInsurance($index)"
          >
            Quitar
          </button>
        </div>
      } @empty {
        <p class="cc-wiz-hint">Sin seguros porcentuales.</p>
      }
      @if (canAddInsurance()) {
        <button type="button" class="cc-wiz-secondary" (click)="addInsurance()">Agregar otro seguro %</button>
      }
    </fieldset>

    <div class="cc-wiz-field">
      <label for="roundingProfile">Perfil de redondeo</label>
      <select
        id="roundingProfile"
        [formField]="f.roundingProfile"
        [attr.aria-invalid]="invalid(f.roundingProfile)"
        [attr.aria-describedby]="invalid(f.roundingProfile) ? 'roundingProfile-errors' : null"
      >
        @for (option of roundingProfiles; track option.value) {
          <option [value]="option.value">{{ option.label }}</option>
        }
      </select>
      <cc-wizard-errors id="roundingProfile-errors" [field]="f.roundingProfile" />
    </div>

    @if (engineError(); as message) {
      <p class="cc-wiz-issue" role="alert" tabindex="-1" data-wizard-issue data-testid="engine-error">{{ message }}</p>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WizardStepConditionsComponent {
  readonly form = input.required<FieldTree<WizardModel>>();
  readonly engineError = input<string | null>(null);

  protected readonly rateTypes = RATE_TYPE_OPTIONS;
  protected readonly paymentDays = PAYMENT_DAY_OPTIONS;
  protected readonly roundingProfiles = ROUNDING_PROFILE_OPTIONS;
  protected readonly invalid = fieldInvalid;
  protected readonly canAddInsurance = computed(() => this.form()().value().insurance.length < MAX_INSURANCE_ROWS);

  protected labelOf(kind: keyof typeof INSURANCE_LABELS): string {
    return INSURANCE_LABELS[kind];
  }

  protected removeInsurance(index: number): void {
    this.form()().value.update((model) => ({
      ...model,
      insurance: model.insurance.filter((_, position) => position !== index),
    }));
  }

  protected addInsurance(): void {
    this.form()().value.update((model) => ({
      ...model,
      insurance: [...model.insurance, { kind: 'other', rate: '' }],
    }));
  }
}
