import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
  untracked,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { form, FormRoot } from '@angular/forms/signals';
import { Router } from '@angular/router';
import {
  buildSchedule,
  InvalidInputError,
  type LoanTerms,
  type Money,
  parseLocalDate,
  validateAgainstReportedBalance,
} from '@cuotascasa/domain';
import { LOAN_PROJECTION_SERVICE, LOANS_STORE } from '../../../data/tokens.ts';
import { WizardStepAnchorComponent } from './steps/step-anchor.component.ts';
import { WizardStepConditionsComponent } from './steps/step-conditions.component.ts';
import { WizardStepFixedChargesComponent } from './steps/step-fixed-charges.component.ts';
import { WizardStepTemplateComponent } from './steps/step-template.component.ts';
import { describeError, MESSAGES } from './wizard-messages.ts';
import {
  type AnchorView,
  applyTemplate,
  type Breakdown,
  DEFAULT_TEMPLATE_KEY,
  dueDateOfInstallment,
  fixedChargeBreakdown,
  initialModel,
  levelOf,
  localDateOf,
  moneyOf,
  parsePositiveInt,
  rederiveFirstDueDate,
  toAnchorDraft,
  toLoanDraft,
  type WizardModel,
} from './wizard-model.ts';
import { stepFields, WIZARD_STEPS, type WizardStep, wizardSchema } from './wizard-rules.ts';
import { WIZARD_STYLES } from './wizard-styles.ts';

const STEP_TITLES: Readonly<Record<WizardStep, string>> = {
  1: 'Plantilla y banco',
  2: 'Condiciones originales',
  3: 'Cargos fijos',
  4: 'Saldo real y validación',
};

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

interface EngineState {
  readonly level: Money | null;
  readonly error: string | null;
}

const NO_ENGINE: EngineState = { level: null, error: null };
const NO_BREAKDOWN: Breakdown = { state: 'none', total: '0.00' as Money, lines: [] };

/**
 * Loan creation wizard (HU-03, HU-04, HU-05; spec §9 «Asistente»). One Signal Forms model for the four steps; each
 * intermediate step is its own `<form novalidate>` whose «Siguiente» checks only that step's fields; the last step
 * saves through `[formRoot]`. The page keeps data-testid='page-loan-new'.
 */
@Component({
  selector: 'cc-loan-wizard-page',
  imports: [
    FormRoot,
    WizardStepTemplateComponent,
    WizardStepConditionsComponent,
    WizardStepFixedChargesComponent,
    WizardStepAnchorComponent,
  ],
  template: `
    <h1>Nuevo préstamo</h1>
    <ol class="cc-wiz-steps" aria-label="Pasos del asistente">
      @for (item of steps; track item) {
        <li [attr.aria-current]="item === step() ? 'step' : null" [class.current]="item === step()">
          <span class="num" aria-hidden="true">{{ item }}</span>
          <span>{{ titleOf(item) }}</span>
        </li>
      }
    </ol>
    <h2 #stepHeading id="wizard-step-title" tabindex="-1">Paso {{ step() }} de 4 · {{ titleOf(step()) }}</h2>
    <p class="sr-only" aria-live="polite">{{ announcement() }}</p>

    @switch (step()) {
      @case (1) {
        <form novalidate aria-labelledby="wizard-step-title" (submit)="next($event)">
          <cc-wizard-step-template [form]="form" />
          <div class="cc-wiz-actions">
            <button type="submit" class="cc-wiz-primary">Siguiente →</button>
          </div>
        </form>
      }
      @case (2) {
        <form novalidate aria-labelledby="wizard-step-title" (submit)="next($event)">
          <cc-wizard-step-conditions [form]="form" [engineError]="engine().error" />
          <div class="cc-wiz-actions">
            <button type="button" (click)="back()">← Atrás</button>
            <button type="submit" class="cc-wiz-primary">Siguiente →</button>
          </div>
        </form>
      }
      @case (3) {
        <form novalidate aria-labelledby="wizard-step-title" (submit)="next($event)">
          <cc-wizard-step-fixed-charges
            [form]="form"
            [level]="engine().level"
            [breakdown]="breakdown()"
            [currency]="model().currency"
          />
          <div class="cc-wiz-actions">
            <button type="button" (click)="back()">← Atrás</button>
            <button type="submit" class="cc-wiz-primary">Siguiente →</button>
          </div>
        </form>
      }
      @case (4) {
        <form [formRoot]="form" aria-labelledby="wizard-step-title">
          <cc-wizard-step-anchor [form]="form" [anchor]="anchor()" [currency]="model().currency" />
          @if (saveError(); as message) {
            <p class="cc-wiz-issue" role="alert" data-testid="save-error">{{ message }}</p>
          }
          <div class="cc-wiz-actions">
            <button type="button" (click)="back()">← Atrás</button>
            <button type="submit" class="cc-wiz-primary" [disabled]="saving()">Guardar préstamo</button>
          </div>
        </form>
      }
    }
  `,
  styles: WIZARD_STYLES,
  encapsulation: ViewEncapsulation.None,
  host: { 'data-testid': 'page-loan-new' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoanWizardPageComponent {
  private readonly loans = inject(LOANS_STORE);
  private readonly projection = inject(LOAN_PROJECTION_SERVICE);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  protected readonly steps = WIZARD_STEPS;
  protected readonly step = signal<WizardStep>(1);
  /** Empty until the first step change: nothing is announced on load. */
  protected readonly announcement = signal('');
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly model = signal<WizardModel>(initialModel());
  protected readonly form = form(this.model, wizardSchema, {
    submission: {
      action: () => this.save(),
      onInvalid: (field) => this.afterRender(() => field().errorSummary()[0]?.fieldTree().focusBoundControl()),
    },
  });

  private readonly stepHeading = viewChild.required<ElementRef<HTMLHeadingElement>>('stepHeading');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Step-2 inputs only, so typing in later steps never recomputes the engine preview. */
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
  private readonly step2Valid = computed(() => stepFields(this.form, 2).every((field) => field().valid()));

  /** Level of the step-2 conditions and the typed engine error, if any ([ALG.LEVEL], [ALG.TERM]). */
  protected readonly engine = computed<EngineState>(() => {
    this.conditions();
    if (!this.step2Valid()) return NO_ENGINE;
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

  private readonly finalTerms = computed<LoanTerms | null>(() => {
    const breakdown = this.breakdown();
    if (this.engine().level === null || (breakdown.state !== 'none' && breakdown.state !== 'ok')) return null;
    try {
      return this.projection.toLoanTerms(toLoanDraft(untracked(this.model), breakdown.lines));
    } catch {
      return null;
    }
  });

  /** [ALG.VALIDATE] The traffic light of the optional anchor against the original plan. */
  protected readonly anchor = computed<AnchorView>(() => {
    const model = this.model();
    const balance = moneyOf(model.anchorBalance);
    if (balance === null) return { kind: 'none' };
    const terms = this.finalTerms();
    const k = /^\d+$/.test(model.anchorK.trim()) ? Number(model.anchorK.trim()) : null;
    if (terms === null || k === null) return { kind: 'pending' };
    try {
      const result = validateAgainstReportedBalance({
        terms,
        realEvents: [],
        reported: {
          type: 'ReportedBalance',
          id: 'wizard-anchor',
          date: localDateOf(model.anchorDate) ?? parseLocalDate(model.firstDueDate),
          balance,
          installmentNumber: k,
        },
      });
      return { kind: 'result', result };
    } catch (error) {
      if (error instanceof InvalidInputError && error.code === 'INSTALLMENT_OUT_OF_RANGE') {
        return { kind: 'error', message: describeError(error, parsePositiveInt(model.termMonths) ?? undefined) };
      }
      return { kind: 'error', message: describeError(error) };
    }
  });

  private appliedTemplate = DEFAULT_TEMPLATE_KEY;
  private lastPaymentDay = this.model().paymentDay;
  private lastAutoDate = '';

  constructor() {
    // Choosing another template copies its values into the model ([ALG.TEMPLATES]).
    effect(() => {
      const key = this.model().templateKey;
      untracked(() => {
        if (key === this.appliedTemplate) return;
        this.appliedTemplate = key;
        try {
          this.model.update((model) => applyTemplate(model, key));
        } catch {
          // An unknown key is reported by the templateKey rule; the model keeps its values.
        }
      });
    });
    // [ALG.DATES] Changing paymentDay re-derives the day of firstDueDate.
    effect(() => {
      const paymentDay = this.model().paymentDay;
      untracked(() => {
        if (paymentDay === this.lastPaymentDay) return;
        this.lastPaymentDay = paymentDay;
        const next = rederiveFirstDueDate(this.model().firstDueDate, paymentDay);
        if (next !== this.model().firstDueDate) this.model.update((model) => ({ ...model, firstDueDate: next }));
      });
    });
    // The anchor date defaults to the due date of k and stays editable.
    effect(() => {
      const model = this.model();
      const due = dueDateOfInstallment(model);
      untracked(() => {
        if (due === null || due === model.anchorDate) return;
        if (model.anchorDate === '' || model.anchorDate === this.lastAutoDate) {
          this.lastAutoDate = due;
          this.model.update((current) => ({ ...current, anchorDate: due }));
        }
      });
    });
  }

  protected titleOf(step: WizardStep): string {
    return STEP_TITLES[step];
  }

  /** «Siguiente» and Enter on steps 1 to 3: validates only the step's fields and its engine-level issues. */
  protected next(event: SubmitEvent): void {
    event.preventDefault();
    const step = this.step();
    const fields = stepFields(this.form, step);
    for (const field of fields) field().markAsTouched();
    const invalid = fields.find((field) => field().invalid());
    if (invalid !== undefined) {
      this.afterRender(() => invalid().errorSummary()[0]?.fieldTree().focusBoundControl());
    } else if (this.issue(step)) {
      this.afterRender(() => this.host.nativeElement.querySelector<HTMLElement>('[data-wizard-issue]')?.focus());
    } else {
      this.goTo((step + 1) as WizardStep);
    }
  }

  protected back(): void {
    this.goTo((this.step() - 1) as WizardStep);
  }

  /** Engine-level blockers that the field rules cannot see. */
  private issue(step: WizardStep): boolean {
    switch (step) {
      case 2:
        return this.engine().error !== null;
      case 3: {
        const state = this.breakdown().state;
        return state === 'negative' || state === 'mismatch';
      }
      default:
        return false;
    }
  }

  private goTo(step: WizardStep): void {
    this.step.set(step);
    this.announcement.set(`Paso ${String(step)} de 4`);
    this.afterRender(() => this.stepHeading().nativeElement.focus());
  }

  /** Runs after `form.submission` validated every field: only the engine-level checks are left. */
  private async save(): Promise<undefined> {
    if (this.saving()) return undefined;
    const anchor = this.anchor();
    const breakdown = this.breakdown();
    if (anchor.kind === 'error') {
      this.afterRender(() => this.host.nativeElement.querySelector<HTMLElement>('#anchorK')?.focus());
      return undefined;
    }
    if (this.engine().error !== null || (breakdown.state !== 'none' && breakdown.state !== 'ok')) {
      this.saveError.set(MESSAGES.saveFailed);
      return undefined;
    }
    this.saving.set(true);
    this.saveError.set(null);
    try {
      const model = this.model();
      const draft = toLoanDraft(model, breakdown.lines);
      const loan =
        model.anchorBalance === ''
          ? await this.loans.create(draft)
          : (await this.loans.createWithAnchor(draft, toAnchorDraft(model))).loan;
      await this.router.navigate(['/app', 'prestamos', loan.id]);
    } catch (error) {
      this.saveError.set(describeError(error));
    } finally {
      this.saving.set(false);
    }
    return undefined;
  }

  /** Focus moves after the view shows the new step or the error, so a screen reader reads the updated state. */
  private afterRender(action: () => void): void {
    afterNextRender(action, { injector: this.injector });
  }
}
