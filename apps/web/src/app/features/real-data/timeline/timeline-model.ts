import {
  type Currency,
  type DeltaCause,
  type DomainError,
  InvalidInputError,
  moneyIsNegative,
  moneyIsZero,
  NegativeAmortizationError,
  parseMoney,
  moneySum,
} from '@cuotascasa/domain';
import type {
  ActualPayment,
  LoanEvent,
  PrepaymentMode,
  RateChangePolicy,
  ReportedBalance,
  ReportedBalanceSource,
  Uuid,
} from '@cuotascasa/schema';
import type { RealRecordWrite } from '../../../data/api.ts';
import { formatMoney, formatPercent } from '../../../ui/format/format.ts';
import type { EventFormKind, EventFormValue } from '../forms/event-form.component.ts';

/** Pure logic of cc-real-data-timeline: merging, ordering, describing and mapping. No Angular here. */

export type TimelineEntry =
  | { readonly entity: 'ReportedBalance'; readonly date: string; readonly record: ReportedBalance }
  | { readonly entity: 'ActualPayment'; readonly date: string; readonly record: ActualPayment }
  | { readonly entity: 'LoanEvent'; readonly date: string; readonly record: LoanEvent };

/** Same-day order: the bank's reported balance first, then payments, then events ([ALG.EVENTS.ORDER] reads the same way). */
const ENTITY_ORDER: Readonly<Record<TimelineEntry['entity'], number>> = {
  LoanEvent: 2,
  ReportedBalance: 0,
  ActualPayment: 1,
};

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Dated timeline of every real record of a loan: by date, then kind, then creation instant, then id. */
export function buildTimeline(
  balances: readonly ReportedBalance[],
  payments: readonly ActualPayment[],
  events: readonly LoanEvent[],
): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...balances.map((record): TimelineEntry => ({ entity: 'ReportedBalance', date: record.date, record })),
    ...payments.map((record): TimelineEntry => ({ entity: 'ActualPayment', date: record.paidDate, record })),
    ...events.map((record): TimelineEntry => ({ entity: 'LoanEvent', date: record.date, record })),
  ];
  return entries.sort(
    (a, b) =>
      compareText(a.date, b.date) ||
      ENTITY_ORDER[a.entity] - ENTITY_ORDER[b.entity] ||
      compareText(a.record.createdAt, b.record.createdAt) ||
      compareText(a.record.id, b.record.id),
  );
}

export function entryFormKind(entry: TimelineEntry): EventFormKind {
  return entry.entity === 'LoanEvent' ? entry.record.type : entry.entity;
}

const STAMP_FIELDS: ReadonlySet<string> = new Set(['id', 'createdAt', 'updatedAt', 'updatedByDevice', 'deletedAt']);

type StampField = 'id' | 'createdAt' | 'updatedAt' | 'updatedByDevice' | 'deletedAt';
/** A stored record without the fields the store owns, distributed over the LoanEvent union. */
type Unstamped<T> = T extends unknown ? Omit<T, StampField> : never;

function withoutStamps<T extends object>(record: T): Unstamped<T> {
  const entries = Object.entries(record).filter(([key]) => !STAMP_FIELDS.has(key));
  // Only the stamp keys are removed, which is exactly `Unstamped<T>`.
  return Object.fromEntries(entries) as Unstamped<T>;
}

/** The stored record as the draft cc-event-form edits (its stamps are the store's business). */
export function entryToFormValue(entry: TimelineEntry): EventFormValue {
  switch (entry.entity) {
    case 'ReportedBalance':
      return { entity: 'ReportedBalance', draft: withoutStamps(entry.record) };
    case 'ActualPayment':
      return { entity: 'ActualPayment', draft: withoutStamps(entry.record) };
    case 'LoanEvent':
      return { entity: 'LoanEvent', draft: withoutStamps(entry.record) };
  }
}

/** Adds the id of the edited record to a draft; a create keeps the draft as it is. */
function withId<T extends object>(draft: T, id: Uuid | null): T | (T & { readonly id: Uuid }) {
  return id === null ? draft : { ...draft, id };
}

/** The record about to be written, for the dry run of `checkRealWrite` and for the store: an update carries the id. */
export function toRealWrite(value: EventFormValue, editingId: Uuid | null): RealRecordWrite {
  switch (value.entity) {
    case 'ReportedBalance':
      return { entity: 'ReportedBalance', record: withId(value.draft, editingId) };
    case 'ActualPayment':
      return { entity: 'ActualPayment', record: withId(value.draft, editingId) };
    case 'LoanEvent':
      return { entity: 'LoanEvent', record: withId(value.draft, editingId) };
  }
}

/* ---------- Spanish texts ---------- */

const SOURCE_TEXT: Readonly<Record<ReportedBalanceSource, string>> = {
  BANK_EMAIL: 'Correo del banco',
  ONLINE_BANKING: 'Banca en línea',
  BANK_SCHEDULE: 'Tabla de cuotas del banco',
  OTHER: 'Otro',
};

const POLICY_TEXT: Readonly<Record<RateChangePolicy, string>> = {
  RECALC_INSTALLMENT_KEEP_TERM: 'Recalcular la cuota y mantener el plazo',
  KEEP_INSTALLMENT_ADJUST_TERM: 'Mantener la cuota y ajustar el plazo',
  BANK_INSTALLMENT: 'Usar la cuota que informa el banco',
};

const MODE_TEXT: Readonly<Record<PrepaymentMode, string>> = {
  REDUCE_TERM: 'Reduce el plazo',
  REDUCE_INSTALLMENT: 'Reduce la cuota',
};

export interface EntryDescription {
  readonly title: string;
  readonly lines: readonly string[];
}

/** Kind name of an entry for buttons and announcements («el saldo reportado», …). */
export const KIND_NOUNS: Readonly<Record<EventFormKind, string>> = {
  ReportedBalance: 'saldo reportado',
  ActualPayment: 'pago real',
  RateChange: 'cambio de tasa',
  FixedChargeChange: 'cambio de cargos fijos',
  Prepayment: 'abono a capital',
  AdvanceInstallments: 'adelanto de cuotas',
};

export function describeEntry(entry: TimelineEntry, currency: Currency): EntryDescription {
  const base = describeBase(entry, currency);
  const note = entry.record.note;
  return note === undefined ? base : { ...base, lines: [...base.lines, `Nota: ${note}`] };
}

function describeBase(entry: TimelineEntry, currency: Currency): EntryDescription {
  const money = (value: string): string => formatMoney(value, currency);
  switch (entry.entity) {
    case 'ReportedBalance': {
      const { record } = entry;
      return {
        title: 'Saldo reportado',
        lines: [
          `Saldo: ${money(record.balance)}`,
          record.installmentNumber === undefined
            ? 'Cuota: la primera con vencimiento desde esa fecha'
            : `Cuota ${String(record.installmentNumber)}`,
          `Origen: ${SOURCE_TEXT[record.source]}`,
          ...(record.totalInstallment === undefined
            ? []
            : [`Cuota informada por el banco: ${money(record.totalInstallment)}`]),
          ...(record.reportedRate === undefined ? [] : [`Tasa informada: ${formatPercent(record.reportedRate)} %`]),
        ],
      };
    }
    case 'ActualPayment': {
      const { record } = entry;
      const { breakdown } = record;
      return {
        title: 'Pago real',
        lines: [
          `Cuota ${String(record.installmentNumber)}`,
          `Monto pagado: ${money(record.total)}`,
          ...(breakdown === undefined
            ? []
            : [
                `Desglose: capital ${money(breakdown.capital)}, interés ${money(breakdown.interest)}, seguro ${money(breakdown.insurance)}, cargos ${money(breakdown.fixedCharges)}`,
              ]),
        ],
      };
    }
    case 'LoanEvent':
      return describeEvent(entry.record, money);
  }
}

function describeEvent(event: LoanEvent, money: (value: string) => string): EntryDescription {
  switch (event.type) {
    case 'RateChange':
      return {
        title: 'Cambio de tasa',
        lines: [
          ...(event.interestRate === undefined ? [] : [`Nueva tasa: ${formatPercent(event.interestRate)} %`]),
          ...(event.insuranceRates === undefined ? [] : ['Cambian las tasas de seguro']),
          ...(event.policy === 'BANK_INSTALLMENT' && event.bankInstallment !== undefined
            ? [`Cuota del banco: ${money(event.bankInstallment)}`]
            : [POLICY_TEXT[event.policy]]),
        ],
      };
    case 'FixedChargeChange': {
      const count = event.fixedCharges.length;
      if (count === 0) {
        return { title: 'Cambio de cargos fijos', lines: ['Sin cargos fijos desde esa fecha'] };
      }
      const total = moneySum(event.fixedCharges.map((charge) => parseMoney(charge.amount)));
      return {
        title: 'Cambio de cargos fijos',
        lines: [`${String(count)} ${count === 1 ? 'cargo' : 'cargos'} por ${money(total)} al mes`],
      };
    }
    case 'Prepayment': {
      const { commission } = event;
      return {
        title: 'Abono a capital',
        lines: [
          `Monto: ${money(event.amount)}`,
          MODE_TEXT[event.mode],
          ...(commission === undefined
            ? []
            : [
                `Comisión: ${commission.kind === 'FLAT' ? money(commission.amount) : `${formatPercent(commission.rate)} %`}`,
              ]),
        ],
      };
    }
    case 'AdvanceInstallments':
      return { title: 'Adelanto de cuotas', lines: [`Cuotas adelantadas: ${String(event.count)}`] };
  }
}

/** Signed difference: positive gets a plus sign; zero and negatives keep the format of `formatMoney`. */
export function formatDelta(delta: string, currency: Currency): string {
  const money = parseMoney(delta);
  const text = formatMoney(money, currency);
  return moneyIsNegative(money) || moneyIsZero(money) ? text : `+${text}`;
}

/* ---------- Engine errors ---------- */

export const GENERIC_ENGINE_ERROR =
  'No se pudo calcular el préstamo con estos datos reales. Revisa los registros e inténtalo de nuevo.';

/**
 * Spanish text of an engine error, by type and code only: the message can carry amounts and is never shown.
 * A negative amortization is explained the way HU-10 asks (the installment no longer covers the financial charge).
 */
export function describeEngineError(error: DomainError | Error): string {
  if (error instanceof NegativeAmortizationError) {
    return `Amortización negativa: la cuota nivelada ya no cubre los intereses y seguros de la cuota ${String(error.k)}. Revisa la tasa nueva, la política elegida o la cuota que informó el banco.`;
  }
  if (error instanceof InvalidInputError) {
    switch (error.code) {
      case 'INSTALLMENT_OUT_OF_RANGE':
        return 'La cuota indicada queda fuera del plazo del préstamo.';
      case 'MISSING_INSTALLMENT_NUMBER':
        return 'Indica a qué cuota corresponde el pago.';
      case 'INVALID_EVENT':
        return 'Alguno de los registros no es válido para el cálculo. Revísalo e inténtalo de nuevo.';
      case 'HYPOTHETICAL_BEFORE_CUTOFF':
        return 'Un evento de escenario queda antes de los datos reales. Revisa tus escenarios.';
      default:
        return GENERIC_ENGINE_ERROR;
    }
  }
  return GENERIC_ENGINE_ERROR;
}

/** Cause of a Real Δ that is not green ([ALG.VALIDATE]); same wording as the loan wizard. */
export function describeCause(cause: DeltaCause | null): string | null {
  switch (cause) {
    case 'INSTALLMENT_MISALIGNMENT':
      return 'El saldo parece corresponder a otra cuota (¿la anterior o la siguiente?)';
    case 'UNKNOWN':
      return 'Diferencia sin causa identificada: revisa tasa, seguros o cargos';
    default:
      return null;
  }
}

/** Spanish text of a rejected store write, by code only (a DataError message never carries entity values). */
export function describeSaveError(error: unknown, action: 'save' | 'delete' = 'save'): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? (error as { code: unknown }).code : null;
  switch (code) {
    case 'STORAGE':
      return 'No se pudo escribir en este navegador (almacenamiento lleno o bloqueado). No se cambió nada.';
    case 'NOT_FOUND':
      return 'Ese registro ya no existe. Actualiza la pantalla e inténtalo de nuevo.';
    default:
      return action === 'delete'
        ? 'No se eliminó el registro. Inténtalo de nuevo.'
        : 'No se guardó. Revisa los datos e inténtalo de nuevo.';
  }
}
