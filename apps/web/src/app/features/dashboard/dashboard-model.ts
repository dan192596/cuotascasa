import { type DomainError, makeLocalDate } from '@cuotascasa/domain';
import type { LoansStore } from '../../data/api.ts';
import { formatLocalDate } from '../../ui/format/format.ts';

export type DashboardLoan = ReturnType<LoansStore['loans']>[number];
export type DashboardFilter = DashboardLoan['status'];

export const DASHBOARD_FILTERS: readonly DashboardFilter[] = ['active', 'paid', 'archived'];

/** Plural labels of the status filter (R28). */
export const FILTER_LABELS: Readonly<Record<DashboardFilter, string>> = {
  active: 'Activos',
  paid: 'Pagados',
  archived: 'Archivados',
};

/** Singular labels shown on each card. */
export const STATUS_LABELS: Readonly<Record<DashboardFilter, string>> = {
  active: 'Activo',
  paid: 'Pagado',
  archived: 'Archivado',
};

export function filterLoans(loans: readonly DashboardLoan[], filter: DashboardFilter): readonly DashboardLoan[] {
  return loans.filter((loan) => loan.status === filter);
}

/** Domain errors are never shown raw (they may carry amounts): the text depends only on the error kind. */
export function errorMessage(error: DomainError): string {
  switch (error.kind) {
    case 'NegativeAmortization':
      return 'La cuota no alcanza para cubrir los intereses. Revisa las tasas y los cargos de este préstamo.';
    case 'InvalidInput':
      return 'Algún dato de este préstamo no es válido. Revísalo en su detalle.';
    case 'CurrencyMismatch':
      return 'Hay montos en una moneda distinta a la del préstamo. Revísalos en su detalle.';
    default:
      return 'No se pudo calcular este préstamo. Revisa sus datos en el detalle.';
  }
}

/** Local calendar day of the stored instant as dd/mm/aaaa (no relative-time or threshold logic: the service decides). */
export function backupDateText(lastBackupAt: string | null): string {
  if (lastBackupAt === null) return 'Aún sin respaldo';
  const at = new Date(lastBackupAt);
  if (Number.isNaN(at.getTime())) return 'Fecha no disponible';
  return formatLocalDate(makeLocalDate(at.getFullYear(), at.getMonth() + 1, at.getDate()));
}
