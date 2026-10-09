import { compareLocalDate, dueDateFor } from '../dates/index.ts';
import { compareMoney, moneyAdd, moneySub, moneySum, periodicRate, ZERO_MONEY } from '../money/index.ts';
import type {
  EngineContext,
  HandlerResult,
  PeriodState,
  RowEffect,
  RunScheduleFn,
  BuildScheduleFn,
} from '../types/engine.ts';
import type { DomainEvent } from '../types/events.ts';
import type { FixedCharge, LoanTerms } from '../types/loan.ts';
import type { Money } from '../types/primitives.ts';
import type { AnchorRealDelta, ComponentRealDelta, Schedule, ScheduleRow, ScheduleTotals } from '../types/schedule.ts';
import { calculateInstallment } from './amounts.ts';
import { assertOwnEventsInRange, type PlacedEvent, placeEvents } from './placement.ts';
import { validateTerms } from './terms.ts';

interface DispatchInput {
  readonly ctx: EngineContext;
  readonly terms: LoanTerms;
  readonly event: DomainEvent;
  readonly k: number;
  readonly state: PeriodState;
  readonly projectedOpening: Money;
  readonly fixedCharges: readonly FixedCharge[];
  readonly row: ScheduleRow | null;
}

/** Despacha un evento al handler de su tipo en el registro del contexto. Un error del handler se propaga intacto. */
function dispatch({ event, ctx, ...rest }: DispatchInput): HandlerResult {
  const input = { ctx, ...rest };
  switch (event.type) {
    case 'ReportedBalance':
      return ctx.registry.ReportedBalance({ ...input, event });
    case 'RateChange':
      return ctx.registry.RateChange({ ...input, event });
    case 'FixedChargeChange':
      return ctx.registry.FixedChargeChange({ ...input, event });
    case 'Prepayment':
      return ctx.registry.Prepayment({ ...input, event });
    case 'AdvanceInstallments':
      return ctx.registry.AdvanceInstallments({ ...input, event });
    case 'ActualPayment':
      return ctx.registry.ActualPayment({ ...input, event });
  }
}

/** [ALG.EVENTS.ORDER] Fases 0 y 1 (antes de calcular la cuota k) y fases 3 y 4 (después). */
function isBeforeInstallment(item: PlacedEvent): boolean {
  return item.key.phase < 2;
}

/** Acumula los efectos de un handler de las fases 3–4 sobre la fila k. */
function applyRowEffect(row: ScheduleRow, effect: RowEffect | undefined): ScheduleRow {
  if (effect === undefined) {
    return row;
  }
  const prepayment = moneyAdd(row.prepayment, effect.prepayment ?? ZERO_MONEY);
  return {
    ...row,
    prepayment,
    commission: moneyAdd(row.commission, effect.commission ?? ZERO_MONEY),
    closingAfterPrepayment: moneySub(row.closing, prepayment),
    payoff: row.payoff || effect.payoff === true,
    paid: row.paid || effect.paid === true,
  };
}

/** [ALG.FIXED] Suma de los cargos fijos con `effectiveFrom` ≤ vencimiento. No afecta saldos. */
function fixedChargesFor(charges: readonly FixedCharge[], dueDate: ScheduleRow['dueDate']): Money {
  return moneySum(
    charges.filter((charge) => compareLocalDate(charge.effectiveFrom, dueDate) <= 0).map((c) => c.amount),
  );
}

function totalsOf(rows: readonly ScheduleRow[]): ScheduleTotals {
  const sum = (pick: (row: ScheduleRow) => Money): Money => moneySum(rows.map(pick));
  const total = sum((row) => row.total);
  const prepayments = sum((row) => row.prepayment);
  const commissions = sum((row) => row.commission);
  return {
    interest: sum((row) => row.interest),
    insurance: sum((row) => row.insurance),
    capital: sum((row) => row.capital),
    fixedCharges: sum((row) => row.fixedCharges),
    prepayments,
    commissions,
    total,
    totalPaid: moneySum([total, prepayments, commissions]),
  };
}

function initialState(terms: LoanTerms, ctx: EngineContext): PeriodState {
  return {
    balance: terms.principal,
    interestRate: terms.interestRate,
    insuranceRates: terms.insuranceRates,
    level: ctx.levelPayment(terms.principal, periodicRate(terms.interestRate, terms.insuranceRates), terms.termMonths),
    roundingProfile: terms.roundingProfile,
    k: 0,
    termMode: 'FIXED',
    term: terms.termMonths,
  };
}

/**
 * [ALG.EVENTS.ORDER] El bucle de periodos: fase 0 (anclas), fase 1 (tasas y cargos), fase 2 (la cuota k), fase 3
 * (abonos) y fase 4 (pagos reales), con cada evento despachado por el registro del contexto. Termina en la cuota que
 * liquida el saldo ([ALG.LAST]) o cuando un abono lo deja en 0.00 ([ALG.PREPAY.CAP]). El bucle es dueño de las reglas 1
 * y 3 de [ALG.EVENTS.ANCHOR]: valida el rango de los eventos propios y omite los heredados que quedan después de la
 * última cuota.
 */
export const runSchedule: RunScheduleFn = (terms, events, ctx, options = {}) => {
  validateTerms(terms);
  const placed = placeEvents(terms, events, options);
  const eventsByK = new Map<number, PlacedEvent[]>();
  for (const item of placed) {
    eventsByK.set(item.k, [...(eventsByK.get(item.k) ?? []), item]);
  }

  const rows: ScheduleRow[] = [];
  const perAnchor: AnchorRealDelta[] = [];
  const perComponent: ComponentRealDelta[] = [];
  let state = initialState(terms, ctx);
  let fixedCharges: readonly FixedCharge[] = terms.fixedCharges;

  const run = (item: PlacedEvent, current: PeriodState, row: ScheduleRow | null, projectedOpening: Money) => {
    const result = dispatch({
      ctx,
      terms,
      event: item.event,
      k: item.k,
      state: current,
      projectedOpening,
      fixedCharges,
      row,
    });
    if (result.fixedCharges !== undefined) {
      fixedCharges = result.fixedCharges;
    }
    if (result.anchorDelta !== undefined) {
      perAnchor.push(result.anchorDelta);
    }
    if (result.componentDelta !== undefined) {
      perComponent.push(result.componentDelta);
    }
    return result;
  };

  for (let k = 1; ; k += 1) {
    const atK = eventsByK.get(k) ?? [];
    const projectedOpening = state.balance;
    for (const item of atK.filter(isBeforeInstallment)) {
      state = run(item, state, null, projectedOpening).state;
    }

    const dueDate = dueDateFor(terms.firstDueDate, terms.paymentDay, k);
    const installment = calculateInstallment({
      k,
      opening: state.balance,
      level: state.level,
      interestRate: state.interestRate,
      insuranceRates: state.insuranceRates,
      roundingProfile: state.roundingProfile,
      termMode: state.termMode,
      term: state.term,
    });
    const fixed = fixedChargesFor(fixedCharges, dueDate);
    const closing = moneySub(state.balance, installment.capital);
    let row: ScheduleRow = {
      k,
      dueDate,
      opening: state.balance,
      interest: installment.interest,
      insurance: installment.insurance,
      insuranceComponents: installment.insuranceComponents,
      capital: installment.capital,
      fixedCharges: fixed,
      total: moneySum([installment.capital, installment.interest, installment.insurance, fixed]),
      closing,
      prepayment: ZERO_MONEY,
      commission: ZERO_MONEY,
      closingAfterPrepayment: closing,
      level: state.level,
      isLast: installment.isLast,
      payoff: false,
      paid: false,
    };
    state = { ...state, balance: closing, k };

    for (const item of atK.filter((entry) => !isBeforeInstallment(entry))) {
      const result = run(item, state, row, projectedOpening);
      state = result.state;
      row = applyRowEffect(row, result.rowEffect);
    }
    rows.push(row);
    if (row.isLast || compareMoney(row.closingAfterPrepayment, ZERO_MONEY) <= 0) {
      assertOwnEventsInRange(placed, k);
      const schedule: Schedule = {
        currency: terms.currency,
        roundingProfile: terms.roundingProfile,
        rows,
        totals: totalsOf(rows),
        endDate: row.dueDate,
        installmentCount: k,
      };
      return { schedule, realDelta: { perAnchor, perComponent } };
    }
  }
};

/** [ALG.PERIOD.FHA_GT_V1]…[ALG.LAST] Calendario de un camino: el de `runSchedule` sin las diferencias reales. */
export const buildSchedule: BuildScheduleFn = (terms, events, ctx, options = {}) =>
  runSchedule(terms, events, ctx, options).schedule;
