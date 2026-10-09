import { compareLocalDate, installmentOnOrAfter } from '../dates/index.ts';
import {
  compareMoney,
  type Dec,
  dec,
  decInt,
  DomainDecimal,
  maxMoney,
  moneyAdd,
  moneyIsNegative,
  moneyIsZero,
  moneyMidpoint,
  moneySub,
  parseMoney,
  toMoney,
  ZERO_MONEY,
} from '../money/index.ts';
import { compareSchedules } from '../paths/index.ts';
import { buildSchedule } from '../schedule/index.ts';
import { placeEvents } from '../schedule/placement.ts';
import type { EngineContext, GoalSeekFn } from '../types/engine.ts';
import type { DomainEvent, PrepaymentEvent } from '../types/events.ts';
import type { LoanTerms } from '../types/loan.ts';
import { InfeasibleGoalError, type LocalDate, type Money } from '../types/primitives.ts';
import type { Goal, GoalSeekRequest, Paths, Schedule } from '../types/schedule.ts';

const CENT = parseMoney('0.01');

/** [ALG.GOAL] Modo del abono de la prueba: lo fija el tipo de meta. */
function modeOf(goal: Goal): PrepaymentEvent['mode'] {
  return goal.kind === 'FINISH_BY' ? 'REDUCE_TERM' : 'REDUCE_INSTALLMENT';
}

/**
 * [ALG.GOAL] La meta se cumple: `FINISH_BY` si `endDate ≤ fecha`; `MAX_INSTALLMENT` si el `total` de la cuota k+1 es
 * ≤ valor, y la liquidación en k (no existe la cuota k+1) cuenta como cumplida.
 */
function isMet(schedule: Schedule, goal: Goal, k: number): boolean {
  if (goal.kind === 'FINISH_BY') {
    return compareLocalDate(schedule.endDate, goal.date) <= 0;
  }
  const next = schedule.rows[k];
  return next === undefined || compareMoney(next.total, goal.amount) <= 0;
}

/** Valida la entrada ([ALG.GOAL], [ALG.ERRORS]) y devuelve el camino base y la cuota k del abono. */
function validate(paths: Paths, request: GoalSeekRequest): { base: Schedule; k: number } {
  const base = request.basePath === 'SCENARIO' ? paths.scenario : paths.real;
  if (base === null) {
    throw new InfeasibleGoalError('SCENARIO_PATH_MISSING', 'The scenario path does not exist');
  }
  if (request.goal.kind === 'MAX_INSTALLMENT' && moneyIsNegative(request.goal.amount)) {
    throw new InfeasibleGoalError('INVALID_GOAL_AMOUNT', 'MAX_INSTALLMENT cannot be negative');
  }
  const { terms } = paths.input;
  const k = installmentOnOrAfter(terms.firstDueDate, terms.paymentDay, request.prepaymentDate);
  if (k <= paths.cutoffK) {
    throw new InfeasibleGoalError('PREPAYMENT_NOT_AFTER_CUTOFF', 'The prepayment must fall after the cutoff', {
      k,
      cutoffK: paths.cutoffK,
    });
  }
  if (k > base.installmentCount) {
    throw new InfeasibleGoalError('PREPAYMENT_AFTER_END', 'The prepayment falls after the last installment', {
      k,
      max: base.installmentCount,
    });
  }
  return { base, k };
}

/**
 * [ALG.GOAL] `closing_k`: el saldo que encuentra el abono de la búsqueda, es decir, el cierre de k menos lo que
 * aplican los abonos y adelantos del camino base ordenados antes que él en k ([ALG.EVENTS.ORDER]: fecha ≤ d). Se
 * calcula leyendo `closingAfterPrepayment` de la fila k del camino base sin sus eventos de fase 3 de k con fecha > d.
 * Sin tales eventos, es esa misma fila del camino base (sin reconstruir).
 */
function closingAtPrepayment(
  terms: LoanTerms,
  baseEvents: readonly DomainEvent[],
  base: Schedule,
  k: number,
  date: LocalDate,
  ctx: EngineContext,
): Money {
  const placed = placeEvents(terms, baseEvents, {});
  const after = new Set(
    placed
      .filter(
        ({ event, k: eventK }) =>
          eventK === k &&
          (event.type === 'Prepayment' || event.type === 'AdvanceInstallments') &&
          compareLocalDate(event.date, date) > 0,
      )
      .map(({ event }) => event),
  );
  const row =
    after.size === 0
      ? base.rows[k - 1]
      : buildSchedule(terms, [], ctx, { inheritedEvents: baseEvents.filter((event) => !after.has(event)) }).rows[k - 1];
  if (row === undefined) {
    throw new InfeasibleGoalError('PREPAYMENT_AFTER_END', 'The prepayment falls after the last installment', { k });
  }
  return row.closingAfterPrepayment;
}

/**
 * Distancia a la meta de un calendario, para elegir la siguiente prueba (nunca para decidir): con `FINISH_BY`, el saldo
 * que queda al cerrar la cuota `finalInstallment` (solo si no cumple; si cumple, el calendario recorta y no informa);
 * con `MAX_INSTALLMENT`, lo que la cuota k+1 pasa del valor (negativo si sobra). Es casi lineal en el monto del abono.
 */
function gapOf(schedule: Schedule, goal: Goal, k: number, finalInstallment: number): Dec | null {
  if (goal.kind === 'FINISH_BY') {
    const row = schedule.rows[finalInstallment - 1];
    return row === undefined || row.closingAfterPrepayment === ZERO_MONEY ? null : dec(row.closingAfterPrepayment);
  }
  const next = schedule.rows[k];
  return next === undefined ? null : dec(moneySub(next.total, goal.amount));
}

/** Cuotas del camino base con vencimiento ≤ fecha de la meta `FINISH_BY`: la cuota en la que debe cerrar el saldo. */
function finalInstallmentOf(base: Schedule, goal: Goal): number {
  return goal.kind === 'FINISH_BY'
    ? base.rows.filter((row) => compareLocalDate(row.dueDate, goal.date) <= 0).length
    : 0;
}

interface Sample {
  readonly amount: Dec;
  readonly gap: Dec;
}

/** Pruebas máximas elegidas por interpolación; después, bisección pura (acota el peor caso). */
const INTERPOLATED_PROBES = 12;

/**
 * Siguiente monto a probar dentro de `[lo, hi]`; `hi` ya cumple la meta y `backoff` multiplica el retroceso desde `hi`.
 *
 * - Sin dos muestras, prueba el octavo inferior del intervalo: o cumple (el intervalo se reduce 8 veces) o aporta la
 *   segunda muestra.
 * - Con dos, interpola linealmente con las dos más cercanas a la meta (`gap` ≈ lineal en el monto). Si la estimación
 *   cae en `hi` o más allá (ya cumple), retrocede desde `hi` la ventana de un centavo del `gap` (×1, ×2, ×4…).
 * - Pasadas `INTERPOLATED_PROBES` pruebas, usa el punto medio.
 *
 * Solo elige el punto: la decisión de cada prueba es siempre `isMet`, así que el resultado no depende de la estimación.
 */
function nextProbe(lo: Money, hi: Money, samples: readonly Sample[], round: number, backoff: Dec): Money {
  const mid = moneyMidpoint(lo, hi);
  if (round >= INTERPOLATED_PROBES) {
    return mid;
  }
  const [first, second] = [...samples].sort((a, b) => a.gap.abs().comparedTo(b.gap.abs()));
  if (first === undefined || second === undefined) {
    return moneyMidpoint(lo, moneyMidpoint(lo, mid));
  }
  const slope = first.gap.minus(second.gap).div(first.amount.minus(second.amount));
  if (!slope.isFinite() || slope.gte(0)) {
    return mid;
  }
  const estimate = toMoney(first.amount.minus(first.gap.div(slope)).toDecimalPlaces(2, DomainDecimal.ROUND_CEIL));
  if (compareMoney(estimate, hi) < 0) {
    return maxMoney(lo, estimate);
  }
  // El calendario cambia por centavos enteros: el mínimo puede quedar hasta `window` (lo que mueve el `gap` un
  // centavo) por debajo de la estimación. Se retrocede esa ventana (×2, ×4… si siguen cumpliendo) y, ya dentro de ella,
  // se bisecta.
  const window = dec(CENT).div(slope.abs()).toDecimalPlaces(2, DomainDecimal.ROUND_CEIL).times(backoff);
  const back = toMoney(window.lt(0.01) ? dec(CENT) : window);
  return compareMoney(moneySub(hi, lo), moneyAdd(back, back)) > 0 ? maxMoney(lo, moneySub(hi, back)) : mid;
}

/**
 * [ALG.GOAL] Búsqueda por meta: el mínimo abono, al centavo, en la fecha `d` que cumple la meta.
 *
 * Monotonía: «La meta es monótona respecto del monto» ([ALG.GOAL], Método). Más monto aplicado en k deja un saldo
 * menor, y con `REDUCE_TERM` (`endDate`) o `REDUCE_INSTALLMENT` (cuota k+1) la meta no empeora; el tope
 * `min(amount, closing_k)` ([ALG.PREPAY.CAP]) la hace constante desde `closing_k`. Por eso el predicado `isMet` es un
 * escalón y el mínimo, al centavo, queda atrapado en `[lo, hi]`.
 *
 * Costo: con N = closing_k × 100 centavos, una bisección pura haría ⌈log₂ N⌉ pruebas. Las primeras
 * `INTERPOLATED_PROBES` se eligen por interpolación (`nextProbe`) y el resto por punto medio; como cada prueba mantiene
 * el invariante de `[lo, hi]`, el peor caso es `INTERPOLATED_PROBES + ⌈log₂ N⌉` pruebas, más una de liquidación y, a lo
 * sumo, una reconstrucción para `closing_k` (N = 5·10⁷ → ≤ 12 + 26 + 2 = 40 calendarios). En la práctica la
 * interpolación acierta a pocos centavos y bastan unas diez.
 */
export const goalSeek: GoalSeekFn = (paths, request, ctx) => {
  const { base, k } = validate(paths, request);
  const { goal, prepaymentDate } = request;
  const { terms, realEvents, scenarioEvents } = paths.input;
  const baseEvents: readonly DomainEvent[] =
    request.basePath === 'SCENARIO' ? [...realEvents, ...(scenarioEvents ?? [])] : realEvents;

  if (isMet(base, goal, k)) {
    return { kind: 'ALREADY_MET' };
  }

  const closingK = closingAtPrepayment(terms, baseEvents, base, k, prepaymentDate, ctx);
  const infeasible = { kind: 'INFEASIBLE', payoffAmount: closingK, reason: 'GOAL_DATE_BEFORE_PREPAYMENT' } as const;
  if (moneyIsZero(closingK)) {
    // Los eventos del camino base ya liquidan en k: no queda saldo que abonar y la meta no se cumple.
    return infeasible;
  }

  const mode = modeOf(goal);
  const trial = (amount: Money): Schedule => {
    const goalPrepayment: PrepaymentEvent = {
      id: 'goal-seek-trial',
      type: 'Prepayment',
      date: prepaymentDate,
      amount,
      mode,
    };
    return buildSchedule(terms, [], ctx, { inheritedEvents: baseEvents, goalPrepayment });
  };

  let best = trial(closingK);
  if (!isMet(best, goal, k)) {
    return infeasible;
  }
  const finalInstallment = finalInstallmentOf(base, goal);
  // El camino base sin abono es la muestra del monto 0.00 (sin construir nada).
  const samples: Sample[] = [];
  const baseGap = gapOf(base, goal, k, finalInstallment);
  if (baseGap !== null) {
    samples.push({ amount: dec(ZERO_MONEY), gap: baseGap });
  }
  // Invariante: `hi` cumple la meta y `lo − 0.01` no (0.00 no la cumple: no es ALREADY_MET).
  let lo = CENT;
  let hi = closingK;
  let backoff = decInt(1);
  for (let round = 0; compareMoney(lo, hi) < 0; round += 1) {
    const probe = nextProbe(lo, hi, samples, round, backoff);
    const schedule = trial(probe);
    const gap = gapOf(schedule, goal, k, finalInstallment);
    if (gap !== null) {
      samples.push({ amount: dec(probe), gap });
    }
    if (isMet(schedule, goal, k)) {
      hi = probe;
      best = schedule;
      backoff = backoff.times(2);
    } else {
      lo = moneyAdd(probe, CENT);
      backoff = decInt(1);
    }
  }
  return {
    kind: 'FOUND',
    amount: hi,
    metrics: compareSchedules(base, best),
    isPayoff: compareMoney(hi, closingK) === 0,
  };
};
