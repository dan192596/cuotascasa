import { InvalidInputError } from '@cuotascasa/domain';

/** Estimate notice shown under the results (spec §9). */
export const DISCLAIMER = 'Cifras estimadas; el banco tiene la última palabra. No es asesoría financiera.';

/** Spanish (es-GT) field messages. Fixed texts: nothing here interpolates user input. */
export const SIMULATOR_MESSAGES = {
  principalRequired: 'Escribe el monto del préstamo.',
  principalPositive: 'El monto debe ser mayor que cero.',
  principalMax: 'El monto es demasiado grande. Usa como máximo 999,999,999,999.99.',
  rateRequired: 'Escribe la tasa de interés anual.',
  rateRange: 'La tasa debe estar entre 0 % y 100 %.',
  yearsRequired: 'Escribe el plazo en años.',
  yearsInteger: 'Escribe el plazo como un número entero de años, sin letras ni decimales.',
  yearsRange: 'El plazo debe estar entre 1 y 30 años.',
  prepayAmountRequired: 'Escribe el monto del abono.',
  prepayAmountPositive: 'El abono debe ser mayor que cero.',
  prepayAmountMax: 'El abono es demasiado grande. Usa como máximo 999,999,999,999.99.',
  prepayInstallmentRequired: 'Escribe el número de cuota después de la cual haces el abono.',
  prepayInstallmentInteger: 'La cuota debe ser un número entero, sin letras ni decimales.',
  prepayInstallmentMin: 'La cuota del abono debe ser 1 o mayor.',
  calculationFailed: 'No se pudo calcular con estos datos. Revisa el monto, la tasa, el plazo y el abono.',
  prepayOutOfRange: 'La cuota del abono queda fuera del plazo del préstamo.',
} as const;

/** `La cuota debe estar entre 1 y {max}.` for the prepayment installment, once the term is known. */
export function installmentRangeMessage(max: number): string {
  return `La cuota debe estar entre 1 y ${String(max)}, antes de la última cuota del plazo.`;
}

/**
 * Maps a thrown error to a fixed Spanish text by its kind and code. The error's own `message` is never shown: it
 * may carry amounts.
 */
export function describeSimulationError(error: unknown): string {
  if (error instanceof InvalidInputError) {
    return error.code === 'INSTALLMENT_OUT_OF_RANGE'
      ? SIMULATOR_MESSAGES.prepayOutOfRange
      : SIMULATOR_MESSAGES.calculationFailed;
  }
  return SIMULATOR_MESSAGES.calculationFailed;
}
