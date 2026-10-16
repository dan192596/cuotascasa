/**
 * Pure logic of cc-scenario-editor (R6, R17; HU-13 to HU-15): dry run of a scenario, goal-seek on the active scenario,
 * event builders, field rules and Spanish texts. No Angular here. Money stays a decimal string; dates stay LocalDate.
 */
import {
  buildPaths,
  type Commission,
  compareLocalDate,
  type ComparisonMetrics,
  type Currency,
  DomainError,
  goalSeek,
  type GoalSeekRequest,
  type HypotheticalEvent,
  installmentOnOrAfter,
  InvalidInputError,
  isLocalDate,
  isMoney,
  type Money,
  moneyIsZero,
  type Paths,
  parseLocalDate,
  parseMoney,
  parsePaymentDay,
  parseRate,
  type PrepaymentMode,
  type RateChangeEvent,
} from '@cuotascasa/domain';
import type { Loan, ScenarioEvent } from '@cuotascasa/schema';
import { formatLocalDate, formatMoney, shiftRateToPercent } from '../../../ui/format/format.ts';

/** What the editor needs to know about the loan to place a date on an installment. */
export interface LoanFacts {
  readonly firstDueDate: string;
  readonly paymentDay: Loan['paymentDay'];
  readonly disbursementDate: string;
  readonly currency: Currency;
}

/** Largest installment count the schema accepts for an AdvanceInstallments. */
export const MAX_ADVANCE_COUNT = 1200;

/** [ALG.EVENTS.ANCHOR] rule 2: the first installment due on or after the date. */
export function installmentFor(facts: LoanFacts, date: string): number {
  return installmentOnOrAfter(
    parseLocalDate(facts.firstDueDate),
    parsePaymentDay(facts.paymentDay),
    parseLocalDate(date),
  );
}

/* ---------- Domain errors in Spanish ---------- */

function installmentText(k: number | null): string {
  return k === null ? 'una cuota con datos reales' : `la cuota ${k}, que ya tiene datos reales`;
}

/**
 * Domain errors are never shown as they come (they may carry amounts): the text depends only on the kind and the
 * code, and may name an installment number.
 */
export function domainErrorText(error: DomainError): string {
  switch (error.kind) {
    case 'InvalidInput': {
      const { code } = error as DomainError & { readonly code: string };
      if (code === 'HYPOTHETICAL_BEFORE_CUTOFF') {
        return `El evento cae en ${installmentText(error.k)}. Elige una fecha de una cuota posterior.`;
      }
      if (code === 'INSTALLMENT_OUT_OF_RANGE') {
        return error.k === null
          ? 'Un evento cae después de la última cuota del préstamo. Elige una fecha anterior o quítalo.'
          : `El evento de la cuota ${error.k} cae después de la última cuota del préstamo. Elige una fecha anterior o quítalo.`;
      }
      return 'Algún dato del escenario no es válido. Revísalo o quita el evento.';
    }
    case 'InfeasibleGoal': {
      const { code } = error as DomainError & { readonly code: string };
      switch (code) {
        case 'PREPAYMENT_NOT_AFTER_CUTOFF':
          return `La fecha del abono cae en ${installmentText(error.k)}. Elige una fecha de una cuota posterior.`;
        case 'PREPAYMENT_AFTER_END':
          return 'La fecha del abono es posterior a la última cuota del préstamo.';
        case 'INVALID_GOAL_AMOUNT':
          return 'La cuota máxima no puede ser negativa.';
        case 'SCENARIO_PATH_MISSING':
          return 'No hay un escenario activo con eventos para calcular.';
        default:
          return 'No se pudo calcular el abono para esa meta.';
      }
    }
    case 'NegativeAmortization':
      return 'Con estos eventos la cuota nivelada no alcanza para cubrir los intereses. Prueba otro monto o cambia lo que reduce el abono.';
    case 'CurrencyMismatch':
      return 'Hay montos en una moneda distinta a la del préstamo.';
    default:
      return 'No se pudo calcular el escenario. Revisa sus eventos.';
  }
}

/* ---------- Scenario events → domain ---------- */

function toCommission(
  commission: NonNullable<Extract<ScenarioEvent, { type: 'Prepayment' }>['commission']>,
): Commission {
  return commission.kind === 'FLAT'
    ? { kind: 'FLAT', amount: parseMoney(commission.amount) }
    : { kind: 'PERCENT', rate: parseRate(commission.rate) };
}

function toRateChange(event: Extract<ScenarioEvent, { type: 'RateChange' }>): RateChangeEvent {
  const base = {
    type: 'RateChange' as const,
    id: event.id,
    date: parseLocalDate(event.date),
    ...(event.interestRate === undefined ? {} : { interestRate: parseRate(event.interestRate) }),
    ...(event.insuranceRates === undefined ? {} : { insuranceRates: event.insuranceRates.map((r) => parseRate(r)) }),
  };
  if (event.policy !== 'BANK_INSTALLMENT') {
    return { ...base, policy: event.policy };
  }
  if (event.bankInstallment === undefined) {
    throw new InvalidInputError('INVALID_EVENT', 'BANK_INSTALLMENT requires bankInstallment', { eventId: event.id });
  }
  return { ...base, policy: event.policy, bankInstallment: parseMoney(event.bankInstallment) };
}

function toHypothetical(event: ScenarioEvent): HypotheticalEvent {
  switch (event.type) {
    case 'RateChange':
      return toRateChange(event);
    case 'FixedChargeChange':
      return {
        type: 'FixedChargeChange',
        id: event.id,
        date: parseLocalDate(event.date),
        fixedCharges: event.fixedCharges.map((charge) => ({ label: charge.label, amount: parseMoney(charge.amount) })),
      };
    case 'Prepayment':
      return {
        type: 'Prepayment',
        id: event.id,
        date: parseLocalDate(event.date),
        amount: parseMoney(event.amount),
        mode: event.mode,
        ...(event.commission === undefined ? {} : { commission: toCommission(event.commission) }),
      };
    case 'AdvanceInstallments':
      return { type: 'AdvanceInstallments', id: event.id, date: parseLocalDate(event.date), count: event.count };
  }
}

/** The live (not removed) events of a scenario as domain events. */
export function toDomainScenarioEvents(events: readonly ScenarioEvent[]): HypotheticalEvent[] {
  return events.filter((event) => event.deletedAt === null).map(toHypothetical);
}

export type CandidateResult =
  { readonly ok: true; readonly paths: Paths } | { readonly ok: false; readonly error: DomainError };

/** The paths the loan would have with `events` as its scenario ([ALG.PATHS]); the domain's typed error otherwise. */
export function tryCandidate(paths: Paths, events: readonly ScenarioEvent[]): CandidateResult {
  try {
    const scenarioEvents = toDomainScenarioEvents(events);
    return {
      ok: true,
      paths: buildPaths({
        terms: paths.input.terms,
        realEvents: paths.input.realEvents,
        scenarioEvents: scenarioEvents.length === 0 ? null : scenarioEvents,
      }),
    };
  } catch (error) {
    if (error instanceof DomainError) {
      return { ok: false, error };
    }
    throw error;
  }
}

/**
 * Dry run before saving: the typed error the domain raises when `events` are the scenario of the loan behind `paths`
 * ([ALG.PATHS.CUTOFF], [ALG.EVENTS.ANCHOR]), or null. It never writes anything.
 */
export function dryRun(paths: Paths, events: readonly ScenarioEvent[]): DomainError | null {
  const result = tryCandidate(paths, events);
  return result.ok ? null : result.error;
}

/**
 * [ALG.EVENTS.ORDER] A trial of the goal-seek runs after every same-date phase-3 event of its base, but a saved event
 * sorts by a random id: with a Prepayment or AdvanceInstallments on the goal date the applied abono could land before
 * it and miss the goal. The editor does not offer the search for such a date (Opus C2).
 */
export function hasSamePhase3Event(events: readonly ScenarioEvent[], date: string): boolean {
  return events.some(
    (event) =>
      event.deletedAt === null &&
      event.date === date &&
      (event.type === 'Prepayment' || event.type === 'AdvanceInstallments'),
  );
}

export interface RemovedEvent {
  readonly event: ScenarioEvent;
  /** The installment the event lands on. */
  readonly k: number;
}

export type ApplyPlan =
  | {
      readonly kind: 'ok';
      /** The scenario events to save: the kept own events plus the goal prepayment. */
      readonly events: readonly ScenarioEvent[];
      /** Own events that would fall after the new final installment: they must be removed to apply (Opus C1). */
      readonly removed: readonly RemovedEvent[];
      readonly candidate: Paths;
    }
  | { readonly kind: 'error'; readonly error: DomainError };

/**
 * Applying a goal ends the loan earlier. Each trial inherits the base's events without revalidating them, but once the
 * result is the scenario's own event any own event after the new last installment raises INSTALLMENT_OUT_OF_RANGE.
 * Finds those events (never saves anything) and the candidate paths without them.
 */
export function planApply(
  paths: Paths,
  own: readonly ScenarioEvent[],
  goalEvent: ScenarioEvent,
  facts: LoanFacts,
): ApplyPlan {
  let kept = own.filter((event) => event.deletedAt === null);
  const removed: RemovedEvent[] = [];
  for (let round = 0; round <= own.length; round += 1) {
    const events = [...kept, goalEvent];
    const result = tryCandidate(paths, events);
    if (result.ok) {
      return { kind: 'ok', events, removed, candidate: result.paths };
    }
    const { error } = result;
    const firstOutside =
      error instanceof InvalidInputError && error.code === 'INSTALLMENT_OUT_OF_RANGE' ? error.k : null;
    if (firstOutside === null) {
      return { kind: 'error', error };
    }
    const outside = kept
      .map((event) => ({ event, k: installmentFor(facts, event.date) }))
      .filter((item) => item.k >= firstOutside);
    if (outside.length === 0) {
      return { kind: 'error', error };
    }
    removed.push(...outside);
    kept = kept.filter((event) => !outside.some((item) => item.event.id === event.id));
  }
  return { kind: 'error', error: new InvalidInputError('INSTALLMENT_OUT_OF_RANGE', 'events outside the schedule') };
}

/** Safety net (Opus C2 rule 2): the candidate paths must already meet the goal the result was computed for. */
export function appliedMeetsGoal(candidate: Paths, input: GoalInput): boolean {
  return seekGoal(candidate, input).kind === 'ALREADY_MET';
}

export interface EventExtra {
  readonly label: string;
  readonly amount: Money;
}

/**
 * Figures that complete an event of the active scenario (I8): the amount to pay of an AdvanceInstallments (its row's
 * prepayment, when it is the only phase-3 event of that installment), and the new level installment after a
 * REDUCE_INSTALLMENT abono (the `level` of the next row).
 */
export function eventExtra(
  paths: Paths,
  facts: LoanFacts,
  event: ScenarioEvent,
  events: readonly ScenarioEvent[],
): EventExtra | null {
  const scenario = paths.scenario;
  if (scenario === null) {
    return null;
  }
  const k = installmentFor(facts, event.date);
  if (event.type === 'AdvanceInstallments') {
    const sameInstallment = events.filter(
      (other) =>
        other.deletedAt === null &&
        (other.type === 'Prepayment' || other.type === 'AdvanceInstallments') &&
        installmentFor(facts, other.date) === k,
    );
    const row = scenario.rows.find((item) => item.k === k);
    return sameInstallment.length === 1 && row !== undefined
      ? { label: 'Monto a pagar', amount: row.prepayment }
      : null;
  }
  if (event.type === 'Prepayment' && event.mode === 'REDUCE_INSTALLMENT') {
    const next = scenario.rows.find((item) => item.k === k + 1);
    return next === undefined ? null : { label: 'Nueva cuota nivelada', amount: next.level };
  }
  return null;
}

/* ---------- Goal-seek ([ALG.GOAL]) ---------- */

export type GoalInput = {
  readonly prepaymentDate: string;
  readonly goal:
    | { readonly kind: 'FINISH_BY'; readonly date: string }
    | { readonly kind: 'MAX_INSTALLMENT'; readonly amount: string };
};

export type GoalOutcome =
  | { readonly kind: 'ALREADY_MET' }
  | {
      readonly kind: 'FOUND';
      readonly amount: Money;
      readonly metrics: ComparisonMetrics;
      readonly isPayoff: boolean;
      /** The path the search ran on: the scenario when it has events, the real path otherwise. */
      readonly basePath: 'REAL' | 'SCENARIO';
      /** The mode of the goal: REDUCE_TERM for FINISH_BY, REDUCE_INSTALLMENT for MAX_INSTALLMENT. */
      readonly mode: PrepaymentMode;
    }
  | { readonly kind: 'INFEASIBLE'; readonly payoffAmount: Money }
  | { readonly kind: 'ERROR'; readonly error: DomainError };

/**
 * goalSeek on the active scenario's path: basePath SCENARIO when the scenario has live events, REAL otherwise
 * (component-contracts §5). The domain's invalid-input errors become an ERROR outcome; nothing else is caught.
 */
export function seekGoal(paths: Paths, input: GoalInput): GoalOutcome {
  try {
    const request: GoalSeekRequest = {
      basePath: paths.scenario === null ? 'REAL' : 'SCENARIO',
      prepaymentDate: parseLocalDate(input.prepaymentDate),
      goal:
        input.goal.kind === 'FINISH_BY'
          ? { kind: 'FINISH_BY', date: parseLocalDate(input.goal.date) }
          : { kind: 'MAX_INSTALLMENT', amount: parseMoney(input.goal.amount) },
    };
    const result = goalSeek(paths, request);
    switch (result.kind) {
      case 'ALREADY_MET':
        return result;
      case 'FOUND':
        return {
          kind: 'FOUND',
          amount: result.amount,
          metrics: result.metrics,
          isPayoff: result.isPayoff,
          basePath: request.basePath,
          mode: input.goal.kind === 'FINISH_BY' ? 'REDUCE_TERM' : 'REDUCE_INSTALLMENT',
        };
      case 'INFEASIBLE':
        return { kind: 'INFEASIBLE', payoffAmount: result.payoffAmount };
    }
  } catch (error) {
    if (error instanceof DomainError) {
      return { kind: 'ERROR', error };
    }
    throw error;
  }
}

/** The scenario prepayment that «Aplicar al escenario» adds: the found amount, the goal's mode, no commission. */
export function goalPrepayment(
  id: string,
  date: string,
  outcome: Extract<GoalOutcome, { kind: 'FOUND' }>,
): ScenarioEvent {
  return { id, type: 'Prepayment', date, amount: outcome.amount, mode: outcome.mode, deletedAt: null };
}

/* ---------- Event builders ---------- */

export interface PrepaymentModel {
  readonly date: string;
  readonly amount: string;
  readonly mode: PrepaymentMode;
  readonly commissionKind: 'NONE' | 'FLAT' | 'PERCENT';
  readonly commissionAmount: string;
  /** Fraction ('0.02' = 2 %), as cc-rate-input produces it. */
  readonly commissionRate: string;
}

export interface AdvanceModel {
  readonly date: string;
  readonly count: string;
}

export function prepaymentEvent(id: string, model: PrepaymentModel): ScenarioEvent {
  const commission =
    model.commissionKind === 'FLAT'
      ? { commission: { kind: 'FLAT' as const, amount: model.commissionAmount } }
      : model.commissionKind === 'PERCENT'
        ? { commission: { kind: 'PERCENT' as const, rate: model.commissionRate } }
        : {};
  return {
    id,
    type: 'Prepayment',
    date: model.date,
    amount: model.amount,
    mode: model.mode,
    ...commission,
    deletedAt: null,
  };
}

export function advanceEvent(id: string, model: AdvanceModel): ScenarioEvent {
  return {
    id,
    type: 'AdvanceInstallments',
    date: model.date,
    count: Number.parseInt(model.count, 10),
    deletedAt: null,
  };
}

/* ---------- Field rules (Spanish, es-GT) ---------- */

export function dateError(value: string, facts: LoanFacts): string | undefined {
  if (value === '') {
    return 'Escribe la fecha.';
  }
  if (!isLocalDate(value)) {
    return 'Escribe una fecha válida con el formato dd/mm/aaaa.';
  }
  if (compareLocalDate(value, parseLocalDate(facts.disbursementDate)) < 0) {
    return `La fecha no puede ser anterior al desembolso del préstamo (${formatLocalDate(facts.disbursementDate)}).`;
  }
  return undefined;
}

export function amountError(value: string, options: { readonly allowZero?: boolean } = {}): string | undefined {
  if (value === '') {
    return 'Escribe un monto.';
  }
  if (value.startsWith('-')) {
    return 'El monto no puede ser negativo.';
  }
  if (!isMoney(value)) {
    return 'Escribe un monto válido, por ejemplo 1,234.56.';
  }
  if (options.allowZero !== true && moneyIsZero(value)) {
    return 'El monto debe ser mayor que cero.';
  }
  return undefined;
}

export function countError(value: string): string | undefined {
  if (value === '') {
    return 'Escribe un número entero.';
  }
  if (!/^\d+$/.test(value)) {
    return 'Escribe un número entero, sin decimales.';
  }
  const parsed = Number.parseInt(value, 10);
  return parsed < 1 || parsed > MAX_ADVANCE_COUNT ? `El número debe estar entre 1 y ${MAX_ADVANCE_COUNT}.` : undefined;
}

/* ---------- Texts ---------- */

const MODE_TEXT: Readonly<Record<PrepaymentMode, string>> = {
  REDUCE_TERM: 'reduce el plazo',
  REDUCE_INSTALLMENT: 'reduce la cuota',
};

/** One-line Spanish description of a hypothetical event, with the installment it lands on. */
export function describeEvent(event: ScenarioEvent, facts: LoanFacts): string {
  const when = `el ${formatLocalDate(event.date)} (cuota ${installmentFor(facts, event.date)})`;
  switch (event.type) {
    case 'Prepayment': {
      const fee =
        event.commission === undefined
          ? ''
          : event.commission.kind === 'FLAT'
            ? `, comisión de ${formatMoney(event.commission.amount, facts.currency)}`
            : `, comisión del ${shiftRateToPercent(event.commission.rate)} %`;
      return `Abono de ${formatMoney(event.amount, facts.currency)} ${when}, ${MODE_TEXT[event.mode]}${fee}`;
    }
    case 'AdvanceInstallments':
      return `Adelantar ${event.count} ${event.count === 1 ? 'cuota' : 'cuotas'} ${when}`;
    case 'RateChange':
      return `Cambio de tasa ${when}`;
    case 'FixedChargeChange':
      return `Cambio de cargos fijos ${when}`;
  }
}

export const NAME_MAX = 60;

/** Name of a copy, cut to the schema's limit. */
export function duplicateName(name: string): string {
  return `Copia de ${name}`.slice(0, NAME_MAX).trimEnd();
}

export function nameError(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed === '') {
    return 'Escribe un nombre para el escenario.';
  }
  return trimmed.length > NAME_MAX ? `El nombre no puede pasar de ${NAME_MAX} caracteres.` : undefined;
}
