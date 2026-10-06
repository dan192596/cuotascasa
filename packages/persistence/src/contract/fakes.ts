import type { IsoInstant, LocalDate, Uuid } from '@cuotascasa/schema';
import type { Clock, IdGenerator } from '../ports.ts';

/** Clock controlled by tests. Records how often each method is called. */
export interface ManualClock extends Clock {
  set(instant: IsoInstant): void;
  advance(milliseconds: number): void;
  setToday(date: LocalDate): void;
  readonly nowCalls: number;
  readonly todayCalls: number;
}

export function createManualClock(
  start: IsoInstant = '2026-10-04T15:00:00.000Z',
  today: LocalDate = '2026-10-04',
): ManualClock {
  let current = Date.parse(start);
  let currentToday = today;
  let nowCalls = 0;
  let todayCalls = 0;
  return {
    now(): IsoInstant {
      nowCalls += 1;
      return new Date(current).toISOString();
    },
    today(): LocalDate {
      todayCalls += 1;
      return currentToday;
    },
    set(instant: IsoInstant): void {
      current = Date.parse(instant);
    },
    advance(milliseconds: number): void {
      current += milliseconds;
    },
    setToday(date: LocalDate): void {
      currentToday = date;
    },
    get nowCalls(): number {
      return nowCalls;
    },
    get todayCalls(): number {
      return todayCalls;
    },
  };
}

/** Deterministic v4-shaped UUIDs 10000000-0000-4000-8000-<12 hex>, increasing from 1; or a scripted list. */
export interface SequentialIds extends IdGenerator {
  readonly issued: readonly Uuid[];
  /** The next ids returned are exactly these, in order, before the sequence resumes. */
  script(ids: readonly Uuid[]): void;
}

export function sequentialUuid(n: number): Uuid {
  return `10000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
}

export function createSequentialIds(): SequentialIds {
  let counter = 0;
  const scripted: Uuid[] = [];
  const issued: Uuid[] = [];
  return {
    newId(): Uuid {
      const next = scripted.shift();
      if (next !== undefined) {
        issued.push(next);
        return next;
      }
      counter += 1;
      const id = sequentialUuid(counter);
      issued.push(id);
      return id;
    },
    script(ids: readonly Uuid[]): void {
      scripted.push(...ids);
    },
    get issued(): readonly Uuid[] {
      return issued;
    },
  };
}
