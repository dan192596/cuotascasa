import type { DomainError } from '@cuotascasa/domain';
import { DataError } from '../../data/api.ts';

/** Domain errors are never shown raw (they may carry amounts): the text depends only on the error kind. */
export function engineErrorText(error: DomainError, scenarioOnly: boolean): string {
  const prefix = scenarioOnly ? 'El escenario activo no se pudo calcular. ' : '';
  switch (error.kind) {
    case 'NegativeAmortization':
      return `${prefix}La cuota no alcanza para cubrir los intereses. Revisa las tasas y los cargos de este préstamo.`;
    case 'InvalidInput':
      return `${prefix}Algún dato no es válido. Revisa los eventos del escenario y los datos del préstamo.`;
    case 'CurrencyMismatch':
      return `${prefix}Hay montos en una moneda distinta a la del préstamo. Revísalos en su detalle.`;
    default:
      return `${prefix}No se pudo calcular este préstamo. Revisa sus datos en el detalle.`;
  }
}

/** Spanish text of a failed write; the error's own message is never shown. */
export function writeErrorText(error: unknown): string {
  if (error instanceof DataError) {
    switch (error.code) {
      case 'VALIDATION':
        return 'No se pudo guardar el abono: el monto no es válido para guardarlo.';
      case 'NOT_FOUND':
        return 'No se pudo guardar el abono: el escenario ya no existe.';
      case 'STORAGE':
        return 'No se pudo guardar el abono: falló el almacenamiento del navegador.';
      default:
        break;
    }
  }
  return 'No se pudo guardar el abono. Inténtalo de nuevo.';
}
