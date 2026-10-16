import { InvalidInputError, NegativeAmortizationError } from '@cuotascasa/domain';
import { DataError } from '../../../data/api.ts';

/** Spanish (es-GT) texts of the loan wizard. Domain and data errors are mapped by code: `.message` is never shown. */
export const MESSAGES = {
  nameRequired: 'Escribe un alias para identificar el préstamo.',
  nameTooLong: 'El alias admite como máximo 80 caracteres.',
  bankTooLong: 'El banco admite como máximo 80 caracteres.',
  currencyRequired: 'Elige la moneda del préstamo.',
  templateRequired: 'Elige una plantilla.',
  principalRequired: 'El monto del préstamo es obligatorio.',
  principalPositive: 'El monto del préstamo debe ser mayor que cero.',
  termRequired: 'El plazo es obligatorio.',
  termInvalid: 'El plazo debe ser un número entero de meses entre 1 y 1200.',
  interestRequired: 'La tasa de interés es obligatoria. Escribe 0 si el préstamo no cobra interés.',
  rateTypeRequired: 'Elige si la tasa es fija o variable.',
  paymentDayRequired: 'Elige el día de pago.',
  paymentDayInvalid: 'El día de pago debe ser un día del 1 al 31 o fin de mes.',
  firstDueDateRequired: 'La fecha de la primera cuota es obligatoria.',
  firstDueDateMismatch:
    'La fecha de la primera cuota no coincide con el día de pago elegido. Corrige la fecha o el día de pago.',
  disbursementRequired: 'La fecha de desembolso es obligatoria.',
  disbursementAfterFirstDue: 'La fecha de desembolso no puede ser posterior a la primera cuota.',
  interestRateInvalid: 'La tasa de interés debe ser un número mayor o igual que cero.',
  insuranceRateRequired: 'Escribe la tasa del seguro. Escribe 0 si no aplica.',
  insuranceRateInvalid: 'La tasa del seguro debe ser un número mayor o igual que cero.',
  roundingRequired: 'Elige el perfil de redondeo.',
  roundingInvalid: 'El perfil de redondeo debe ser FHA_GT_V1 o SIMPLE.',
  bankTotalNegative: 'La cuota total del banco no puede ser negativa.',
  chargeLabelRequired: 'Escribe el nombre del concepto.',
  chargeLabelTooLong: 'El nombre del concepto admite como máximo 60 caracteres.',
  chargeAmountRequired: 'Escribe el monto del concepto.',
  chargeAmountNegative: 'El monto del concepto no puede ser negativo.',
  fixedChargesNegative:
    'La cuota total del banco es menor que la cuota nivelada calculada: revisa la tasa, el plazo o los seguros.',
  fixedChargesMismatch: 'Los conceptos deben sumar exactamente los cargos fijos calculados.',
  anchorBalanceNegative: 'El saldo no puede ser negativo.',
  anchorKRequired: 'Indica la cuota a la que corresponde el saldo (antes de pagarla).',
  anchorKInvalid: 'La cuota debe ser un número entero mayor que cero.',
  anchorDateRequired: 'Escribe la fecha del aviso del banco.',
  anchorSourceRequired: 'Elige dónde leíste el saldo.',
  // Cause texts of [ALG.VALIDATE] (spec §9 «Asistente», HU-04).
  causeMisalignment: 'El saldo parece corresponder a otra cuota (¿la anterior o la siguiente?)',
  causeUnknown: 'Diferencia sin causa identificada: revisa tasa, seguros o cargos',
  saveFailed: 'No se pudo guardar el préstamo. No se escribió nada; revisa los datos e inténtalo de nuevo.',
  saveStorage:
    'No se pudo guardar en este navegador (almacenamiento lleno o bloqueado). No se escribió nada del préstamo.',
  unexpected: 'No se pudo completar la operación. Revisa los datos e inténtalo de nuevo.',
} as const;

/** Spanish text of an error raised by the engine, the facade or a store. Looks only at the type and the code. */
export function describeError(error: unknown, termMonths?: number): string {
  if (error instanceof InvalidInputError) {
    switch (error.code) {
      case 'FIRST_DUE_DATE_MISMATCH':
        return MESSAGES.firstDueDateMismatch;
      case 'INSTALLMENT_OUT_OF_RANGE': {
        const detail = error.details['max'];
        const max = typeof detail === 'number' ? detail : termMonths;
        return max === undefined
          ? 'La cuota está fuera del plazo del préstamo.'
          : `La cuota debe estar entre 1 y ${String(max)}.`;
      }
      case 'NEGATIVE_FIXED_CHARGES':
        return MESSAGES.fixedChargesNegative;
      case 'INVALID_TERMS':
      case 'INVALID_MONEY':
      case 'INVALID_RATE':
      case 'INVALID_PERCENT':
      case 'INVALID_DATE':
      case 'INVALID_PAYMENT_DAY':
      case 'INVALID_INTEGER':
        return 'Las condiciones del préstamo no son válidas: revisa el monto, el plazo, las tasas y las fechas.';
      default:
        return MESSAGES.unexpected;
    }
  }
  if (error instanceof NegativeAmortizationError) {
    return `La cuota nivelada no alcanza a cubrir los intereses y seguros de la cuota ${String(error.k)}: revisa la tasa, el plazo o los seguros.`;
  }
  if (error instanceof DataError) {
    return error.code === 'STORAGE' ? MESSAGES.saveStorage : MESSAGES.saveFailed;
  }
  return MESSAGES.unexpected;
}
