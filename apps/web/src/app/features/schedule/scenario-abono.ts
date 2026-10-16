import type { ScenarioUpdate } from '../../data/api.ts';

/** A hypothetical event embedded in a scenario (the type of `Scenario.events`, derived from the frozen data contract). */
export type ScenarioEvent = ScenarioUpdate['events'][number];
export type PrepaymentScenarioEvent = Extract<ScenarioEvent, { readonly type: 'Prepayment' }>;

/**
 * What the abono cell of installment k can do (spec §9 «Abono en celda»):
 * - none: no live hypothetical event at k, so a new amount creates a Prepayment;
 * - single: exactly one live Prepayment at k and nothing else, so the cell edits its amount;
 * - locked: more than one Prepayment, or an AdvanceInstallments, so the cell is read-only (edit it in «Proyecciones»).
 */
export type AbonoSlot =
  | { readonly kind: 'none' }
  | { readonly kind: 'single'; readonly event: PrepaymentScenarioEvent }
  | { readonly kind: 'locked' };

/** [ALG.EVENTS.ANCHOR] rule 2 of the loan: the installment a hypothetical event date falls on. */
export type InstallmentOf = (date: string) => number;

/** Slot of installment k in a scenario. Tombstoned events and rate or charge changes do not count. */
export function abonoSlotAt(events: readonly ScenarioEvent[], k: number, installmentOf: InstallmentOf): AbonoSlot {
  const prepayments: PrepaymentScenarioEvent[] = [];
  let advance = false;
  for (const event of events) {
    if (event.deletedAt !== null || installmentOf(event.date) !== k) continue;
    if (event.type === 'Prepayment') prepayments.push(event);
    else if (event.type === 'AdvanceInstallments') advance = true;
  }
  if (advance || prepayments.length > 1) return { kind: 'locked' };
  const [only] = prepayments;
  return only === undefined ? { kind: 'none' } : { kind: 'single', event: only };
}

export type AbonoOutcome = 'created' | 'updated' | 'removed' | 'unchanged';

export interface AbonoPlan {
  readonly outcome: AbonoOutcome;
  /** The complete new event list of the scenario. */
  readonly events: ScenarioEvent[];
}

export interface AbonoEditRequest {
  readonly events: readonly ScenarioEvent[];
  readonly k: number;
  /** Due date of installment k: the date of a new Prepayment. */
  readonly dueDate: string;
  /** Canonical amount typed in the cell; '0.00' means «remove». */
  readonly amount: string;
  readonly installmentOf: InstallmentOf;
  readonly newId: () => string;
  /** Instant of the tombstone. */
  readonly now: string;
}

/**
 * Pure planning of an in-cell abono (HU-17). Returns null for a locked cell.
 * (a) a new amount creates a REDUCE_TERM Prepayment dated on the due date of k, without commission;
 * (b) a single existing Prepayment keeps its id, date, mode and commission and only changes its amount;
 * (c) zero tombstones that Prepayment (deletedAt) instead of dropping it, so the deletion can sync.
 */
export function planAbonoEdit(request: AbonoEditRequest): AbonoPlan | null {
  const { events, k, dueDate, amount, installmentOf, newId, now } = request;
  const slot = abonoSlotAt(events, k, installmentOf);
  if (slot.kind === 'locked') return null;
  const zero = amount === '0.00';
  if (slot.kind === 'none') {
    if (zero) return { outcome: 'unchanged', events: [...events] };
    const created: ScenarioEvent = {
      id: newId(),
      date: dueDate,
      type: 'Prepayment',
      amount,
      mode: 'REDUCE_TERM',
      deletedAt: null,
    };
    return { outcome: 'created', events: [...events, created] };
  }
  const replacement: ScenarioEvent = zero ? { ...slot.event, deletedAt: now } : { ...slot.event, amount };
  return {
    outcome: zero ? 'removed' : 'updated',
    events: events.map((event) => (event === slot.event ? replacement : event)),
  };
}
