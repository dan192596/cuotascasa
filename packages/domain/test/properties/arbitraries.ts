/**
 * Arbitraries sintéticos (fast-check) de condiciones de préstamo y de eventos para las pruebas de propiedades del
 * motor (W3-02). Todo se genera con semilla: ningún dato real. Los montos son strings decimales (nunca `number`).
 */
import fc from 'fast-check';
import { dueDateFor, makeLocalDate, parseLocalDate } from '../../src/dates/index.ts';
import { parseMoney, parseRate } from '../../src/money/index.ts';
import type {
  ActualPaymentEvent,
  AdvanceInstallmentsEvent,
  Commission,
  DomainEvent,
  FixedChargeChangeEvent,
  LoanTerms,
  Money,
  PaymentDay,
  PrepaymentEvent,
  PrepaymentMode,
  Rate,
  RateChangeEvent,
  RateChangePolicy,
  ReportedBalanceEvent,
  RoundingProfile,
} from '../../src/index.ts';

/** Centavos enteros → `Money`. Las propiedades razonan en centavos enteros para no usar `number` como dinero. */
export function centsToMoney(cents: number): Money {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return parseMoney(`${sign}${String(Math.floor(abs / 100))}.${String(abs % 100).padStart(2, '0')}`);
}

/** `Money` → centavos enteros (solo para generar datos de prueba; el dinero del motor nunca pasa por `number`). */
export function moneyToCents(money: Money): number {
  return Number(money.replace('.', ''));
}

/** Puntos básicos → `Rate` (1 pb = 0.0001). */
export function basisPointsToRate(basisPoints: number): Rate {
  return parseRate((basisPoints / 10_000).toFixed(4));
}

const PAYMENT_DAYS: readonly PaymentDay[] = ['END_OF_MONTH', 1, 5, 15, 28, 29, 30, 31];

/** Rango del plazo de las pruebas: lo bastante largo para tener eventos, lo bastante corto para correr en CI. */
export const MAX_TERM = 72;

export interface LoanTermsOptions {
  readonly maxTerm?: number;
  /** Fuerza el perfil de redondeo. */
  readonly roundingProfile?: RoundingProfile;
  /** Permite cargos fijos (por defecto sí). */
  readonly fixedCharges?: boolean;
}

/** Condiciones válidas: monto, plazo, tasas, seguros, cargos fijos, día de pago y moneda sintéticos. */
export function loanTermsArbitrary(options: LoanTermsOptions = {}): fc.Arbitrary<LoanTerms> {
  const maxTerm = options.maxTerm ?? MAX_TERM;
  return fc
    .record({
      principalCents: fc.integer({ min: 100_000, max: 90_000_000 }),
      termMonths: fc.integer({ min: 1, max: maxTerm }),
      interestBp: fc.oneof(
        { weight: 1, arbitrary: fc.constant(0) },
        { weight: 9, arbitrary: fc.integer({ min: 1, max: 2_500 }) },
      ),
      insuranceBp: fc.array(fc.integer({ min: 0, max: 300 }), { maxLength: 3 }),
      roundingProfile: options.roundingProfile
        ? fc.constant(options.roundingProfile)
        : fc.constantFrom<RoundingProfile>('FHA_GT_V1', 'SIMPLE'),
      paymentDay: fc.constantFrom(...PAYMENT_DAYS),
      year: fc.integer({ min: 2024, max: 2031 }),
      month: fc.integer({ min: 1, max: 12 }),
      currency: fc.constantFrom<'GTQ' | 'USD'>('GTQ', 'USD'),
      fixedChargeCents:
        options.fixedCharges === false
          ? fc.constant<number[]>([])
          : fc.array(fc.integer({ min: 0, max: 100_000 }), { maxLength: 2 }),
    })
    .map((s) => {
      // El día de `firstDueDate` debe cumplir la regla de `paymentDay` para su mes ([ALG.DATES]).
      const anchor = makeLocalDate(s.year, s.month, 1);
      const firstDueDate = dueDateFor(anchor, s.paymentDay, 1);
      const terms: LoanTerms = {
        principal: centsToMoney(s.principalCents),
        termMonths: s.termMonths,
        disbursementDate: parseLocalDate('2023-12-31'),
        firstDueDate,
        paymentDay: s.paymentDay,
        currency: s.currency,
        interestRate: basisPointsToRate(s.interestBp),
        insuranceRates: s.insuranceBp.map(basisPointsToRate),
        fixedCharges: s.fixedChargeCents.map((cents, index) => ({
          label: `cargo-${String(index)}`,
          amount: centsToMoney(cents),
          effectiveFrom: firstDueDate,
        })),
        roundingProfile: s.roundingProfile,
        rateType: 'VARIABLE',
      };
      return terms;
    });
}

/** Fecha de vencimiento de la cuota k de unas condiciones. Los eventos fechados ahí se asocian a la cuota k. */
export function dueDateOf(terms: LoanTerms, k: number) {
  return dueDateFor(terms.firstDueDate, terms.paymentDay, k);
}

/** Tipos de evento hipotético que genera `eventsArbitrary`. */
export type GeneratedEventKind = 'Prepayment' | 'AdvanceInstallments' | 'RateChange' | 'FixedChargeChange';

interface Slot {
  readonly kind: GeneratedEventKind;
  /** Posición relativa en [0, 1): se traduce a una cuota k del plazo de las condiciones. */
  readonly where: number;
  readonly amountPermille: number;
  readonly mode: PrepaymentMode;
  readonly commissionKind: 'NONE' | 'FLAT' | 'PERCENT';
  readonly commissionCents: number;
  readonly commissionBp: number;
  readonly count: number;
  readonly policy: RateChangePolicy;
  readonly newInterestBp: number | null;
  readonly newInsuranceBp: readonly number[] | null;
  readonly bankPermille: number;
  readonly chargeCents: readonly number[];
}

const slotArbitrary = (kinds: readonly GeneratedEventKind[]): fc.Arbitrary<Slot> =>
  fc.record({
    kind: fc.constantFrom(...kinds),
    where: fc.double({ min: 0, max: 0.999, noNaN: true }),
    amountPermille: fc.integer({ min: 1, max: 700 }),
    mode: fc.constantFrom<PrepaymentMode>('REDUCE_TERM', 'REDUCE_INSTALLMENT'),
    commissionKind: fc.constantFrom<'NONE' | 'FLAT' | 'PERCENT'>('NONE', 'NONE', 'FLAT', 'PERCENT'),
    commissionCents: fc.integer({ min: 0, max: 20_000 }),
    commissionBp: fc.integer({ min: 0, max: 300 }),
    count: fc.integer({ min: 1, max: 6 }),
    policy: fc.constantFrom<RateChangePolicy>(
      'RECALC_INSTALLMENT_KEEP_TERM',
      'KEEP_INSTALLMENT_ADJUST_TERM',
      'BANK_INSTALLMENT',
    ),
    newInterestBp: fc.option(fc.integer({ min: 0, max: 2_500 }), { nil: null }),
    newInsuranceBp: fc.option(fc.array(fc.integer({ min: 0, max: 300 }), { maxLength: 3 }), { nil: null }),
    bankPermille: fc.integer({ min: 500, max: 1_500 }),
    chargeCents: fc.array(fc.integer({ min: 0, max: 100_000 }), { maxLength: 2 }),
  });

function slotToEvent(terms: LoanTerms, slot: Slot, index: number): DomainEvent {
  const k = 1 + Math.floor(slot.where * terms.termMonths);
  const id = `evt-${String(index).padStart(3, '0')}`;
  const date = dueDateOf(terms, k);
  const principalCents = moneyToCents(terms.principal);
  switch (slot.kind) {
    case 'Prepayment': {
      const commission: Commission | undefined =
        slot.commissionKind === 'FLAT'
          ? { kind: 'FLAT', amount: centsToMoney(slot.commissionCents) }
          : slot.commissionKind === 'PERCENT'
            ? { kind: 'PERCENT', rate: basisPointsToRate(slot.commissionBp) }
            : undefined;
      const event: PrepaymentEvent = {
        type: 'Prepayment',
        id,
        date,
        amount: centsToMoney(Math.max(1, Math.floor((principalCents * slot.amountPermille) / 1_000))),
        mode: slot.mode,
        ...(commission ? { commission } : {}),
      };
      return event;
    }
    case 'AdvanceInstallments': {
      const event: AdvanceInstallmentsEvent = { type: 'AdvanceInstallments', id, date, count: slot.count };
      return event;
    }
    case 'RateChange': {
      const base = {
        id,
        date,
        ...(slot.newInterestBp === null ? {} : { interestRate: basisPointsToRate(slot.newInterestBp) }),
        ...(slot.newInsuranceBp === null ? {} : { insuranceRates: slot.newInsuranceBp.map(basisPointsToRate) }),
      };
      if (slot.policy === 'BANK_INSTALLMENT') {
        // Cuota nivelada informada: alrededor del promedio principal / plazo (puede quedar corta y lanzar).
        const bankCents = Math.max(
          1,
          Math.round((principalCents / terms.termMonths) * (slot.bankPermille / 1_000) * 1.2),
        );
        const event: RateChangeEvent = {
          type: 'RateChange',
          ...base,
          policy: 'BANK_INSTALLMENT',
          bankInstallment: centsToMoney(bankCents),
        };
        return event;
      }
      const event: RateChangeEvent = { type: 'RateChange', ...base, policy: slot.policy };
      return event;
    }
    case 'FixedChargeChange': {
      const event: FixedChargeChangeEvent = {
        type: 'FixedChargeChange',
        id,
        date,
        fixedCharges: slot.chargeCents.map((cents, i) => ({
          label: `cargo-${String(i)}`,
          amount: centsToMoney(cents),
        })),
      };
      return event;
    }
  }
}

export interface EventsOptions {
  readonly kinds?: readonly GeneratedEventKind[];
  readonly maxEvents?: number;
}

/** Eventos hipotéticos (sin anclas) cuyas fechas caen en vencimientos del plazo original. */
export function eventsArbitrary(terms: LoanTerms, options: EventsOptions = {}): fc.Arbitrary<DomainEvent[]> {
  const kinds = options.kinds ?? ['Prepayment', 'AdvanceInstallments', 'RateChange', 'FixedChargeChange'];
  return fc
    .array(slotArbitrary(kinds), { maxLength: options.maxEvents ?? 4 })
    .map((slots) => slots.map((slot, index) => slotToEvent(terms, slot, index)));
}

/** Préstamo junto con sus eventos hipotéticos. */
export interface LoanCase {
  readonly terms: LoanTerms;
  readonly events: DomainEvent[];
}

export function loanCaseArbitrary(options: LoanTermsOptions & EventsOptions = {}): fc.Arbitrary<LoanCase> {
  return loanTermsArbitrary(options).chain((terms) =>
    eventsArbitrary(terms, options).map((events) => ({ terms, events })),
  );
}

/** Un `ReportedBalance` en la cuota k con un saldo en torno al principal (puede quedar por encima o por debajo). */
export function reportedBalanceArbitrary(terms: LoanTerms): fc.Arbitrary<ReportedBalanceEvent> {
  return fc
    .record({
      k: fc.integer({ min: 1, max: terms.termMonths }),
      permille: fc.integer({ min: 20, max: 1_100 }),
      id: fc.constant('anchor-1'),
    })
    .map(({ k, permille, id }) => ({
      type: 'ReportedBalance' as const,
      id,
      date: dueDateOf(terms, k),
      installmentNumber: k,
      balance: centsToMoney(Math.max(1, Math.floor((moneyToCents(terms.principal) * permille) / 1_000))),
    }));
}

/** Pagos reales con `installmentNumber` en [1, termMonths]; no alteran el camino ([ALG.ACTUAL]). */
export function actualPaymentsArbitrary(terms: LoanTerms): fc.Arbitrary<ActualPaymentEvent[]> {
  return fc
    .array(
      fc.record({ k: fc.integer({ min: 1, max: terms.termMonths }), cents: fc.integer({ min: 1, max: 5_000_000 }) }),
      { maxLength: 4 },
    )
    .map((items) =>
      items.map(({ k, cents }, index) => ({
        type: 'ActualPayment' as const,
        id: `pay-${String(index).padStart(3, '0')}`,
        date: dueDateOf(terms, k),
        installmentNumber: k,
        total: centsToMoney(cents),
      })),
    );
}
