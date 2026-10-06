/**
 * Contrato congelado de W0-03: condiciones de un préstamo y plantillas ([ALG.TERMS], [ALG.TEMPLATES]).
 */
import type { Currency, LocalDate, Money, PaymentDay, Rate, RateType, RoundingProfile } from './primitives.ts';

/** Concepto de cargo fijo sin fecha: nombre libre y monto mensual (IUSI, seguro de daños…). */
export interface FixedChargeLine {
  readonly label: string;
  readonly amount: Money;
}

/** [ALG.FIXED] Cargo fijo de las condiciones: se suma al `total` de toda cuota con vencimiento ≥ `effectiveFrom`. */
export interface FixedCharge extends FixedChargeLine {
  readonly effectiveFrom: LocalDate;
}

/** [ALG.TERMS] Condiciones originales de un préstamo, ya validadas y con tipos marcados. */
export interface LoanTerms {
  /** Monto desembolsado (> 0). */
  readonly principal: Money;
  /** Plazo pactado en cuotas (entero ≥ 1). */
  readonly termMonths: number;
  /** Informativa: no genera interés extra en v1. */
  readonly disbursementDate: LocalDate;
  /** Vencimiento de la cuota 1; su día cumple la regla de `paymentDay` ([ALG.DATES]). */
  readonly firstDueDate: LocalDate;
  readonly paymentDay: PaymentDay;
  readonly currency: Currency;
  /** i: tasa de interés anual (≥ 0). */
  readonly interestRate: Rate;
  /** f₁…f_m: componentes porcentuales anuales sobre saldo, en orden de arreglo. */
  readonly insuranceRates: readonly Rate[];
  readonly fixedCharges: readonly FixedCharge[];
  readonly roundingProfile: RoundingProfile;
  /** Informativo: el motor lo ignora ([ALG.TERMS]). */
  readonly rateType: RateType;
}

/** [ALG.TEMPLATES] Ids de las plantillas versionadas en código. */
export const TEMPLATE_IDS = ['fha-gt', 'simple'] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

/** Referencia que guarda el préstamo: `{ id: 'fha-gt', version: 1 }` es `fha-gt@1`. */
export interface TemplateRef {
  readonly id: TemplateId;
  readonly version: number;
}

/** Rótulo de un componente porcentual (glosario: `mortgageInsurance`, `lifeInsurance`; «otro seguro %» es `other`). */
export type InsuranceKind = 'mortgageInsurance' | 'lifeInsurance' | 'other';

/** Componente porcentual de una plantilla, en el orden de `insuranceRates`. */
export interface TemplateInsuranceRate {
  readonly kind: InsuranceKind;
  readonly rate: Rate;
}

/** Valores que la plantilla precarga; `null` = «lo elige el usuario». El interés siempre lo ingresa el usuario. */
export interface TemplateValues {
  readonly insuranceRates: readonly TemplateInsuranceRate[];
  readonly roundingProfile: RoundingProfile;
  readonly paymentDay: PaymentDay | null;
  readonly rateType: RateType | null;
  /** Cargos fijos precargados (`[]` en las dos plantillas de v1, [ALG.TEMPLATES]); rigen desde `firstDueDate`. */
  readonly fixedCharges: readonly FixedChargeLine[];
}

/** [ALG.TEMPLATES] Plantilla versionada: `{ id, version, values }` más su nombre visible. */
export interface Template {
  readonly id: TemplateId;
  readonly version: number;
  /** Nombre visible en español, p. ej. 'FHA Guatemala v1'. */
  readonly name: string;
  readonly values: TemplateValues;
}

/**
 * Copia profunda y mutable de los valores de una plantilla para un préstamo nuevo.
 * Mutarla nunca altera la plantilla ([ALG.TEMPLATES]).
 */
export interface TemplateInstance {
  templateRef: TemplateRef;
  insuranceRates: TemplateInsuranceRate[];
  roundingProfile: RoundingProfile;
  paymentDay: PaymentDay | null;
  rateType: RateType | null;
  fixedCharges: FixedChargeLine[];
}
