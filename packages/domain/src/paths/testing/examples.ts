import ex04 from '../../../../../docs/specs/algorithm-examples/events/ex04-reduce-term-then-recalc.json' with { type: 'json' };
import ex07 from '../../../../../docs/specs/algorithm-examples/events/ex07-same-k-anchors.json' with { type: 'json' };
import ex08 from '../../../../../docs/specs/algorithm-examples/events/ex08-late-actual-payment.json' with { type: 'json' };
import ex09 from '../../../../../docs/specs/algorithm-examples/events/ex09-actual-payment-component-delta.json' with { type: 'json' };
import ex10 from '../../../../../docs/specs/algorithm-examples/events/ex10-cutoff.json' with { type: 'json' };
import ex13b from '../../../../../docs/specs/algorithm-examples/events/ex13b-metrics.json' with { type: 'json' };
import ex16 from '../../../../../docs/specs/algorithm-examples/events/ex16-explicit-k-anchor.json' with { type: 'json' };
import type { DomainEvent } from '../../types/events.ts';
import type { LoanTerms } from '../../types/loan.ts';

/** Objeto `expected` de un caso, tal como está en disco (strings decimales y enteros de conteo). */
export interface RawExpected {
  readonly installmentCount?: number;
  readonly endDate?: string;
  readonly rows?: readonly Readonly<Record<string, unknown>>[];
  readonly totals?: Readonly<Record<string, string>>;
  readonly realDelta?: {
    readonly perAnchor: readonly Readonly<Record<string, unknown>>[];
    readonly perComponent: readonly Readonly<Record<string, unknown>>[];
  };
  readonly yearly?: readonly Readonly<Record<string, unknown>>[];
  readonly comparedToNoEvents?: Readonly<Record<string, unknown>>;
  readonly cutoffK?: number;
  readonly original?: RawExpected;
  readonly real?: RawExpected;
  readonly scenario?: RawExpected;
  readonly metrics?: Readonly<Record<string, unknown>>;
  readonly error?: { readonly type: string; readonly rule: string; readonly k?: number };
}

export interface EventExampleCase {
  readonly file: string;
  readonly id: string;
  readonly operation: 'buildSchedule' | 'buildPaths';
  readonly terms: LoanTerms;
  /** `buildSchedule`: los eventos del caso. */
  readonly events: readonly DomainEvent[];
  /** `buildPaths`: eventos reales y del escenario. */
  readonly realEvents: readonly DomainEvent[];
  readonly scenarioEvents: readonly DomainEvent[] | null;
  readonly expected: RawExpected;
}

interface RawCase {
  readonly id: string;
  readonly operation: string;
  readonly terms: unknown;
  readonly events?: readonly unknown[];
  readonly realEvents?: readonly unknown[];
  readonly scenarioEvents?: readonly unknown[] | null;
  readonly expected: RawExpected;
}

const FILES: ReadonlyArray<readonly [string, unknown]> = [
  ['ex04-reduce-term-then-recalc.json', ex04],
  ['ex07-same-k-anchors.json', ex07],
  ['ex08-late-actual-payment.json', ex08],
  ['ex09-actual-payment-component-delta.json', ex09],
  ['ex10-cutoff.json', ex10],
  ['ex13b-metrics.json', ex13b],
  ['ex16-explicit-k-anchor.json', ex16],
];

/**
 * Casos `buildSchedule` y `buildPaths` de los ejemplos de anclas, pagos reales, corte y métricas. Los strings del JSON
 * ya son `Money`, `Rate` y `LocalDate` válidos: los ejemplos son datos sintéticos validados por CI (INDEX.md).
 */
export function loadEventExampleCases(): readonly EventExampleCase[] {
  const cases: EventExampleCase[] = [];
  for (const [file, content] of FILES) {
    for (const item of (content as { cases: readonly RawCase[] }).cases) {
      if (item.operation !== 'buildSchedule' && item.operation !== 'buildPaths') {
        throw new Error(`${file} / ${item.id}: unexpected operation ${item.operation}`);
      }
      cases.push({
        file,
        id: item.id,
        operation: item.operation,
        terms: item.terms as LoanTerms,
        events: (item.events ?? []) as readonly DomainEvent[],
        realEvents: (item.realEvents ?? []) as readonly DomainEvent[],
        scenarioEvents: (item.scenarioEvents ?? null) as readonly DomainEvent[] | null,
        expected: item.expected,
      });
    }
  }
  return cases;
}
