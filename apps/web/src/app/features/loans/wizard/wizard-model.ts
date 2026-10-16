import {
  alignToPaymentDay,
  compareMoney,
  type Currency,
  deriveFixedCharges,
  dueDateFor,
  END_OF_MONTH,
  type FixedCharge,
  type InsuranceKind,
  instantiateTemplate,
  isLocalDate,
  levelPayment,
  listTemplates,
  type LocalDate,
  type Money,
  moneyIsNegative,
  moneySum,
  parseLocalDate,
  parseMoney,
  parsePaymentDay,
  parseRate,
  type PaymentDay,
  periodicRate,
  type RateType,
  type TemplateValidationResult,
  type RoundingProfile,
  type TemplateId,
  TEMPLATE_IDS,
  InvalidInputError,
  ZERO_MONEY,
} from '@cuotascasa/domain';
import { REPORTED_BALANCE_SOURCES, type ReportedBalanceSource } from '@cuotascasa/schema';
import type { AnchorDraft, LoanDraft } from '../../../data/api.ts';

export { REPORTED_BALANCE_SOURCES, type ReportedBalanceSource };

/** One editable insurance row; `rate` is the stored fraction string ('0.01'), typed as a percent in RateInput. */
export interface InsuranceRow {
  kind: InsuranceKind;
  rate: string;
}

/** One named fixed-charge line of the step-3 breakdown. */
export interface ChargeRow {
  label: string;
  amount: string;
}

/**
 * Single model of the four steps. Everything is text (or a list of text rows): the domain parses it, money never
 * becomes a JS number (docs/specs/angular-patterns.md §0).
 */
export interface WizardModel {
  /** 'fha-gt@1': the template the values were copied from. */
  templateKey: string;
  name: string;
  bank: string;
  currency: Currency;
  principal: string;
  termMonths: string;
  /** Fraction string ('0.07'). */
  interestRate: string;
  rateType: RateType | '';
  /** '1'…'31' or 'END_OF_MONTH'. */
  paymentDay: string;
  firstDueDate: string;
  disbursementDate: string;
  insurance: InsuranceRow[];
  roundingProfile: RoundingProfile | '';
  bankTotal: string;
  charges: ChargeRow[];
  anchorBalance: string;
  anchorK: string;
  anchorDate: string;
  anchorSource: ReportedBalanceSource;
}

export const DEFAULT_TEMPLATE_KEY = 'fha-gt@1';
export const END_OF_MONTH_VALUE = 'END_OF_MONTH';
export const DEFAULT_ANCHOR_SOURCE: ReportedBalanceSource = 'OTHER';
export const MAX_INSURANCE_ROWS = 10;
export const MAX_CHARGE_ROWS = 20;
export const MAX_TERM_MONTHS = 1200;

export const INSURANCE_LABELS: Readonly<Record<InsuranceKind, string>> = {
  mortgageInsurance: 'Seguro FHA / seguro de hipoteca',
  lifeInsurance: 'Desgravamen',
  other: 'Otro seguro %',
};

export const ROUNDING_PROFILE_OPTIONS: readonly { readonly value: RoundingProfile; readonly label: string }[] = [
  { value: 'FHA_GT_V1', label: 'FHA_GT_V1 · cargo financiero combinado (FHA Guatemala)' },
  { value: 'SIMPLE', label: 'SIMPLE · interés y seguros por separado' },
];

export const RATE_TYPE_OPTIONS: readonly { readonly value: RateType; readonly label: string }[] = [
  { value: 'FIXED', label: 'Fija' },
  { value: 'VARIABLE', label: 'Variable' },
];

export const CURRENCY_OPTIONS: readonly { readonly value: Currency; readonly label: string }[] = [
  { value: 'GTQ', label: 'Quetzales (GTQ)' },
  { value: 'USD', label: 'Dólares (USD)' },
];

export const SOURCE_LABELS: Readonly<Record<ReportedBalanceSource, string>> = {
  BANK_EMAIL: 'Correo del banco',
  ONLINE_BANKING: 'Banca en línea',
  BANK_SCHEDULE: 'Tabla de amortización del banco',
  OTHER: 'Otro',
};

export const PAYMENT_DAY_OPTIONS: readonly { readonly value: string; readonly label: string }[] = [
  ...Array.from({ length: 31 }, (_, index) => ({ value: String(index + 1), label: `Día ${String(index + 1)}` })),
  { value: END_OF_MONTH_VALUE, label: 'Fin de mes' },
];

/** Templates of the domain catalog as select options, in catalog order. */
export function templateOptions(): readonly { readonly value: string; readonly label: string }[] {
  return listTemplates().map((template) => ({
    value: `${template.id}@${String(template.version)}`,
    label: template.name,
  }));
}

/** 'fha-gt@1' → {id, version}; throws the domain's UNKNOWN_TEMPLATE through instantiateTemplate when unknown. */
function parseTemplateKey(key: string): { id: TemplateId; version: number } {
  const [id = '', version = ''] = key.split('@');
  const known = TEMPLATE_IDS.find((candidate) => candidate === id);
  if (known === undefined || !/^[1-9]\d*$/.test(version)) {
    throw new InvalidInputError('UNKNOWN_TEMPLATE', 'Unknown template key');
  }
  return { id: known, version: Number(version) };
}

/**
 * Copies the template values into the model ([ALG.TEMPLATES]): the model owns a deep copy, so editing it never
 * touches the template. A value the template leaves to the user (`null`) keeps what the user already chose.
 */
export function applyTemplate(model: WizardModel, key: string): WizardModel {
  const copy = instantiateTemplate(parseTemplateKey(key));
  return {
    ...model,
    templateKey: `${copy.templateRef.id}@${String(copy.templateRef.version)}`,
    insurance: copy.insuranceRates.map((row) => ({ kind: row.kind, rate: row.rate })),
    roundingProfile: copy.roundingProfile,
    paymentDay: copy.paymentDay === null ? model.paymentDay : String(copy.paymentDay),
    rateType: copy.rateType ?? model.rateType,
  };
}

export function initialModel(): WizardModel {
  return applyTemplate(
    {
      templateKey: DEFAULT_TEMPLATE_KEY,
      name: '',
      bank: '',
      currency: 'GTQ',
      principal: '',
      termMonths: '',
      interestRate: '',
      rateType: '',
      paymentDay: '',
      firstDueDate: '',
      disbursementDate: '',
      insurance: [],
      roundingProfile: '',
      bankTotal: '',
      charges: [],
      anchorBalance: '',
      anchorK: '',
      anchorDate: '',
      anchorSource: DEFAULT_ANCHOR_SOURCE,
    },
    DEFAULT_TEMPLATE_KEY,
  );
}

/* ---------- Parsing helpers (no JS numbers on money) ---------- */

const INTEGER = /^[1-9]\d*$/;

/** A positive integer typed as text, or null. */
export function parsePositiveInt(text: string): number | null {
  const trimmed = text.trim();
  return INTEGER.test(trimmed) && trimmed.length <= 7 ? Number(trimmed) : null;
}

export function paymentDayOf(text: string): PaymentDay | null {
  try {
    return parsePaymentDay(text === END_OF_MONTH_VALUE ? END_OF_MONTH : Number(text));
  } catch {
    return null;
  }
}

/** Canonical Money of a text field, or null when empty or malformed. */
export function moneyOf(text: string): Money | null {
  try {
    return text === '' ? null : parseMoney(text);
  } catch {
    return null;
  }
}

export function localDateOf(text: string): LocalDate | null {
  return isLocalDate(text) ? parseLocalDate(text) : null;
}

/** [ALG.DATES] Moves the day of `firstDueDate` to the one the new `paymentDay` implies; '' or invalid stays as is. */
export function rederiveFirstDueDate(firstDueDate: string, paymentDay: string): string {
  const date = localDateOf(firstDueDate);
  const day = paymentDayOf(paymentDay);
  return date === null || day === null ? firstDueDate : alignToPaymentDay(date, day);
}

/** Default date of the anchor: the due date of installment `k`; null when it cannot be derived. */
export function dueDateOfInstallment(model: WizardModel): string | null {
  const first = localDateOf(model.firstDueDate);
  const day = paymentDayOf(model.paymentDay);
  const k = parsePositiveInt(model.anchorK);
  const term = parsePositiveInt(model.termMonths);
  if (first === null || day === null || k === null || term === null || k > term) {
    return null;
  }
  return dueDateFor(first, day, k);
}

/* ---------- Draft building ---------- */

/** Fixed charges effective from the first due date ([ALG.TEMPLATES.FIXED]). */
export function toFixedCharges(lines: readonly ChargeRow[], firstDueDate: string): FixedCharge[] {
  const effectiveFrom = parseLocalDate(firstDueDate);
  return lines.map((line) => ({ label: line.label.trim(), amount: parseMoney(line.amount), effectiveFrom }));
}

/**
 * Loan draft from the model. `charges` are the stored fixed charges (step 3 decides them). The caller validates the
 * model first; a malformed value surfaces as the domain's InvalidInputError, never as a silent default.
 */
export function toLoanDraft(model: WizardModel, charges: readonly { label: string; amount: Money }[]): LoanDraft {
  const { id, version } = parseTemplateKey(model.templateKey);
  const paymentDay = paymentDayOf(model.paymentDay);
  const term = parsePositiveInt(model.termMonths);
  if (paymentDay === null || term === null || model.rateType === '' || model.roundingProfile === '') {
    throw new InvalidInputError('INVALID_TERMS', 'The wizard model is incomplete');
  }
  const effectiveFrom = parseLocalDate(model.firstDueDate);
  return {
    name: model.name.trim(),
    bank: model.bank.trim(),
    currency: model.currency,
    principal: parseMoney(model.principal),
    termMonths: term,
    disbursementDate: parseLocalDate(model.disbursementDate),
    firstDueDate: effectiveFrom,
    paymentDay,
    interestRate: parseRate(model.interestRate),
    rateType: model.rateType,
    insuranceRates: model.insurance.map((row) => parseRate(row.rate)),
    fixedCharges: charges.map((charge) => ({ label: charge.label, amount: charge.amount, effectiveFrom })),
    roundingProfile: model.roundingProfile,
    templateRef: { id, version },
    status: 'active',
  };
}

/** The anchor ReportedBalance (without loanId) of step 4; `source` is the user's choice (default OTHER). */
export function toAnchorDraft(model: WizardModel): AnchorDraft {
  const installmentNumber = parsePositiveInt(model.anchorK);
  if (installmentNumber === null) {
    throw new InvalidInputError('MISSING_INSTALLMENT_NUMBER', 'The anchor needs its installment number');
  }
  return {
    date: parseLocalDate(model.anchorDate),
    installmentNumber,
    balance: parseMoney(model.anchorBalance),
    source: model.anchorSource,
  };
}

/* ---------- Level and fixed-charge breakdown (step 3) ---------- */

/** [ALG.LEVEL] Level installment of the step-2 conditions, from the domain's levelPayment. */
export function levelOf(model: WizardModel): Money {
  const term = parsePositiveInt(model.termMonths);
  if (term === null) {
    throw new InvalidInputError('INVALID_TERMS', 'termMonths must be an integer >= 1');
  }
  return levelPayment(
    parseMoney(model.principal),
    periodicRate(
      parseRate(model.interestRate),
      model.insurance.map((row) => parseRate(row.rate)),
    ),
    term,
  );
}

export type Breakdown =
  /** No bank total: no fixed charges are stored. */
  | { readonly state: 'none'; readonly total: Money; readonly lines: readonly [] }
  /** Total − level is negative ([ALG.TEMPLATES.FIXED]). */
  | { readonly state: 'negative'; readonly total: Money; readonly lines: readonly [] }
  /** Named lines that do not sum to total − level. */
  | { readonly state: 'mismatch'; readonly total: Money; readonly lines: readonly { label: string; amount: Money }[] }
  | { readonly state: 'ok'; readonly total: Money; readonly lines: readonly { label: string; amount: Money }[] };

const DEFAULT_CHARGE_LABEL = 'Cargos fijos';

/**
 * Fixed charges = bank total − level ([ALG.TEMPLATES.FIXED]). Without named lines the whole amount is stored as one
 * «Cargos fijos» charge; with lines they must add up to it exactly. A zero difference stores nothing.
 */
export function fixedChargeBreakdown(model: WizardModel, level: Money): Breakdown {
  if (model.bankTotal.trim() === '') {
    return { state: 'none', total: ZERO_MONEY, lines: [] };
  }
  let total: Money;
  try {
    total = deriveFixedCharges(parseMoney(model.bankTotal), level);
  } catch (error) {
    if (error instanceof InvalidInputError && error.code === 'NEGATIVE_FIXED_CHARGES') {
      return { state: 'negative', total: ZERO_MONEY, lines: [] };
    }
    throw error;
  }
  const lines = model.charges
    .filter((line) => line.label.trim() !== '' || line.amount !== '')
    .map((line) => ({ label: line.label.trim(), amount: parseMoney(line.amount === '' ? '0' : line.amount) }));
  if (lines.length === 0) {
    return compareMoney(total, ZERO_MONEY) === 0
      ? { state: 'ok', total, lines: [] }
      : { state: 'ok', total, lines: [{ label: DEFAULT_CHARGE_LABEL, amount: total }] };
  }
  const sum = moneySum(lines.map((line) => line.amount));
  const kept = lines.filter((line) => !moneyIsNegative(line.amount) && compareMoney(line.amount, ZERO_MONEY) > 0);
  return compareMoney(sum, total) === 0 ? { state: 'ok', total, lines: kept } : { state: 'mismatch', total, lines };
}

/* ---------- Step 4 view ---------- */

/** What step 4 shows for the optional anchor. Only `result` carries a traffic light; the others are «Sin validar». */
export type AnchorView =
  /** No balance entered: the loan is saved without an anchor. */
  | { readonly kind: 'none' }
  /** A balance is entered but the installment (or the conditions) is not usable yet. */
  | { readonly kind: 'pending' }
  /** The domain rejected the installment (out of range); the Spanish text comes from the typed error's code. */
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'result'; readonly result: TemplateValidationResult };
