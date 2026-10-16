import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  Injector,
  input,
  linkedSignal,
  output,
  signal,
  untracked,
} from '@angular/core';
import { applyEach, type FieldTree, form, FormField, FormRoot, required, validate } from '@angular/forms/signals';
import type { Loan, PrepaymentMode, RateChangePolicy, ReportedBalanceSource, Uuid } from '@cuotascasa/schema';
import type { ActualPaymentDraft, LoanEventDraft, ReportedBalanceDraft } from '../../../data/api.ts';
import { BannerComponent } from '../../../ui/feedback/banner.component.ts';
import { DateInputComponent } from '../../../ui/money-input/date-input.component.ts';
import { MoneyInputComponent } from '../../../ui/money-input/money-input.component.ts';
import { RateInputComponent } from '../../../ui/money-input/rate-input.component.ts';
import {
  buildValue,
  dateBounds,
  dateError,
  fieldApplies,
  initialModel,
  integerError,
  type ModelField,
  moneyError,
  suggestInstallment,
} from './event-form.logic.ts';
import { FieldErrorsComponent } from './field-errors.component.ts';

/** The six real-data forms (spec §9 «Datos reales»; W0-04 entity types). */
export const EVENT_FORM_KINDS = [
  'ReportedBalance',
  'ActualPayment',
  'RateChange',
  'FixedChargeChange',
  'Prepayment',
  'AdvanceInstallments',
] as const;
export type EventFormKind = (typeof EVENT_FORM_KINDS)[number];

/** Loan context the form needs to validate dates and suggest installments ([ALG.EVENTS.ANCHOR], [ALG.TERMS]). */
export type EventFormContext = Pick<
  Loan,
  'currency' | 'rateType' | 'disbursementDate' | 'firstDueDate' | 'paymentDay'
> & {
  readonly loanId: Uuid;
  /** realEndDate of the loan: dates after it are rejected. */
  readonly endDate: string;
};

/** What the form emits: a draft that parses with its W0-04 entity schema once stamped. */
export type EventFormValue =
  | { readonly entity: 'ReportedBalance'; readonly draft: ReportedBalanceDraft }
  | { readonly entity: 'ActualPayment'; readonly draft: ActualPaymentDraft }
  | { readonly entity: 'LoanEvent'; readonly draft: LoanEventDraft };

const KIND_TITLES: Readonly<Record<EventFormKind, string>> = {
  ReportedBalance: 'Saldo reportado por el banco',
  ActualPayment: 'Pago real',
  RateChange: 'Cambio de tasa',
  FixedChargeChange: 'Cambio de cargos fijos',
  Prepayment: 'Abono a capital',
  AdvanceInstallments: 'Adelantar cuotas',
};

const DATE_LABELS: Readonly<Record<EventFormKind, string>> = {
  ReportedBalance: 'Fecha del saldo',
  ActualPayment: 'Fecha de pago',
  RateChange: 'Fecha de vigencia de la nueva tasa',
  FixedChargeChange: 'Fecha de vigencia de los cargos',
  Prepayment: 'Fecha del abono',
  AdvanceInstallments: 'Fecha del adelanto',
};

/** Spanish names of the fields, for the rare failure the entity schema reports after the field rules passed. */
const FIELD_LABELS: Readonly<Partial<Record<ModelField, string>>> = {
  date: 'Fecha',
  installmentNumber: 'Cuota',
  balance: 'Saldo',
  totalInstallment: 'Cuota total',
  reportedRate: 'Tasa informada',
  source: 'Origen del saldo',
  total: 'Monto pagado',
  breakdown: 'Desglose del pago',
  policy: 'Qué hace el cálculo con la cuota',
  interestRate: 'Nueva tasa',
  bankInstallment: 'Cuota del banco',
  fixedCharges: 'Cargos fijos',
  amount: 'Monto',
  mode: 'Qué reduce el abono',
  commissionKind: 'Comisión',
  commissionAmount: 'Monto de la comisión',
  commissionRate: 'Porcentaje de comisión',
  count: 'Cuántas cuotas',
  note: 'Nota',
};

const SOURCE_OPTIONS: readonly { readonly value: ReportedBalanceSource; readonly label: string }[] = [
  { value: 'BANK_EMAIL', label: 'Correo del banco' },
  { value: 'ONLINE_BANKING', label: 'Banca en línea' },
  { value: 'BANK_SCHEDULE', label: 'Tabla de cuotas del banco' },
  { value: 'OTHER', label: 'Otro' },
];

const POLICY_OPTIONS: readonly { readonly value: RateChangePolicy; readonly label: string; readonly help: string }[] = [
  {
    value: 'RECALC_INSTALLMENT_KEEP_TERM',
    label: 'Recalcular la cuota y mantener el plazo',
    help: 'La cuota se recalcula con la nueva tasa. El plazo restante no cambia. Es la opción habitual.',
  },
  {
    value: 'KEEP_INSTALLMENT_ADJUST_TERM',
    label: 'Mantener la cuota y ajustar el plazo',
    help: 'La cuota nivelada sigue igual y el plazo se acorta o se alarga según la nueva tasa.',
  },
  {
    value: 'BANK_INSTALLMENT',
    label: 'Usar la cuota que informa el banco',
    help: 'Escribes la cuota nivelada que te indicó el banco. El plazo resulta de ese valor y de la nueva tasa.',
  },
];

const MODE_OPTIONS: readonly { readonly value: PrepaymentMode; readonly label: string }[] = [
  { value: 'REDUCE_TERM', label: 'Reducir el plazo (la cuota sigue igual)' },
  { value: 'REDUCE_INSTALLMENT', label: 'Reducir la cuota (el plazo sigue igual)' },
];

const MAX_CHARGES = 20;
const ZERO_RATE = /^0(\.0+)?$/;

let nextInstance = 0;

function problem(message: string | undefined): { kind: string; message: string } | undefined {
  return message === undefined ? undefined : { kind: 'event-form', message };
}

/**
 * Short Signal Forms form per real-data event family (R4, R16; HU-09 to HU-12). Pure: it reads the loan context and an
 * optional existing DTO, and emits a DTO that parses with its W0-04 entity schema, or a cancel. It never writes stores.
 */
@Component({
  selector: 'cc-event-form',
  imports: [
    FormField,
    FormRoot,
    BannerComponent,
    DateInputComponent,
    MoneyInputComponent,
    RateInputComponent,
    FieldErrorsComponent,
  ],
  templateUrl: './event-form.component.html',
  styles: `
    :host {
      display: block;
    }
    .event-form {
      display: grid;
      gap: 1rem;
    }
    .field {
      display: grid;
      gap: 0.25rem;
    }
    .group {
      display: grid;
      gap: 0.75rem;
      border: 1px solid var(--cc-color-border);
      border-radius: 0.375rem;
      padding: 0.75rem;
    }
    .hint {
      margin: 0;
      color: var(--cc-color-ink-muted);
    }
    .radio {
      display: grid;
      gap: 0.125rem;
    }
    .charge {
      display: grid;
      gap: 0.5rem;
    }
    .failure {
      margin: 0;
      color: var(--cc-color-danger);
    }
    .actions {
      display: flex;
      gap: 0.75rem;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventFormComponent {
  readonly kind = input.required<EventFormKind>();
  readonly context = input.required<EventFormContext>();
  /** Existing record to edit, or null to create. */
  readonly value = input<EventFormValue | null>(null);
  readonly submitted = output<EventFormValue>();
  readonly cancelled = output<void>();

  protected readonly sourceOptions = SOURCE_OPTIONS;
  protected readonly policyOptions = POLICY_OPTIONS;
  protected readonly modeOptions = MODE_OPTIONS;
  protected readonly maxCharges = MAX_CHARGES;

  /** Reset whenever the kind or the edited value changes. */
  protected readonly model = linkedSignal(() => initialModel(this.kind(), this.value()));
  /** True once the user chose the installment (or edits a saved payment): the date no longer suggests one. */
  protected readonly installmentEdited = linkedSignal(() => this.kind() === 'ActualPayment' && this.value() !== null);
  /** Name of the field the entity schema rejected after every field rule passed; null otherwise. */
  protected readonly failure = signal<string | null>(null);

  protected readonly title = computed(() => KIND_TITLES[this.kind()]);
  protected readonly dateLabel = computed(() => DATE_LABELS[this.kind()]);
  protected readonly currencyName = computed(() => (this.context().currency === 'USD' ? 'US$' : 'Q'));

  private readonly bounds = computed(() => dateBounds(this.context()));
  private readonly injector = inject(Injector);
  private readonly uid = `ef${++nextInstance}`;

  protected readonly form = form(
    this.model,
    (path) => {
      const applies = (field: ModelField): boolean => fieldApplies(this.kind(), field);

      required(path.date, { message: 'Escribe la fecha.' });
      validate(path.date, ({ value }) => (value() === '' ? undefined : problem(dateError(value(), this.bounds()))));

      required(path.installmentNumber, {
        message: 'Indica a qué cuota corresponde el pago.',
        when: () => this.kind() === 'ActualPayment',
      });
      validate(path.installmentNumber, ({ value }) =>
        applies('installmentNumber') && value() !== '' ? problem(integerError(value(), 1, 1200)) : undefined,
      );

      required(path.balance, { message: 'Escribe un monto.', when: () => applies('balance') });
      validate(path.balance, ({ value }) =>
        applies('balance') && value() !== '' ? problem(moneyError(value(), { positive: false })) : undefined,
      );
      validate(path.totalInstallment, ({ value }) =>
        applies('totalInstallment') && value() !== '' ? problem(moneyError(value(), { positive: true })) : undefined,
      );
      required(path.source, { message: 'Elige de dónde viene el saldo.', when: () => applies('source') });

      required(path.total, { message: 'Escribe un monto.', when: () => applies('total') });
      validate(path.total, ({ value }) =>
        applies('total') && value() !== '' ? problem(moneyError(value(), { positive: true })) : undefined,
      );
      const breakdownPart = (part: 'capital' | 'interest' | 'insurance' | 'fixedCharges') => {
        validate(path.breakdown[part], ({ value, valueOf }) => {
          if (!applies('breakdown')) {
            return undefined;
          }
          if (value() !== '') {
            return problem(moneyError(value(), { positive: false }));
          }
          const breakdown = valueOf(path.breakdown);
          const anyFilled = [breakdown.capital, breakdown.interest, breakdown.insurance, breakdown.fixedCharges].some(
            (text) => text !== '',
          );
          return anyFilled
            ? problem('Si indicas el desglose, completa los cuatro componentes (puedes escribir 0.00).')
            : undefined;
        });
      };
      breakdownPart('capital');
      breakdownPart('interest');
      breakdownPart('insurance');
      breakdownPart('fixedCharges');

      required(path.policy, {
        message: 'Elige qué debe hacer el cálculo con la cuota.',
        when: () => applies('policy'),
      });
      required(path.interestRate, {
        message: 'Escribe la nueva tasa.',
        when: ({ valueOf }) => applies('interestRate') && valueOf(path.insuranceRates).length === 0,
      });
      required(path.bankInstallment, {
        message: 'Escribe un monto.',
        when: ({ valueOf }) => applies('bankInstallment') && valueOf(path.policy) === 'BANK_INSTALLMENT',
      });
      validate(path.bankInstallment, ({ value, valueOf }) =>
        applies('bankInstallment') && valueOf(path.policy) === 'BANK_INSTALLMENT' && value() !== ''
          ? problem(moneyError(value(), { positive: true }))
          : undefined,
      );

      applyEach(path.fixedCharges, (row) => {
        validate(row.label, ({ value }) => {
          if (!applies('fixedCharges')) {
            return undefined;
          }
          if (value().trim() === '') {
            return problem('Escribe el nombre del cargo.');
          }
          return value().trim().length > 60
            ? problem('El nombre del cargo no puede pasar de 60 caracteres.')
            : undefined;
        });
        validate(row.amount, ({ value }) =>
          applies('fixedCharges') ? problem(moneyError(value(), { positive: false })) : undefined,
        );
      });

      required(path.amount, { message: 'Escribe un monto.', when: () => applies('amount') });
      validate(path.amount, ({ value }) =>
        applies('amount') && value() !== '' ? problem(moneyError(value(), { positive: true })) : undefined,
      );
      required(path.mode, {
        message: 'Elige si el abono reduce el plazo o la cuota.',
        when: () => applies('mode'),
      });
      required(path.commissionAmount, {
        message: 'Escribe el monto de la comisión.',
        when: ({ valueOf }) => applies('commissionAmount') && valueOf(path.commissionKind) === 'FLAT',
      });
      validate(path.commissionAmount, ({ value, valueOf }) =>
        applies('commissionAmount') && valueOf(path.commissionKind) === 'FLAT' && value() !== ''
          ? problem(moneyError(value(), { positive: true }))
          : undefined,
      );
      required(path.commissionRate, {
        message: 'Escribe el porcentaje de la comisión.',
        when: ({ valueOf }) => applies('commissionRate') && valueOf(path.commissionKind) === 'PERCENT',
      });
      validate(path.commissionRate, ({ value, valueOf }) =>
        applies('commissionRate') &&
        valueOf(path.commissionKind) === 'PERCENT' &&
        value() !== '' &&
        ZERO_RATE.test(value())
          ? problem('La comisión debe ser mayor que cero.')
          : undefined,
      );

      required(path.count, { message: 'Escribe un número entero.', when: () => applies('count') });
      validate(path.count, ({ value }) =>
        applies('count') && value() !== '' ? problem(integerError(value(), 1, 1200)) : undefined,
      );

      validate(path.note, ({ value }) =>
        value().trim().length > 500 ? problem('La nota no puede pasar de 500 caracteres.') : undefined,
      );
    },
    {
      submission: {
        action: async () => {
          const result = buildValue(this.kind(), this.model(), this.context());
          if (result.ok) {
            this.failure.set(null);
            this.submitted.emit(result.value);
          } else {
            this.failure.set(FIELD_LABELS[result.field] ?? 'Fecha');
          }
          return undefined;
        },
        onInvalid: (field) => {
          this.failure.set(null);
          afterNextRender(() => field().errorSummary()[0]?.fieldTree().focusBoundControl(), {
            injector: this.injector,
          });
        },
      },
    },
  );

  constructor() {
    // [ALG.EVENTS.ANCHOR] rule 2: suggest the installment from the payment date until the user picks one.
    effect(() => {
      if (this.kind() !== 'ActualPayment' || this.installmentEdited()) {
        return;
      }
      const date = this.form.date().value();
      const context = this.context();
      untracked(() => {
        const suggestion = date === '' ? '' : suggestInstallment(context, date);
        this.model.update((current) =>
          current.installmentNumber === suggestion ? current : { ...current, installmentNumber: suggestion },
        );
      });
    });
  }

  /** DOM id of a control of this instance. */
  protected id(name: string): string {
    return `${this.uid}-${name}`;
  }

  /** True when the control shows errors: touched and invalid. */
  protected invalid(field: FieldTree<unknown>): boolean {
    const state = field();
    return state.touched() && state.invalid();
  }

  protected addCharge(): void {
    if (this.model().fixedCharges.length >= MAX_CHARGES) {
      return;
    }
    const index = this.model().fixedCharges.length;
    this.model.update((current) => ({
      ...current,
      fixedCharges: [...current.fixedCharges, { label: '', amount: '' }],
    }));
    afterNextRender(() => this.form.fixedCharges[index]?.label().focusBoundControl(), { injector: this.injector });
  }

  protected removeCharge(index: number): void {
    this.model.update((current) => ({
      ...current,
      fixedCharges: current.fixedCharges.filter((_, position) => position !== index),
    }));
  }
}
