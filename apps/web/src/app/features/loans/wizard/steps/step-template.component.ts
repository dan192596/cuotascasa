import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { type FieldTree, FormField } from '@angular/forms/signals';
import { CURRENCY_OPTIONS, templateOptions, type WizardModel } from '../wizard-model.ts';
import { FieldErrorsComponent, fieldInvalid } from './field-errors.component.ts';

/** Step 1 · plantilla y banco. Reusable: it only needs a Signal Forms tree of the wizard model. */
@Component({
  selector: 'cc-wizard-step-template',
  imports: [FormField, FieldErrorsComponent],
  template: `
    @let f = form();
    <div class="cc-wiz-field">
      <label for="template">Plantilla</label>
      <select
        id="template"
        [formField]="f.templateKey"
        [attr.aria-invalid]="invalid(f.templateKey)"
        [attr.aria-describedby]="invalid(f.templateKey) ? 'template-errors' : null"
      >
        @for (option of templates; track option.value) {
          <option [value]="option.value">{{ option.label }}</option>
        }
      </select>
      <cc-wizard-errors id="template-errors" [field]="f.templateKey" />
      <p class="cc-wiz-hint">
        La plantilla copia sus valores al préstamo; después puedes editarlos y la plantilla no cambia.
      </p>
    </div>
    <div class="cc-wiz-field">
      <label for="name">Alias</label>
      <input
        id="name"
        type="text"
        autocomplete="off"
        [formField]="f.name"
        [attr.aria-invalid]="invalid(f.name)"
        [attr.aria-describedby]="invalid(f.name) ? 'name-errors' : null"
      />
      <cc-wizard-errors id="name-errors" [field]="f.name" />
    </div>
    <div class="cc-wiz-field">
      <label for="bank">Banco</label>
      <input
        id="bank"
        type="text"
        autocomplete="off"
        [formField]="f.bank"
        [attr.aria-invalid]="invalid(f.bank)"
        [attr.aria-describedby]="invalid(f.bank) ? 'bank-errors' : null"
      />
      <cc-wizard-errors id="bank-errors" [field]="f.bank" />
    </div>
    <div class="cc-wiz-field">
      <label for="currency">Moneda</label>
      <select
        id="currency"
        [formField]="f.currency"
        [attr.aria-invalid]="invalid(f.currency)"
        [attr.aria-describedby]="invalid(f.currency) ? 'currency-errors' : null"
      >
        @for (option of currencies; track option.value) {
          <option [value]="option.value">{{ option.label }}</option>
        }
      </select>
      <cc-wizard-errors id="currency-errors" [field]="f.currency" />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WizardStepTemplateComponent {
  readonly form = input.required<FieldTree<WizardModel>>();
  protected readonly templates = templateOptions();
  protected readonly currencies = CURRENCY_OPTIONS;
  protected readonly invalid = fieldInvalid;
}
