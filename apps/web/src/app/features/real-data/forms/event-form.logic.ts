import {
  compareLocalDate,
  installmentOnOrAfter,
  isLocalDate,
  isMoney,
  type LocalDate,
  moneyIsZero,
  parseLocalDate,
  parsePaymentDay,
} from '@cuotascasa/domain';
import {
  actualPaymentSchema,
  type Loan,
  loanEventSchema,
  type PrepaymentMode,
  type RateChangePolicy,
  reportedBalanceSchema,
  type ReportedBalanceSource,
  type Uuid,
} from '@cuotascasa/schema';
import type { ActualPaymentDraft, LoanEventDraft, ReportedBalanceDraft } from '../../../data/api.ts';
import { formatLocalDate } from '../../../ui/format/format.ts';

/** Pure logic of cc-event-form: form model, field rules, installment suggestion and DTO building. No Angular here. */

/** Same shape as the frozen `EventFormContext` (docs/specs/component-contracts.md). */
export type BuildContext = Pick<Loan, 'currency' | 'rateType' | 'disbursementDate' | 'firstDueDate' | 'paymentDay'> & {
  readonly loanId: Uuid;
  readonly endDate: string;
};

export type FormKind =
  'ReportedBalance' | 'ActualPayment' | 'RateChange' | 'FixedChargeChange' | 'Prepayment' | 'AdvanceInstallments';

export type FormValue =
  | { readonly entity: 'ReportedBalance'; readonly draft: ReportedBalanceDraft }
  | { readonly entity: 'ActualPayment'; readonly draft: ActualPaymentDraft }
  | { readonly entity: 'LoanEvent'; readonly draft: LoanEventDraft };

export type CommissionChoice = 'NONE' | 'FLAT' | 'PERCENT';

export interface ChargeRow {
  label: string;
  amount: string;
}

export interface BreakdownModel {
  capital: string;
  interest: string;
  insurance: string;
  fixedCharges: string;
}

/**
 * One flat model for the six forms. Money and rates are canonical strings ('1234.56', '0.0725'), dates are LocalDate
 * strings, counts are digit strings: nothing is a JS number until the DTO is built. '' means empty.
 */
export interface EventFormModel {
  date: string;
  installmentNumber: string;
  balance: string;
  totalInstallment: string;
  reportedRate: string;
  source: ReportedBalanceSource | '';
  total: string;
  breakdown: BreakdownModel;
  policy: RateChangePolicy | '';
  interestRate: string;
  /**   /** undefined: the insurance is unchanged; []: no insurance from k ([ALG.RATE]). Not a form field: carried through. */
  insuranceRates: string[] | undefined;
  bankInstallment: string;
  fixedCharges: ChargeRow[];
  amount: string;
  mode: PrepaymentMode | '';
  commissionKind: CommissionChoice;
  commissionAmount: string;
  commissionRate: string;
  count: string;
  note: string;
}

/** Largest installment number and installment count the schemas accept (`installmentNumberSchema`, `count`). */
export const MAX_INSTALLMENTS = 1200;

export type ModelField = keyof EventFormModel;

export function emptyModel(): EventFormModel {
  return {
    date: '',
    installmentNumber: '',
    balance: '',
    totalInstallment: '',
    reportedRate: '',
    source: '',
    total: '',
    breakdown: { capital: '', interest: '', insurance: '', fixedCharges: '' },
    policy: '',
    interestRate: '',
    insuranceRates: undefined,
    bankInstallment: '',
    fixedCharges: [],
    amount: '',
    mode: '',
    commissionKind: 'NONE',
    commissionAmount: '',
    commissionRate: '',
    count: '',
    note: '',
  };
}

/** Initial model of a kind: a RateChange starts with the default policy of HU-10. */
export function initialModel(kind: FormKind, value: FormValue | null): EventFormModel {
  const fromValue = modelFromValue(kind, value);
  if (value === null && kind === 'RateChange') {
    return { ...fromValue, policy: 'RECALC_INSTALLMENT_KEEP_TERM' };
  }
  return fromValue;
}

/** Existing DTO → model. A value of another kind is ignored. */
export function modelFromValue(kind: FormKind, value: FormValue | null): EventFormModel {
  const model = emptyModel();
  if (value === null) {
    return model;
  }
  if (kind === 'ReportedBalance' && value.entity === 'ReportedBalance') {
    const draft = value.draft;
    return {
      ...model,
      date: draft.date,
      installmentNumber: draft.installmentNumber === undefined ? '' : String(draft.installmentNumber),
      balance: draft.balance,
      totalInstallment: draft.totalInstallment ?? '',
      reportedRate: draft.reportedRate ?? '',
      source: draft.source,
      note: draft.note ?? '',
    };
  }
  if (kind === 'ActualPayment' && value.entity === 'ActualPayment') {
    const draft = value.draft;
    return {
      ...model,
      date: draft.paidDate,
      installmentNumber: String(draft.installmentNumber),
      total: draft.total,
      breakdown: draft.breakdown === undefined ? model.breakdown : { ...draft.breakdown },
      note: draft.note ?? '',
    };
  }
  if (value.entity !== 'LoanEvent' || value.draft.type !== kind) {
    return model;
  }
  const draft = value.draft;
  const base = { ...model, date: draft.date, note: draft.note ?? '' };
  switch (draft.type) {
    case 'RateChange':
      return {
        ...base,
        policy: draft.policy,
        interestRate: draft.interestRate ?? '',
        insuranceRates: draft.insuranceRates === undefined ? undefined : [...draft.insuranceRates],
        bankInstallment: draft.bankInstallment ?? '',
      };
    case 'FixedChargeChange':
      return { ...base, fixedCharges: draft.fixedCharges.map((charge) => ({ ...charge })) };
    case 'Prepayment':
      return {
        ...base,
        amount: draft.amount,
        mode: draft.mode,
        commissionKind: draft.commission?.kind ?? 'NONE',
        commissionAmount: draft.commission?.kind === 'FLAT' ? draft.commission.amount : '',
        commissionRate: draft.commission?.kind === 'PERCENT' ? draft.commission.rate : '',
      };
    case 'AdvanceInstallments':
      return { ...base, count: String(draft.count) };
  }
}

/* ---------- Which fields each kind shows ---------- */

const FIELDS_BY_KIND: Readonly<Record<FormKind, ReadonlySet<ModelField>>> = {
  ReportedBalance: new Set<ModelField>([
    'date',
    'installmentNumber',
    'balance',
    'totalInstallment',
    'reportedRate',
    'source',
    'note',
  ]),
  ActualPayment: new Set<ModelField>(['date', 'installmentNumber', 'total', 'breakdown', 'note']),
  RateChange: new Set<ModelField>(['date', 'policy', 'interestRate', 'bankInstallment', 'note']),
  FixedChargeChange: new Set<ModelField>(['date', 'fixedCharges', 'note']),
  Prepayment: new Set<ModelField>([
    'date',
    'amount',
    'mode',
    'commissionKind',
    'commissionAmount',
    'commissionRate',
    'note',
  ]),
  AdvanceInstallments: new Set<ModelField>(['date', 'count', 'note']),
};

/** True when the form of `kind` has `field` (rules of other fields never apply). */
export function fieldApplies(kind: FormKind, field: ModelField): boolean {
  return FIELDS_BY_KIND[kind].has(field);
}

/* ---------- Field rules (Spanish, es-GT) ---------- */

export interface DateBounds {
  readonly min: LocalDate;
  readonly max: LocalDate;
}

/** Event dates live between the disbursement and the end of the loan ([ALG.EVENTS.ANCHOR] rule 3). */
export function dateBounds(context: BuildContext): DateBounds {
  return { min: parseLocalDate(context.disbursementDate), max: parseLocalDate(context.endDate) };
}

export function dateError(value: string, bounds: DateBounds): string | undefined {
  if (value === '') {
    return 'Escribe la fecha.';
  }
  if (!isLocalDate(value)) {
    return 'Escribe una fecha válida con el formato dd/mm/aaaa.';
  }
  if (compareLocalDate(value, bounds.min) < 0) {
    return `La fecha no puede ser anterior al desembolso del préstamo (${formatLocalDate(bounds.min)}).`;
  }
  if (compareLocalDate(value, bounds.max) > 0) {
    return `La fecha no puede ser posterior al fin del préstamo (${formatLocalDate(bounds.max)}).`;
  }
  return undefined;
}

export function moneyError(value: string, options: { readonly positive: boolean }): string | undefined {
  if (value === '') {
    return 'Escribe un monto.';
  }
  if (value.startsWith('-')) {
    return 'El monto no puede ser negativo.';
  }
  if (!isMoney(value)) {
    return 'Escribe un monto válido, por ejemplo 1,234.56.';
  }
  if (options.positive && moneyIsZero(value)) {
    return 'El monto debe ser mayor que cero.';
  }
  return undefined;
}

export function integerError(value: string, min: number, max: number): string | undefined {
  if (value === '') {
    return 'Escribe un número entero.';
  }
  if (!/^\d+$/.test(value)) {
    return 'Escribe un número entero, sin decimales.';
  }
  const parsed = Number.parseInt(value, 10);
  return parsed < min || parsed > max ? `El número debe estar entre ${min} y ${max}.` : undefined;
}

/** [ALG.EVENTS.ANCHOR] rule 2: the first installment due on or after `date`; '' while there is no valid date. */
export function suggestInstallment(context: BuildContext, date: string): string {
  if (date === '') {
    return '';
  }
  const k = installmentOnOrAfter(
    parseLocalDate(context.firstDueDate),
    parsePaymentDay(context.paymentDay),
    parseLocalDate(date),
  );
  return String(k);
}

/* ---------- DTO building ---------- */

export type BuildResult =
  { readonly ok: true; readonly value: FormValue } | { readonly ok: false; readonly field: ModelField | null };

const STAMP_ID = '00000000-0000-4000-8000-000000000000';
/** Placeholder stamp so the entity schemas can judge a draft; never stored. */
const SYNTHETIC_STAMP = {
  id: STAMP_ID,
  createdAt: '2000-01-01T00:00:00.000Z',
  updatedAt: '2000-01-01T00:00:00.000Z',
  updatedByDevice: STAMP_ID,
  deletedAt: null,
} as const;

function note(model: EventFormModel): { note?: string } {
  const trimmed = model.note.trim();
  return trimmed === '' ? {} : { note: trimmed };
}

function integer(text: string): number {
  return Number.parseInt(text, 10);
}

function draftOf(kind: FormKind, model: EventFormModel, context: BuildContext): FormValue {
  const loanId = context.loanId;
  switch (kind) {
    case 'ReportedBalance': {
      const draft: ReportedBalanceDraft = {
        loanId,
        date: model.date,
        ...(model.installmentNumber === '' ? {} : { installmentNumber: integer(model.installmentNumber) }),
        balance: model.balance,
        ...(model.totalInstallment === '' ? {} : { totalInstallment: model.totalInstallment }),
        ...(model.reportedRate === '' ? {} : { reportedRate: model.reportedRate }),
        source: model.source as ReportedBalanceSource,
        ...note(model),
      };
      return { entity: 'ReportedBalance', draft };
    }
    case 'ActualPayment': {
      const { capital, interest, insurance, fixedCharges } = model.breakdown;
      const hasBreakdown = [capital, interest, insurance, fixedCharges].some((part) => part !== '');
      const draft: ActualPaymentDraft = {
        loanId,
        paidDate: model.date,
        installmentNumber: integer(model.installmentNumber),
        total: model.total,
        ...(hasBreakdown ? { breakdown: { capital, interest, insurance, fixedCharges } } : {}),
        ...note(model),
      };
      return { entity: 'ActualPayment', draft };
    }
    case 'RateChange': {
      const policy = model.policy as RateChangePolicy;
      const draft: LoanEventDraft = {
        loanId,
        date: model.date,
        type: 'RateChange',
        policy,
        ...(model.interestRate === '' ? {} : { interestRate: model.interestRate }),
        ...(model.insuranceRates === undefined ? {} : { insuranceRates: [...model.insuranceRates] }),
        ...(policy === 'BANK_INSTALLMENT' ? { bankInstallment: model.bankInstallment } : {}),
        ...note(model),
      };
      return { entity: 'LoanEvent', draft };
    }
    case 'FixedChargeChange': {
      const draft: LoanEventDraft = {
        loanId,
        date: model.date,
        type: 'FixedChargeChange',
        fixedCharges: model.fixedCharges.map((charge) => ({ label: charge.label.trim(), amount: charge.amount })),
        ...note(model),
      };
      return { entity: 'LoanEvent', draft };
    }
    case 'Prepayment': {
      const commission =
        model.commissionKind === 'FLAT'
          ? { commission: { kind: 'FLAT' as const, amount: model.commissionAmount } }
          : model.commissionKind === 'PERCENT'
            ? { commission: { kind: 'PERCENT' as const, rate: model.commissionRate } }
            : {};
      const draft: LoanEventDraft = {
        loanId,
        date: model.date,
        type: 'Prepayment',
        amount: model.amount,
        mode: model.mode as PrepaymentMode,
        ...commission,
        ...note(model),
      };
      return { entity: 'LoanEvent', draft };
    }
    case 'AdvanceInstallments': {
      const draft: LoanEventDraft = {
        loanId,
        date: model.date,
        type: 'AdvanceInstallments',
        count: integer(model.count),
        ...note(model),
      };
      return { entity: 'LoanEvent', draft };
    }
  }
}

/** Schema issue path → the model field (control or fieldset) it belongs to; null when the form has no such field. */
function fieldOfIssue(kind: FormKind, path: readonly PropertyKey[]): ModelField | null {
  const head = String(path[0] ?? '');
  if (kind === 'ActualPayment' && head === 'paidDate') {
    return 'date';
  }
  if (kind === 'Prepayment' && head === 'commission') {
    return path[1] === 'rate' ? 'commissionRate' : path[1] === 'amount' ? 'commissionAmount' : 'commissionKind';
  }
  const known: readonly string[] = Object.keys(emptyModel());
  return known.includes(head) && fieldApplies(kind, head as ModelField) ? (head as ModelField) : null;
}

/**
 * Builds the DTO and judges it with its W0-04 entity schema (stamped with placeholder metadata). On failure it names
 * the model field, never the schema message: the UI shows its own Spanish text.
 */
export function buildValue(kind: FormKind, model: EventFormModel, context: BuildContext): BuildResult {
  const value = draftOf(kind, model, context);
  const stamped = { ...SYNTHETIC_STAMP, ...value.draft };
  const parsed =
    value.entity === 'ReportedBalance'
      ? reportedBalanceSchema.safeParse(stamped)
      : value.entity === 'ActualPayment'
        ? actualPaymentSchema.safeParse(stamped)
        : loanEventSchema.safeParse(stamped);
  if (parsed.success) {
    return { ok: true, value };
  }
  const issue = parsed.error.issues[0];
  return { ok: false, field: fieldOfIssue(kind, issue?.path ?? []) };
}
