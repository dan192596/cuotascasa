import { applyEach, type FieldTree, required, type SchemaFn, validate } from '@angular/forms/signals';
import {
  compareLocalDate,
  compareMoney,
  CURRENCIES,
  isFirstDueDateConsistent,
  isRate,
  moneyIsNegative,
  parseLocalDate,
  RATE_TYPES,
  ROUNDING_PROFILES,
  ZERO_MONEY,
} from '@cuotascasa/domain';
import { MESSAGES } from './wizard-messages.ts';
import {
  END_OF_MONTH_VALUE,
  localDateOf,
  moneyOf,
  MAX_TERM_MONTHS,
  parsePositiveInt,
  paymentDayOf,
  REPORTED_BALANCE_SOURCES,
  templateOptions,
  type WizardModel,
} from './wizard-model.ts';

const PAYMENT_DAY_TEXT = /^(?:[1-9]|[12]\d|3[01])$/;

function error(kind: string, message: string) {
  return { kind, message };
}

/**
 * Field rules of the four steps, with Spanish messages. Money, rate and date fields are text controls that parse in
 * the control itself (ui/money-input), so a typed error such as «más de 4 decimales» reaches the field before these
 * rules judge the last valid model.
 */
export const wizardSchema: SchemaFn<WizardModel> = (path) => {
  // Step 1
  validate(path.templateKey, ({ value }) =>
    templateOptions().some((option) => option.value === value())
      ? undefined
      : error('template', MESSAGES.templateRequired),
  );
  required(path.name, { message: MESSAGES.nameRequired });
  validate(path.name, ({ value }) => {
    const text = value().trim();
    if (text === '' && value() !== '') return error('required', MESSAGES.nameRequired);
    return text.length > 80 ? error('maxlength', MESSAGES.nameTooLong) : undefined;
  });
  validate(path.bank, ({ value }) =>
    value().trim().length > 80 ? error('maxlength', MESSAGES.bankTooLong) : undefined,
  );
  validate(path.currency, ({ value }) =>
    CURRENCIES.includes(value()) ? undefined : error('required', MESSAGES.currencyRequired),
  );

  // Step 2
  required(path.principal, { message: MESSAGES.principalRequired });
  validate(path.principal, ({ value }) => {
    const amount = moneyOf(value());
    return amount !== null && compareMoney(amount, ZERO_MONEY) <= 0
      ? error('positive', MESSAGES.principalPositive)
      : undefined;
  });
  required(path.termMonths, { message: MESSAGES.termRequired });
  validate(path.termMonths, ({ value }) => {
    if (value().trim() === '') return undefined;
    const term = parsePositiveInt(value());
    return term === null || term > MAX_TERM_MONTHS ? error('term', MESSAGES.termInvalid) : undefined;
  });
  required(path.interestRate, { message: MESSAGES.interestRequired });
  validate(path.interestRate, ({ value }) =>
    value() === '' || isRate(value()) ? undefined : error('rate', MESSAGES.insuranceRateInvalid),
  );
  validate(path.rateType, ({ value }) =>
    (RATE_TYPES as readonly string[]).includes(value()) ? undefined : error('required', MESSAGES.rateTypeRequired),
  );
  validate(path.paymentDay, ({ value }) => {
    if (value() === '') return error('required', MESSAGES.paymentDayRequired);
    return value() === END_OF_MONTH_VALUE || PAYMENT_DAY_TEXT.test(value())
      ? undefined
      : error('paymentDay', MESSAGES.paymentDayInvalid);
  });
  required(path.firstDueDate, { message: MESSAGES.firstDueDateRequired });
  validate(path.firstDueDate, ({ value, valueOf }) => {
    const date = localDateOf(value());
    const day = paymentDayOf(valueOf(path.paymentDay));
    // [ALG.DATES]: an inconsistent pair is a form error that blocks advancing.
    return date !== null && day !== null && !isFirstDueDateConsistent(date, day)
      ? error('firstDueDate', MESSAGES.firstDueDateMismatch)
      : undefined;
  });
  required(path.disbursementDate, { message: MESSAGES.disbursementRequired });
  validate(path.disbursementDate, ({ value, valueOf }) => {
    const disbursement = localDateOf(value());
    const first = localDateOf(valueOf(path.firstDueDate));
    return disbursement !== null && first !== null && compareLocalDate(disbursement, parseLocalDate(first)) > 0
      ? error('disbursement', MESSAGES.disbursementAfterFirstDue)
      : undefined;
  });
  applyEach(path.insurance, (row) => {
    required(row.rate, { message: MESSAGES.insuranceRateRequired });
    validate(row.rate, ({ value }) =>
      value() === '' || isRate(value()) ? undefined : error('rate', MESSAGES.insuranceRateInvalid),
    );
  });
  validate(path.roundingProfile, ({ value }) => {
    if (value() === '') return error('required', MESSAGES.roundingRequired);
    return (ROUNDING_PROFILES as readonly string[]).includes(value())
      ? undefined
      : error('rounding', MESSAGES.roundingInvalid);
  });

  // Step 3
  validate(path.bankTotal, ({ value }) => {
    const amount = moneyOf(value());
    return amount !== null && moneyIsNegative(amount) ? error('negative', MESSAGES.bankTotalNegative) : undefined;
  });
  applyEach(path.charges, (row) => {
    validate(row.label, ({ value, valueOf }) => {
      const text = value().trim();
      if (text === '' && valueOf(row.amount) !== '') return error('required', MESSAGES.chargeLabelRequired);
      return text.length > 60 ? error('maxlength', MESSAGES.chargeLabelTooLong) : undefined;
    });
    validate(row.amount, ({ value, valueOf }) => {
      if (value() === '') {
        return valueOf(row.label).trim() === '' ? undefined : error('required', MESSAGES.chargeAmountRequired);
      }
      const amount = moneyOf(value());
      return amount !== null && moneyIsNegative(amount) ? error('negative', MESSAGES.chargeAmountNegative) : undefined;
    });
  });

  // Step 4: the fields only matter once a balance is entered.
  validate(path.anchorBalance, ({ value }) =>
    (moneyOf(value()) ?? ZERO_MONEY).startsWith('-') ? error('negative', MESSAGES.anchorBalanceNegative) : undefined,
  );
  validate(path.anchorK, ({ value, valueOf }) => {
    if (valueOf(path.anchorBalance) === '') return undefined;
    if (value().trim() === '') return error('required', MESSAGES.anchorKRequired);
    return /^\d+$/.test(value().trim()) ? undefined : error('integer', MESSAGES.anchorKInvalid);
  });
  validate(path.anchorDate, ({ value, valueOf }) =>
    valueOf(path.anchorBalance) !== '' && value() === '' ? error('required', MESSAGES.anchorDateRequired) : undefined,
  );
  validate(path.anchorSource, ({ value }) =>
    REPORTED_BALANCE_SOURCES.includes(value()) ? undefined : error('required', MESSAGES.anchorSourceRequired),
  );
};

/** Wizard step number. */
export type WizardStep = 1 | 2 | 3 | 4;
export const WIZARD_STEPS = [1, 2, 3, 4] as const satisfies readonly WizardStep[];

/** Fields (and field groups) each step owns; «Siguiente» touches and checks only these. */
export function stepFields(form: FieldTree<WizardModel>, step: WizardStep): readonly FieldTree<unknown>[] {
  switch (step) {
    case 1:
      return [form.templateKey, form.name, form.bank, form.currency];
    case 2:
      return [
        form.principal,
        form.termMonths,
        form.interestRate,
        form.rateType,
        form.paymentDay,
        form.firstDueDate,
        form.disbursementDate,
        form.insurance,
        form.roundingProfile,
      ];
    case 3:
      return [form.bankTotal, form.charges];
    case 4:
      return [form.anchorBalance, form.anchorK, form.anchorDate, form.anchorSource];
  }
}
