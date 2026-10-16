import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { form, FormField, FormRoot } from '@angular/forms/signals';
import { buildSchedule, type Money } from '@cuotascasa/domain';
import type { Loan, Uuid } from '@cuotascasa/schema';
import { LOAN_PROJECTION_SERVICE, LOANS_STORE } from '../../../data/tokens.ts';
import { Announcer } from '../../../ui/feedback/announcer.service.ts';
import { FieldErrorsComponent, fieldInvalid } from '../wizard/steps/field-errors.component.ts';
import { WizardStepConditionsComponent } from '../wizard/steps/step-conditions.component.ts';
import { WizardStepFixedChargesComponent } from '../wizard/steps/step-fixed-charges.component.ts';
import { describeError } from '../wizard/wizard-messages.ts';
import {
  type Breakdown,
  CURRENCY_OPTIONS,
  fixedChargeBreakdown,
  initialModel,
  levelOf,
  rederiveFirstDueDate,
  toLoanDraft,
  type WizardModel,
} from '../wizard/wizard-model.ts';
import { wizardSchema } from '../wizard/wizard-rules.ts';
import { bankTotalOf, describeActionError, modelOfLoan, toLoanUpdate } from './loan-detail-model.ts';

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

interface EngineState {
  readonly level: Money | null;
  readonly error: string | null;
}

const NO_ENGINE: EngineState = { level: null, error: null };
const NO_BREAKDOWN: Breakdown = { state: 'none', total: '0.00' as Money, lines: [] };

/**
 * Edit form of one loan (HU-08, R14): the identification fields plus the wizard's step 2 and 3 components, on one
 * Signal Forms model built from the stored loan. Saving updates the loan record only: events, balances, payments and
 * scenarios keep their ids, and the projections recompute from the new terms. The anchor (step 4) is not edited here:
 * it lives in «Datos reales».
 */
@Component({
  selector: 'cc-loan-edit-form',
  imports: [FormRoot, FormField, FieldErrorsComponent, WizardStepConditionsComponent, WizardStepFixedChargesComponent],
  template: `
    @let f = form;
    <form [formRoot]="form" aria-labelledby="edit-title" data-testid="loan-edit-form">
      <h2 #heading id="edit-title" tabindex="-1">Editar condiciones</h2>
      <p class="cc-wiz-hint">
        Al guardar se recalculan las proyecciones con las nuevas condiciones. Tus eventos, saldos y pagos reales no se
        modifican.
      </p>

      <fieldset class="cc-wiz-group">
        <legend>Identificación</legend>
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
        @if (currencyLocked()) {
          <div class="cc-wiz-field" data-testid="currency-locked">
            <span class="cc-wiz-label" id="currency-fixed-label">Moneda</span>
            <span aria-labelledby="currency-fixed-label">{{ currencyLabel() }}</span>
            <p class="cc-wiz-hint">
              La moneda no se puede cambiar: el préstamo ya tiene eventos, saldos, pagos o escenarios.
            </p>
          </div>
        } @else {
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
        }
      </fieldset>

      <fieldset class="cc-wiz-group">
        <legend>Condiciones originales</legend>
        <cc-wizard-step-conditions [form]="form" [engineError]="engine().error" />
      </fieldset>

      <fieldset class="cc-wiz-group">
        <legend>Cargos fijos</legend>
        <cc-wizard-step-fixed-charges
          [form]="form"
          [level]="engine().level"
          [breakdown]="breakdown()"
          [currency]="model().currency"
        />
      </fieldset>

      @if (saveError(); as message) {
        <p class="cc-wiz-issue" role="alert" data-testid="save-error">{{ message }}</p>
      }
      <div class="cc-wiz-actions">
        <button type="button" data-testid="edit-cancel" (click)="cancelled.emit()">Cancelar</button>
        <button type="submit" class="cc-wiz-primary" [disabled]="saving()">Guardar cambios</button>
      </div>
    </form>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoanEditFormComponent {
  private readonly loans = inject(LOANS_STORE);
  private readonly projection = inject(LOAN_PROJECTION_SERVICE);
  private readonly announcer = inject(Announcer);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly loan = input.required<Loan>();
  /** True once the loan has events, balances, payments or scenarios (spec §7): the currency is then fixed. */
  readonly currencyLocked = input.required<boolean>();

  readonly saved = output<Loan>();
  readonly cancelled = output<void>();

  protected readonly currencies = CURRENCY_OPTIONS;
  protected readonly invalid = fieldInvalid;
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);

  /**
   * Filled from the stored loan as soon as the input is bound (a required input cannot be read while the form is
   * built), and only again when another loan is shown: a sync that rewrites this loan never wipes what is typed.
   */
  protected readonly model = signal<WizardModel>(initialModel());
  protected readonly form = form(this.model, wizardSchema, {
    submission: {
      action: () => this.save(),
      onInvalid: (field) => this.afterRender(() => field().errorSummary()[0]?.fieldTree().focusBoundControl()),
    },
  });

  private readonly heading = viewChild.required<ElementRef<HTMLHeadingElement>>('heading');

  protected readonly currencyLabel = computed(
    () => CURRENCY_OPTIONS.find((option) => option.value === this.loan().currency)?.label ?? this.loan().currency,
  );

  private readonly conditions = computed(
    () => {
      const model = this.model();
      return {
        principal: model.principal,
        termMonths: model.termMonths,
        interestRate: model.interestRate,
        rateType: model.rateType,
        paymentDay: model.paymentDay,
        firstDueDate: model.firstDueDate,
        disbursementDate: model.disbursementDate,
        insurance: model.insurance,
        roundingProfile: model.roundingProfile,
        currency: model.currency,
        templateKey: model.templateKey,
      };
    },
    { equal: sameJson },
  );
  private readonly conditionFields = [
    this.form.principal,
    this.form.termMonths,
    this.form.interestRate,
    this.form.rateType,
    this.form.paymentDay,
    this.form.firstDueDate,
    this.form.disbursementDate,
    this.form.insurance,
    this.form.roundingProfile,
  ];
  private readonly conditionsValid = computed(() => this.conditionFields.every((field) => field().valid()));

  /** Level of the edited conditions and the typed engine error, if any ([ALG.LEVEL], [ALG.TERM]). */
  protected readonly engine = computed<EngineState>(() => {
    this.conditions();
    if (!this.conditionsValid()) return NO_ENGINE;
    const model = untracked(this.model);
    try {
      const level = levelOf(model);
      buildSchedule(this.projection.toLoanTerms(toLoanDraft(model, [])));
      return { level, error: null };
    } catch (error) {
      return { level: null, error: describeError(error) };
    }
  });

  private readonly chargeInputs = computed(
    () => ({ bankTotal: this.model().bankTotal, charges: this.model().charges }),
    { equal: sameJson },
  );

  /** [ALG.TEMPLATES.FIXED] Bank total − level, with the named lines that will be stored. */
  protected readonly breakdown = computed<Breakdown>(() => {
    this.chargeInputs();
    const level = this.engine().level;
    if (level === null) return NO_BREAKDOWN;
    try {
      return fixedChargeBreakdown(untracked(this.model), level);
    } catch {
      return NO_BREAKDOWN;
    }
  });

  private loadedId: Uuid | null = null;
  private lastPaymentDay: string | null = null;
  /** The bank total this component last wrote; a different value means the user typed one. */
  private autoBankTotal: string | null = null;

  constructor() {
    afterNextRender(() => this.heading().nativeElement.focus(), { injector: this.injector });
    effect(() => {
      const id = this.loan().id;
      untracked(() => {
        if (this.loadedId === id) return;
        this.loadedId = id;
        const model = modelOfLoan(this.loan());
        this.lastPaymentDay = model.paymentDay;
        this.autoBankTotal = null;
        this.model.set(model);
      });
    });
    // [ALG.DATES] Changing paymentDay re-derives the day of firstDueDate.
    effect(() => {
      const paymentDay = this.model().paymentDay;
      untracked(() => {
        if (this.lastPaymentDay === null) {
          this.lastPaymentDay = paymentDay;
          return;
        }
        if (paymentDay === this.lastPaymentDay) return;
        this.lastPaymentDay = paymentDay;
        const next = rederiveFirstDueDate(this.model().firstDueDate, paymentDay);
        if (next !== this.model().firstDueDate) this.model.update((model) => ({ ...model, firstDueDate: next }));
      });
    });
    // The stored loan keeps its named fixed charges: while the user does not type a bank total, it follows the level,
    // so editing the principal or the term does not turn the unchanged charges into a mismatch.
    effect(() => {
      const level = this.engine().level;
      untracked(() => {
        const model = this.model();
        if (level === null || model.charges.length === 0) return;
        this.autoBankTotal ??= model.bankTotal;
        if (model.bankTotal !== this.autoBankTotal) return;
        const next = bankTotalOf(level, model.charges);
        this.autoBankTotal = next;
        if (next !== model.bankTotal) this.model.update((current) => ({ ...current, bankTotal: next }));
      });
    });
  }

  /** Runs after `form.submission` validated every field: only the engine-level checks are left. */
  private async save(): Promise<undefined> {
    if (this.saving()) return undefined;
    const breakdown = this.breakdown();
    if (
      this.engine().error !== null ||
      this.engine().level === null ||
      breakdown.state === 'negative' ||
      breakdown.state === 'mismatch'
    ) {
      this.afterRender(() => this.host.nativeElement.querySelector<HTMLElement>('[data-wizard-issue]')?.focus());
      return undefined;
    }
    this.saving.set(true);
    this.saveError.set(null);
    try {
      const updated = await this.loans.update(toLoanUpdate(this.loan(), this.model(), breakdown.lines));
      void this.announcer.polite('Cambios guardados. Las proyecciones se recalcularon con las nuevas condiciones.');
      this.saved.emit(updated);
    } catch (error) {
      this.saveError.set(describeActionError(error));
    } finally {
      this.saving.set(false);
    }
    return undefined;
  }

  private afterRender(action: () => void): void {
    afterNextRender(action, { injector: this.injector });
  }
}
