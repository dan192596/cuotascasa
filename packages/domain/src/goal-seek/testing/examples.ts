import ex11 from '../../../../../docs/specs/algorithm-examples/events/ex11-goal-seek.json' with { type: 'json' };
import type { DomainEvent, HypotheticalEvent } from '../../types/events.ts';
import type { LoanTerms } from '../../types/loan.ts';
import type { GoalSeekRequest } from '../../types/schedule.ts';

/** `expected` de un caso `goalSeek` tal como está en disco. */
export interface GoalExampleExpected {
  readonly kind?: string;
  readonly amount?: string;
  readonly isPayoff?: boolean;
  readonly payoffAmount?: string;
  readonly reason?: string;
  readonly metrics?: Readonly<Record<string, unknown>>;
  readonly error?: { readonly type: string; readonly rule: string; readonly k?: number };
}

export interface GoalExampleCase {
  readonly id: string;
  readonly terms: LoanTerms;
  readonly realEvents: readonly DomainEvent[];
  readonly scenarioEvents: readonly HypotheticalEvent[] | null;
  readonly request: GoalSeekRequest;
  readonly expected: GoalExampleExpected;
  readonly context?: undefined | { readonly k: number; readonly closingK: string };
}

/** Casos de ex11 (datos sintéticos validados por CI, INDEX.md). */
export function loadGoalExampleCases(): readonly GoalExampleCase[] {
  return (ex11 as unknown as { cases: readonly Record<string, unknown>[] }).cases.map((item) => ({
    id: item['id'] as string,
    terms: item['terms'] as LoanTerms,
    realEvents: (item['realEvents'] ?? []) as readonly DomainEvent[],
    scenarioEvents: (item['scenarioEvents'] ?? null) as readonly HypotheticalEvent[] | null,
    request: item['request'] as GoalSeekRequest,
    expected: item['expected'] as GoalExampleExpected,
    context: item['context'] as GoalExampleCase['context'],
  }));
}
