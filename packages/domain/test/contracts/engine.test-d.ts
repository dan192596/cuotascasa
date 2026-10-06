import { describe, expectTypeOf, it } from 'vitest';
import type {
  BuildScheduleFn,
  EngineContext,
  EventHandler,
  EventHandlerRegistry,
  HandlerInput,
  HandlerResult,
  PeriodState,
  RowEffect,
  RunScheduleFn,
  ScheduleOptions,
  TermMode,
} from '../../src/types/engine.ts';
import type { DomainEvent, DomainEventType, PrepaymentEvent } from '../../src/types/events.ts';
import type { FixedCharge, LoanTerms } from '../../src/types/loan.ts';
import type { Money, Rate, RoundingProfile } from '../../src/types/primitives.ts';
import type {
  AnchorRealDelta,
  ComponentRealDelta,
  Schedule,
  ScheduleRow,
  ScheduleRun,
} from '../../src/types/schedule.ts';

describe('engine contract', () => {
  it('PeriodState carries exactly the fields of [ALG.TERM]', () => {
    expectTypeOf<keyof PeriodState>().toEqualTypeOf<
      'balance' | 'interestRate' | 'insuranceRates' | 'level' | 'roundingProfile' | 'k' | 'termMode' | 'term'
    >();
    expectTypeOf<PeriodState['balance']>().toEqualTypeOf<Money>();
    expectTypeOf<PeriodState['interestRate']>().toEqualTypeOf<Rate>();
    expectTypeOf<PeriodState['insuranceRates']>().toEqualTypeOf<readonly Rate[]>();
    expectTypeOf<PeriodState['level']>().toEqualTypeOf<Money>();
    expectTypeOf<PeriodState['roundingProfile']>().toEqualTypeOf<RoundingProfile>();
    expectTypeOf<PeriodState['k']>().toEqualTypeOf<number>();
    expectTypeOf<PeriodState['termMode']>().toEqualTypeOf<TermMode>();
    expectTypeOf<TermMode>().toEqualTypeOf<'FIXED' | 'DERIVED'>();
    expectTypeOf<PeriodState['term']>().toEqualTypeOf<number>();
  });

  it('pins levelPayment(B, r, m), remainingTerm(state) and projectCapital(state, n) on EngineContext', () => {
    expectTypeOf<EngineContext['levelPayment']>().toEqualTypeOf<
      (balance: Money, periodicRate: Rate, months: number) => Money
    >();
    expectTypeOf<EngineContext['remainingTerm']>().toEqualTypeOf<(state: PeriodState) => number>();
    expectTypeOf<EngineContext['remainingTerm']>().parameters.toEqualTypeOf<[state: PeriodState]>();
    expectTypeOf<EngineContext['projectCapital']>().toEqualTypeOf<(state: PeriodState, n: number) => Money>();
    expectTypeOf<EngineContext['projectCapital']>().parameters.toEqualTypeOf<[state: PeriodState, n: number]>();
    expectTypeOf<EngineContext['registry']>().toEqualTypeOf<EventHandlerRegistry>();
  });

  it('a handler maps a typed input to a result, and the registry has one per type', () => {
    expectTypeOf<EventHandler<'Prepayment'>>().toEqualTypeOf<(input: HandlerInput<PrepaymentEvent>) => HandlerResult>();
    expectTypeOf<keyof EventHandlerRegistry>().toEqualTypeOf<DomainEventType>();
    expectTypeOf<EventHandlerRegistry['Prepayment']>().toEqualTypeOf<EventHandler<'Prepayment'>>();
    expectTypeOf<HandlerResult['state']>().toEqualTypeOf<PeriodState>();
    expectTypeOf<HandlerInput<PrepaymentEvent>>().toEqualTypeOf<{
      readonly ctx: EngineContext;
      readonly terms: LoanTerms;
      readonly event: PrepaymentEvent;
      readonly k: number;
      readonly state: PeriodState;
      readonly projectedOpening: Money;
      readonly fixedCharges: readonly FixedCharge[];
      readonly row: ScheduleRow | null;
    }>();
    expectTypeOf<HandlerResult>().toEqualTypeOf<{
      readonly state: PeriodState;
      readonly fixedCharges?: readonly FixedCharge[];
      readonly rowEffect?: RowEffect;
      readonly anchorDelta?: AnchorRealDelta;
      readonly componentDelta?: ComponentRealDelta;
    }>();
    expectTypeOf<RowEffect>().toEqualTypeOf<{
      readonly prepayment?: Money;
      readonly commission?: Money;
      readonly payoff?: boolean;
      readonly paid?: boolean;
    }>();
  });

  it('a derived schedule separates own and inherited events ([ALG.EVENTS.ANCHOR] rule 3, [ALG.GOAL])', () => {
    expectTypeOf<ScheduleOptions>().toEqualTypeOf<{
      readonly inheritedEvents?: readonly DomainEvent[];
      readonly goalPrepayment?: PrepaymentEvent;
    }>();
    expectTypeOf<BuildScheduleFn>().toEqualTypeOf<
      (terms: LoanTerms, events: readonly DomainEvent[], ctx: EngineContext, options?: ScheduleOptions) => Schedule
    >();
    expectTypeOf<RunScheduleFn>().toEqualTypeOf<
      (terms: LoanTerms, events: readonly DomainEvent[], ctx: EngineContext, options?: ScheduleOptions) => ScheduleRun
    >();
  });
});
