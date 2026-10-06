import { describe, expect, it, vi } from 'vitest';
import { createEngineContext } from '../../src/engine-context.ts';
import * as goalSeekDir from '../../src/goal-seek/index.ts';
import * as api from '../../src/index.ts';
import * as pathsDir from '../../src/paths/index.ts';
import * as scheduleDir from '../../src/schedule/index.ts';
import type { ScheduleOptions } from '../../src/types/engine.ts';
import type { GoalSeekRequest, Paths, ScheduleRun, TemplateValidationResult } from '../../src/types/schedule.ts';
import * as validationDir from '../../src/validation/index.ts';
import { SYNTHETIC_EVENTS, syntheticSchedule, syntheticTerms } from '../support/synthetic.ts';

vi.mock('../../src/schedule/index.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof scheduleDir>()),
  buildSchedule: vi.fn(),
  runSchedule: vi.fn(),
}));
vi.mock('../../src/paths/index.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof pathsDir>()),
  buildPaths: vi.fn(),
}));
vi.mock('../../src/goal-seek/index.ts', () => ({ goalSeek: vi.fn() }));
vi.mock('../../src/validation/index.ts', () => ({ validateAgainstReportedBalance: vi.fn() }));

/** Los envoltorios congelados de index.ts pasan cada argumento sin cambios y solo completan los valores por defecto. */
describe('@cuotascasa/domain public wrappers forward to the card-owned directories', () => {
  const terms = syntheticTerms();
  const events = [SYNTHETIC_EVENTS.Prepayment];
  const options: ScheduleOptions = {
    inheritedEvents: [SYNTHETIC_EVENTS.RateChange],
    goalPrepayment: SYNTHETIC_EVENTS.Prepayment,
  };

  it('buildSchedule and runSchedule forward terms, events, ctx and options (defaults: [], a context, {})', () => {
    const ctx = createEngineContext({ remainingTerm: () => 208 });
    const schedule = syntheticSchedule();
    const run: ScheduleRun = { schedule, realDelta: { perAnchor: [], perComponent: [] } };
    vi.mocked(scheduleDir.buildSchedule).mockReturnValue(schedule);
    vi.mocked(scheduleDir.runSchedule).mockReturnValue(run);

    expect(api.buildSchedule(terms, events, ctx, options)).toBe(schedule);
    expect(scheduleDir.buildSchedule).toHaveBeenLastCalledWith(terms, events, ctx, options);
    expect(api.runSchedule(terms, events, ctx, options)).toBe(run);
    expect(scheduleDir.runSchedule).toHaveBeenLastCalledWith(terms, events, ctx, options);

    api.buildSchedule(terms);
    expect(scheduleDir.buildSchedule).toHaveBeenLastCalledWith(terms, [], createEngineContext(), {});
    api.runSchedule(terms);
    expect(scheduleDir.runSchedule).toHaveBeenLastCalledWith(terms, [], createEngineContext(), {});
  });

  it('buildPaths, goalSeek and validateAgainstReportedBalance forward their input and ctx', () => {
    const ctx = createEngineContext({ remainingTerm: () => 208 });
    const schedule = syntheticSchedule();
    const input = { terms, realEvents: [], scenarioEvents: null };
    const paths: Paths = {
      input,
      original: schedule,
      real: schedule,
      scenario: null,
      cutoffK: 0,
      realDelta: { perAnchor: [], perComponent: [] },
    };
    const request: GoalSeekRequest = {
      basePath: 'REAL',
      prepaymentDate: SYNTHETIC_EVENTS.Prepayment.date,
      goal: { kind: 'FINISH_BY', date: schedule.endDate },
    };
    const validation = { terms, realEvents: [], reported: SYNTHETIC_EVENTS.ReportedBalance };
    const result: TemplateValidationResult = {
      k: 12,
      reported: SYNTHETIC_EVENTS.ReportedBalance.balance,
      modeled: SYNTHETIC_EVENTS.ReportedBalance.balance,
      realDelta: api.ZERO_MONEY,
      status: 'GREEN',
      cause: null,
    };
    vi.mocked(pathsDir.buildPaths).mockReturnValue(paths);
    vi.mocked(goalSeekDir.goalSeek).mockReturnValue({ kind: 'ALREADY_MET' });
    vi.mocked(validationDir.validateAgainstReportedBalance).mockReturnValue(result);

    expect(api.buildPaths(input, ctx)).toBe(paths);
    expect(pathsDir.buildPaths).toHaveBeenLastCalledWith(input, ctx);
    expect(api.goalSeek(paths, request, ctx)).toEqual({ kind: 'ALREADY_MET' });
    expect(goalSeekDir.goalSeek).toHaveBeenLastCalledWith(paths, request, ctx);
    expect(api.validateAgainstReportedBalance(validation, ctx)).toBe(result);
    expect(validationDir.validateAgainstReportedBalance).toHaveBeenLastCalledWith(validation, ctx);

    api.buildPaths(input);
    expect(pathsDir.buildPaths).toHaveBeenLastCalledWith(input, createEngineContext());
  });
});
