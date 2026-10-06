import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { Loan, Uuid } from '@cuotascasa/schema';
import type { ActualPaymentDraft, LoanEventDraft, ReportedBalanceDraft } from '../../../data/api.ts';

/** Inert W0-05 stub; W4-12 replaces it keeping the frozen contract (event-form.contract.spec.ts). */
export const CC_STUB = 'CC_STUB:W4-12';

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

@Component({
  selector: 'cc-event-form',
  template: '',
  host: { 'data-cc-stub': CC_STUB },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventFormComponent {
  readonly kind = input.required<EventFormKind>();
  readonly context = input.required<EventFormContext>();
  /** Existing record to edit, or null to create. */
  readonly value = input<EventFormValue | null>(null);
  readonly submitted = output<EventFormValue>();
  readonly cancelled = output<void>();
}
