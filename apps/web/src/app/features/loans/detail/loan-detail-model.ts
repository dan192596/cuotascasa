import { type DomainError, listTemplates, type Money, moneySum, parseMoney } from '@cuotascasa/domain';
import type { Loan, LoanStatus } from '@cuotascasa/schema';
import { DataError, type LoanUpdate } from '../../../data/api.ts';
import { describeError, MESSAGES } from '../wizard/wizard-messages.ts';
import {
  applyTemplate,
  type ChargeRow,
  DEFAULT_ANCHOR_SOURCE,
  END_OF_MONTH_VALUE,
  INSURANCE_LABELS,
  levelOf,
  moneyOf,
  toLoanDraft,
  type WizardModel,
} from '../wizard/wizard-model.ts';

/** Singular labels of the loan status (R28). */
export const STATUS_LABELS: Readonly<Record<LoanStatus, string>> = {
  active: 'Activo',
  paid: 'Pagado',
  archived: 'Archivado',
};

/** Insurance kinds of the template catalog by row position; empty when the template is unknown. */
function templateKinds(model: WizardModel): readonly WizardModel['insurance'][number]['kind'][] {
  try {
    return applyTemplate(model, model.templateKey).insurance.map((row) => row.kind);
  } catch {
    return [];
  }
}

/** Bank total = level + the named fixed charges, as text. Rows that are empty or malformed add nothing. */
export function bankTotalOf(level: Money, charges: readonly ChargeRow[]): string {
  const amounts = charges.map((row) => moneyOf(row.amount)).filter((amount): amount is Money => amount !== null);
  return moneySum([level, ...amounts]);
}

/**
 * The text model of the wizard steps for a stored loan. The loan does not store kinds of insurance or the bank total:
 * the kinds come from its template by position, and the bank total is rebuilt as level + fixed charges, so an
 * untouched form reproduces the stored loan.
 */
export function modelOfLoan(loan: Loan): WizardModel {
  const base: WizardModel = {
    templateKey: `${loan.templateRef.id}@${String(loan.templateRef.version)}`,
    name: loan.name,
    bank: loan.bank,
    currency: loan.currency,
    principal: loan.principal,
    termMonths: String(loan.termMonths),
    interestRate: loan.interestRate,
    rateType: loan.rateType,
    paymentDay: loan.paymentDay === 'END_OF_MONTH' ? END_OF_MONTH_VALUE : String(loan.paymentDay),
    firstDueDate: loan.firstDueDate,
    disbursementDate: loan.disbursementDate,
    insurance: [],
    roundingProfile: loan.roundingProfile,
    bankTotal: '',
    charges: loan.fixedCharges.map((charge) => ({ label: charge.label, amount: charge.amount })),
    anchorBalance: '',
    anchorK: '',
    anchorDate: '',
    anchorSource: DEFAULT_ANCHOR_SOURCE,
  };
  const kinds = templateKinds(base);
  const withInsurance: WizardModel = {
    ...base,
    insurance: loan.insuranceRates.map((rate, index) => ({ kind: kinds[index] ?? 'other', rate })),
  };
  if (loan.fixedCharges.length === 0) return withInsurance;
  try {
    return { ...withInsurance, bankTotal: bankTotalOf(levelOf(withInsurance), withInsurance.charges) };
  } catch {
    return withInsurance;
  }
}

/**
 * The record to write when saving the edit. Status and template reference are the stored ones. A charge that is still
 * in the loan keeps its start date (following the first due date when it started there); new ones start at it.
 */
export function toLoanUpdate(
  loan: Loan,
  model: WizardModel,
  lines: readonly { label: string; amount: Money }[],
): LoanUpdate {
  const draft = toLoanDraft(model, lines);
  const fixedCharges = draft.fixedCharges.map((charge) => {
    const previous = loan.fixedCharges.find(
      (candidate) => candidate.label === charge.label && parseMoney(candidate.amount) === charge.amount,
    );
    if (previous === undefined) return charge;
    return {
      ...charge,
      effectiveFrom: previous.effectiveFrom === loan.firstDueDate ? charge.effectiveFrom : previous.effectiveFrom,
    };
  });
  return { ...draft, fixedCharges, id: loan.id, status: loan.status, templateRef: loan.templateRef };
}

/** «Plantilla FHA Guatemala v1 (versión 1)» style label; unknown templates show their reference. */
export function templateLabel(ref: Loan['templateRef']): string {
  const template = listTemplates().find((candidate) => candidate.id === ref.id && candidate.version === ref.version);
  return template === undefined ? `${ref.id} (versión ${String(ref.version)})` : template.name;
}

export function paymentDayLabel(day: Loan['paymentDay']): string {
  return day === 'END_OF_MONTH' ? 'Fin de mes' : `Día ${String(day)}`;
}

/** Stored insurance rates with the label of their kind (by template position). */
export function insuranceLines(loan: Loan): readonly { readonly label: string; readonly rate: string }[] {
  const model = modelOfLoan(loan);
  return model.insurance.map((row) => ({ label: INSURANCE_LABELS[row.kind], rate: row.rate }));
}

/** Spanish text of a failed edit or status change. Only the type and the code are read: messages may carry data. */
export function describeActionError(error: unknown): string {
  if (error instanceof DataError) {
    switch (error.code) {
      case 'NOT_FOUND':
        return 'Este préstamo ya no existe en este navegador. Vuelve a Mis préstamos.';
      case 'CURRENCY_LOCKED':
        return 'La moneda ya no se puede cambiar porque el préstamo tiene eventos, saldos, pagos o escenarios. No se guardó ningún cambio.';
      case 'STORAGE':
        return 'No se pudo guardar en este navegador (almacenamiento lleno o bloqueado). No se escribió nada.';
      default:
        return 'No se pudo completar la operación. No se escribió nada; revisa los datos e inténtalo de nuevo.';
    }
  }
  const text = describeError(error);
  return text === MESSAGES.saveFailed ? MESSAGES.unexpected : text;
}

/** Domain errors of the projection are never shown raw (they may carry amounts): the text depends on the kind. */
export function describeProjectionError(error: DomainError): string {
  switch (error.kind) {
    case 'NegativeAmortization':
      return 'La cuota nivelada no alcanza para cubrir los intereses y seguros. Revisa las tasas y los cargos en «Editar condiciones».';
    case 'InvalidInput':
      return 'Algún dato de este préstamo no es válido, por eso no se pueden calcular las cifras. Revísalo en «Editar condiciones».';
    case 'CurrencyMismatch':
      return 'Hay montos en una moneda distinta a la del préstamo. Revísalos en «Datos reales».';
    default:
      return 'No se pudieron calcular las cifras de este préstamo. Revisa sus datos.';
  }
}
