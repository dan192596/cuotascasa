import {
  addMonths,
  buildPaths,
  compareSchedules,
  endOfMonth,
  instantiateTemplate,
  InvalidInputError,
  moneyAdd,
  type LocalDate,
  type LoanTerms,
  type Money,
  type PrepaymentEvent,
  type PrepaymentMode,
  type Rate,
} from '@cuotascasa/domain';

/** The simulator is fixed to template fha-gt@1, GTQ and no fixed charges (spec §9 «Simulador»). */
const TEMPLATE = { id: 'fha-gt', version: 1 } as const;

export interface SimulationPrepayment {
  readonly amount: Money;
  /** The installment number k after which the prepayment is applied (1 ≤ k < termMonths). */
  readonly afterInstallment: number;
  readonly mode: PrepaymentMode;
}

export interface SimulationInput {
  readonly principal: Money;
  /** Annual interest rate as a fraction string, without insurance. */
  readonly annualRate: Rate;
  readonly termMonths: number;
  /** The browser's local date, from the injected clock. */
  readonly today: LocalDate;
  readonly prepayment: SimulationPrepayment | null;
}

export interface PrepaymentOutcome {
  readonly interestSaved: Money;
  readonly monthsSaved: number;
  readonly endDate: LocalDate;
  readonly installmentCount: number;
  /** The new level installment with REDUCE_INSTALLMENT; null otherwise (or when the prepayment pays the loan off). */
  readonly newLevel: Money | null;
}

export interface SimulationResult {
  readonly level: Money;
  readonly firstInstallment: { readonly interest: Money; readonly insurance: Money; readonly capital: Money };
  /** Σ(interest + insurance) of the base plan. */
  readonly totalInterestAndInsurance: Money;
  readonly installmentCount: number;
  readonly endDate: LocalDate;
  readonly prepayment: PrepaymentOutcome | null;
}

/** Last day of the month after `today`. */
export function firstDueDateAfter(today: LocalDate): LocalDate {
  return endOfMonth(addMonths(today, 1));
}

/** Runs the domain engine for the quick simulator. Throws the domain's typed errors on invalid ranges. */
export function simulate(input: SimulationInput): SimulationResult {
  const template = instantiateTemplate(TEMPLATE);
  const terms: LoanTerms = {
    principal: input.principal,
    termMonths: input.termMonths,
    disbursementDate: input.today,
    firstDueDate: firstDueDateAfter(input.today),
    paymentDay: 'END_OF_MONTH',
    currency: 'GTQ',
    interestRate: input.annualRate,
    insuranceRates: template.insuranceRates.map((line) => line.rate),
    fixedCharges: [],
    roundingProfile: template.roundingProfile,
    rateType: 'FIXED',
  };
  const base = buildPaths({ terms, realEvents: [], scenarioEvents: null }).original;
  const first = base.rows[0];
  if (first === undefined) {
    throw new Error('The base plan has no installments');
  }

  let prepayment: PrepaymentOutcome | null = null;
  if (input.prepayment !== null) {
    const { afterInstallment, amount, mode } = input.prepayment;
    // The event date is the due date of installment k, so [ALG.EVENTS.ANCHOR] rule 2 associates it with k.
    const anchorRow = base.rows[afterInstallment - 1];
    if (anchorRow === undefined || afterInstallment >= input.termMonths) {
      throw new InvalidInputError('INSTALLMENT_OUT_OF_RANGE', 'The prepayment installment is out of range', {
        k: afterInstallment,
        max: input.termMonths - 1,
      });
    }
    const date = anchorRow.dueDate;
    const event: PrepaymentEvent = { type: 'Prepayment', id: 'simulator-prepayment', date, amount, mode };
    const scenario = buildPaths({ terms, realEvents: [], scenarioEvents: [event] }).scenario;
    if (scenario === null) {
      throw new Error('The scenario was not built');
    }
    const metrics = compareSchedules(base, scenario);
    prepayment = {
      interestSaved: metrics.interestSaved,
      monthsSaved: metrics.monthsSaved,
      endDate: metrics.endDate,
      installmentCount: scenario.installmentCount,
      newLevel: mode === 'REDUCE_INSTALLMENT' ? (scenario.rows[afterInstallment]?.level ?? null) : null,
    };
  }

  return {
    level: first.level,
    firstInstallment: { interest: first.interest, insurance: first.insurance, capital: first.capital },
    totalInterestAndInsurance: moneyAdd(base.totals.interest, base.totals.insurance),
    installmentCount: base.installmentCount,
    endDate: base.endDate,
    prepayment,
  };
}
