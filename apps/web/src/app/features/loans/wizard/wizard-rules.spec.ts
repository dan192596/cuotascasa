import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form } from '@angular/forms/signals';
import { describe, expect, it } from 'vitest';
import { MESSAGES } from './wizard-messages.ts';
import { initialModel, type WizardModel } from './wizard-model.ts';
import { stepFields, wizardSchema } from './wizard-rules.ts';

/** A model that satisfies every rule of steps 1 and 2 (synthetic values). */
function validModel(overrides: Partial<WizardModel> = {}): WizardModel {
  return {
    ...initialModel(),
    name: 'Casa de prueba',
    principal: '500000.00',
    termMonths: '240',
    interestRate: '0.07',
    paymentDay: 'END_OF_MONTH',
    firstDueDate: '2027-01-31',
    disbursementDate: '2026-12-15',
    ...overrides,
  };
}

function build(model: WizardModel) {
  const source = signal(model);
  const tree = TestBed.runInInjectionContext(() => form(source, wizardSchema));
  return { source, tree };
}

const messagesOf = (state: { errors(): readonly { message?: string }[] }) => state.errors().map((e) => e.message);

describe('wizard rules', () => {
  it('accepts a complete synthetic model', () => {
    const { tree } = build(validModel());
    expect(tree().valid()).toBe(true);
  });

  it.each([
    ['', MESSAGES.principalRequired],
    ['0.00', MESSAGES.principalPositive],
    ['-1.00', MESSAGES.principalPositive],
  ])('rejects principal %j with a Spanish message', (principal, message) => {
    const { tree } = build(validModel({ principal }));
    expect(messagesOf(tree.principal())).toEqual([message]);
  });

  it('accepts principal 0.01', () => {
    expect(
      build(validModel({ principal: '0.01' }))
        .tree.principal()
        .valid(),
    ).toBe(true);
  });

  it.each(['', '0', '1.5', 'abc', '-3', '1201'])('rejects termMonths %j', (termMonths) => {
    const { tree } = build(validModel({ termMonths }));
    expect(tree.termMonths().invalid()).toBe(true);
    expect(tree.termMonths().errors().length).toBe(1);
  });

  it.each(['1', '360', '1200'])('accepts termMonths %j', (termMonths) => {
    expect(build(validModel({ termMonths })).tree.termMonths().valid()).toBe(true);
  });

  it('requires an interest rate but accepts 0 and a positive decimal', () => {
    expect(messagesOf(build(validModel({ interestRate: '' })).tree.interestRate())).toEqual([
      MESSAGES.interestRequired,
    ]);
    expect(
      build(validModel({ interestRate: '0' }))
        .tree.interestRate()
        .valid(),
    ).toBe(true);
    expect(
      build(validModel({ interestRate: '0.0725' }))
        .tree.interestRate()
        .valid(),
    ).toBe(true);
  });

  it('a malformed interest rate gets its own message, not the insurance one', () => {
    const { tree } = build(validModel({ interestRate: '-0.01' }));
    expect(messagesOf(tree.interestRate())).toEqual([MESSAGES.interestRateInvalid]);
    expect(MESSAGES.interestRateInvalid).not.toBe(MESSAGES.insuranceRateInvalid);
  });

  it('requires rateType', () => {
    expect(messagesOf(build(validModel({ rateType: '' })).tree.rateType())).toEqual([MESSAGES.rateTypeRequired]);
    expect(
      build(validModel({ rateType: 'FIXED' }))
        .tree.rateType()
        .valid(),
    ).toBe(true);
  });

  it.each([
    ['0', false],
    ['32', false],
    ['abc', false],
    ['', false],
    ['1', true],
    ['31', true],
    ['END_OF_MONTH', true],
  ])('paymentDay %j valid=%s', (paymentDay, valid) => {
    // 2027-01-31 is consistent with day 31 and END_OF_MONTH; other days only matter for paymentDay itself.
    const { tree } = build(validModel({ paymentDay }));
    expect(tree.paymentDay().valid()).toBe(valid);
  });

  it('rejects an inconsistent firstDueDate/paymentDay pair with a Spanish message ([ALG.DATES])', () => {
    const { tree, source } = build(validModel({ paymentDay: '15', firstDueDate: '2027-03-31' }));
    expect(messagesOf(tree.firstDueDate())).toEqual([MESSAGES.firstDueDateMismatch]);
    source.update((model) => ({ ...model, firstDueDate: '2027-03-15' }));
    expect(tree.firstDueDate().valid()).toBe(true);
  });

  it('disbursementDate may equal firstDueDate but not follow it', () => {
    expect(
      build(validModel({ disbursementDate: '2027-01-31' }))
        .tree.disbursementDate()
        .valid(),
    ).toBe(true);
    const late = build(validModel({ disbursementDate: '2027-02-01' })).tree;
    expect(messagesOf(late.disbursementDate())).toEqual([MESSAGES.disbursementAfterFirstDue]);
  });

  it('insurance rows: 0 is valid, empty and malformed rates are rejected', () => {
    const rows = (rate: string) =>
      build(validModel({ insurance: [{ kind: 'other', rate }] })).tree.insurance[0]!.rate();
    expect(rows('0').valid()).toBe(true);
    expect(messagesOf(rows(''))).toEqual([MESSAGES.insuranceRateRequired]);
    expect(messagesOf(rows('-0.01'))).toEqual([MESSAGES.insuranceRateInvalid]);
    expect(messagesOf(rows('abc'))).toEqual([MESSAGES.insuranceRateInvalid]);
  });

  it('allows no insurance rows at all (D11)', () => {
    expect(
      build(validModel({ insurance: [] }))
        .tree.insurance()
        .valid(),
    ).toBe(true);
  });

  it('roundingProfile must be FHA_GT_V1 or SIMPLE', () => {
    expect(messagesOf(build(validModel({ roundingProfile: '' })).tree.roundingProfile())).toEqual([
      MESSAGES.roundingRequired,
    ]);
    expect(
      build(validModel({ roundingProfile: 'SIMPLE' }))
        .tree.roundingProfile()
        .valid(),
    ).toBe(true);
  });

  it('anchor fields only matter once a balance is entered', () => {
    expect(build(validModel()).tree.anchorK().valid()).toBe(true);
    const { tree } = build(validModel({ anchorBalance: '1000.00' }));
    expect(messagesOf(tree.anchorK())).toEqual([MESSAGES.anchorKRequired]);
    expect(messagesOf(tree.anchorDate())).toEqual([MESSAGES.anchorDateRequired]);
    expect(messagesOf(build(validModel({ anchorBalance: '1000.00', anchorK: '1.5' })).tree.anchorK())).toEqual([
      MESSAGES.anchorKInvalid,
    ]);
  });

  it('charge lines need a label when they have an amount and the other way around', () => {
    const { tree } = build(validModel({ charges: [{ label: '', amount: '10.00' }] }));
    expect(messagesOf(tree.charges[0]!.label())).toEqual([MESSAGES.chargeLabelRequired]);
    const other = build(validModel({ charges: [{ label: 'IUSI', amount: '' }] })).tree;
    expect(messagesOf(other.charges[0]!.amount())).toEqual([MESSAGES.chargeAmountRequired]);
  });

  it('stepFields lists the fields each step owns', () => {
    const { tree } = build(validModel());
    expect(stepFields(tree, 1)).toHaveLength(4);
    expect(stepFields(tree, 2)).toContain(tree.firstDueDate);
    expect(stepFields(tree, 3)).toContain(tree.bankTotal);
    expect(stepFields(tree, 4)).toContain(tree.anchorK);
  });
});
