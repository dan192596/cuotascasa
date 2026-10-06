import { type InputSignal, type OutputEmitterRef, reflectComponentType } from '@angular/core';
import type { Loan, Uuid } from '@cuotascasa/schema';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { ActualPaymentDraft, LoanEventDraft, ReportedBalanceDraft } from '../../../data/api.ts';
import {
  EVENT_FORM_KINDS,
  type EventFormContext,
  EventFormComponent,
  type EventFormKind,
  type EventFormValue,
} from './event-form.component.ts';

/** Frozen contract of cc-event-form (docs/specs/component-contracts.md). Implemented by W4-12. */
describe('cc-event-form contract', () => {
  it('keeps its selector, signal inputs and outputs', () => {
    const mirror = reflectComponentType(EventFormComponent);
    expect(mirror?.selector).toBe('cc-event-form');
    expect(mirror?.isStandalone).toBe(true);
    const inputs = mirror?.inputs.map(({ templateName, isSignal }) => ({ templateName, isSignal }));
    expect(inputs?.sort((a, b) => a.templateName.localeCompare(b.templateName))).toEqual([
      { templateName: 'context', isSignal: true },
      { templateName: 'kind', isSignal: true },
      { templateName: 'value', isSignal: true },
    ]);
    expect(mirror?.outputs.map(({ templateName }) => templateName).sort()).toEqual(['cancelled', 'submitted']);
  });

  it('keeps the six form kinds', () => {
    expect(EVENT_FORM_KINDS).toEqual([
      'ReportedBalance',
      'ActualPayment',
      'RateChange',
      'FixedChargeChange',
      'Prepayment',
      'AdvanceInstallments',
    ]);
  });

  it('keeps the input and output types', () => {
    type ExpectedContext = Pick<Loan, 'currency' | 'rateType' | 'disbursementDate' | 'firstDueDate' | 'paymentDay'> & {
      readonly loanId: Uuid;
      readonly endDate: string;
    };
    type ExpectedValue =
      | { readonly entity: 'ReportedBalance'; readonly draft: ReportedBalanceDraft }
      | { readonly entity: 'ActualPayment'; readonly draft: ActualPaymentDraft }
      | { readonly entity: 'LoanEvent'; readonly draft: LoanEventDraft };
    expectTypeOf<EventFormKind>().toEqualTypeOf<(typeof EVENT_FORM_KINDS)[number]>();
    expectTypeOf<EventFormContext>().toEqualTypeOf<ExpectedContext>();
    expectTypeOf<EventFormValue>().toEqualTypeOf<ExpectedValue>();
    expectTypeOf<EventFormComponent['kind']>().toEqualTypeOf<InputSignal<EventFormKind>>();
    expectTypeOf<EventFormComponent['context']>().toEqualTypeOf<InputSignal<EventFormContext>>();
    expectTypeOf<EventFormComponent['value']>().toEqualTypeOf<InputSignal<EventFormValue | null>>();
    expectTypeOf<EventFormComponent['submitted']>().toEqualTypeOf<OutputEmitterRef<EventFormValue>>();
    expectTypeOf<EventFormComponent['cancelled']>().toEqualTypeOf<OutputEmitterRef<void>>();
  });
});
