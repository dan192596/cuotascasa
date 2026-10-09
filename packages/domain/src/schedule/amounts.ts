import { compareMoney, type Dec, dec, decInt, halfUp2, moneySub, moneySum, ZERO_MONEY } from '../money/index.ts';
import { type Money, NegativeAmortizationError, type Rate, type RoundingProfile } from '../types/primitives.ts';
import type { TermMode } from '../types/engine.ts';

/** Importes de una cuota antes de cargos fijos y abonos. */
export interface InstallmentAmounts {
  readonly interest: Money;
  /** Σ seguros porcentuales. */
  readonly insurance: Money;
  /** Seguro por componente, en el orden de `insuranceRates`. */
  readonly insuranceComponents: readonly Money[];
  readonly capital: Money;
}

/** Condiciones vigentes con las que se calcula una cuota. */
export interface InstallmentInput {
  readonly k: number;
  readonly opening: Money;
  readonly level: Money;
  readonly interestRate: Rate;
  readonly insuranceRates: readonly Rate[];
  readonly roundingProfile: RoundingProfile;
  readonly termMode: TermMode;
  readonly term: number;
}

/** Una cuota calculada: sus importes y si es la última del calendario ([ALG.LAST]). */
export interface CalculatedInstallment extends InstallmentAmounts {
  readonly isLast: boolean;
}

const MONTHS_PER_YEAR = decInt(12);

function sumRates(rates: readonly Rate[]): Dec {
  return rates.reduce((total, rate) => total.plus(dec(rate)), decInt(0));
}

function zeroComponents(rates: readonly Rate[]): Money[] {
  return rates.map(() => ZERO_MONEY);
}

/**
 * [ALG.PERIOD.SPLIT] Reparte `insurance` entre los componentes en orden de arreglo: HALF_UP_2((insurance · fⱼ) / f)
 * para j < m y el residuo para el último. Con f = 0 no hay reparto ([ALG.ZERO]): cada componente vale 0.00.
 */
function splitInsurance(insurance: Money, rates: readonly Rate[]): Money[] {
  const total = sumRates(rates);
  if (total.isZero()) {
    return zeroComponents(rates);
  }
  const components: Money[] = [];
  let assigned = ZERO_MONEY;
  for (const rate of rates.slice(0, -1)) {
    const component = halfUp2(dec(insurance).times(dec(rate)).div(total));
    components.push(component);
    assigned = moneySum([assigned, component]);
  }
  components.push(moneySub(insurance, assigned));
  return components;
}

/** [ALG.PERIOD.SIMPLE] Interés y seguros de `SIMPLE`, cada uno redondeado por separado. */
function simplePieces(opening: Money, interestRate: Rate, insuranceRates: readonly Rate[]) {
  const interest = halfUp2(dec(opening).times(dec(interestRate)).div(MONTHS_PER_YEAR));
  const insuranceComponents = insuranceRates.map((rate) => halfUp2(dec(opening).times(dec(rate)).div(MONTHS_PER_YEAR)));
  return { interest, insuranceComponents };
}

/**
 * Cuota calculada como normal: [ALG.PERIOD.FHA_GT_V1] o [ALG.PERIOD.SIMPLE]. `financialCharge` es el de [ALG.LAST]:
 * `charge` en FHA_GT_V1; `interest + Σ insuranceⱼ` en SIMPLE.
 */
function normalInstallment(input: InstallmentInput): InstallmentAmounts & { readonly financialCharge: Money } {
  const { opening, level, interestRate, insuranceRates, roundingProfile } = input;
  if (roundingProfile === 'SIMPLE') {
    const { interest, insuranceComponents } = simplePieces(opening, interestRate, insuranceRates);
    const insurance = moneySum(insuranceComponents);
    const financialCharge = moneySum([interest, insurance]);
    return { interest, insurance, insuranceComponents, capital: moneySub(level, financialCharge), financialCharge };
  }
  const insuranceTotal = sumRates(insuranceRates);
  const rateSum = dec(interestRate).plus(insuranceTotal);
  // [ALG.ZERO]: sin tasas no hay cargo y no se divide entre cero.
  const charge = rateSum.isZero() ? ZERO_MONEY : halfUp2(dec(opening).times(rateSum).div(MONTHS_PER_YEAR));
  // [ALG.ZERO]: con f = 0, interest = charge y no se aplica [ALG.PERIOD.SPLIT].
  const interest = insuranceTotal.isZero() ? charge : halfUp2(dec(charge).times(dec(interestRate)).div(rateSum));
  const insurance = moneySub(charge, interest);
  return {
    interest,
    insurance,
    insuranceComponents: splitInsurance(insurance, insuranceRates),
    capital: moneySub(level, charge),
    financialCharge: charge,
  };
}

/** [ALG.LAST] Última cuota: capital = B, interés HALF_UP_2(B · i / 12) y seguros sobre B (FHA_GT_V1 los reparte). */
function lastInstallment(input: InstallmentInput): InstallmentAmounts {
  const { opening, interestRate, insuranceRates, roundingProfile } = input;
  if (roundingProfile === 'SIMPLE') {
    const { interest, insuranceComponents } = simplePieces(opening, interestRate, insuranceRates);
    return { interest, insurance: moneySum(insuranceComponents), insuranceComponents, capital: opening };
  }
  const interest = halfUp2(dec(opening).times(dec(interestRate)).div(MONTHS_PER_YEAR));
  const insurance = halfUp2(dec(opening).times(sumRates(insuranceRates)).div(MONTHS_PER_YEAR));
  return { interest, insurance, insuranceComponents: splitInsurance(insurance, insuranceRates), capital: opening };
}

/**
 * Calcula una cuota y decide si es la última. Se decide con el `financialCharge` de la cuota calculada como normal:
 * [ALG.LAST.FIXED_TERM] (la cuota `term`, o antes si `level − financialCharge ≥ B`) y [ALG.LAST.DERIVED_TERM] (la
 * primera con `level − financialCharge ≥ B`). En plazo derivado, una cuota normal con `level − financialCharge ≤ 0`
 * lanza `NegativeAmortizationError` ([ALG.TERM]). Es la única implementación: el bucle y las simulaciones de
 * `remainingTerm` y `projectCapital` la comparten.
 */
export function calculateInstallment(input: InstallmentInput): CalculatedInstallment {
  const normal = normalInstallment(input);
  const amortization = moneySub(input.level, normal.financialCharge);
  const settles = compareMoney(amortization, input.opening) >= 0;
  if (settles || (input.termMode === 'FIXED' && input.k >= input.term)) {
    return { ...lastInstallment(input), isLast: true };
  }
  if (input.termMode === 'DERIVED' && compareMoney(amortization, ZERO_MONEY) <= 0) {
    throw new NegativeAmortizationError('ALG.TERM', input.k, input.level, normal.financialCharge);
  }
  return {
    interest: normal.interest,
    insurance: normal.insurance,
    insuranceComponents: normal.insuranceComponents,
    capital: normal.capital,
    isLast: false,
  };
}
