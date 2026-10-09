import type { Signal } from '@angular/core';
import type {
  AnchorRealDelta,
  ComponentRealDelta,
  Currency,
  DeltaCause,
  DomainError,
  LocalDate,
  Money,
  Paths,
  ScheduleRow,
  ValidationStatus,
} from '@cuotascasa/domain';
import type { Uuid } from '@cuotascasa/schema';
import { describe, expectTypeOf, it } from 'vitest';
import type {
  AnchorDelta,
  CurrencyTotals,
  LoanProjection,
  LoanProjectionService,
  LoanValidation,
  PercentString,
  RealRecordWrite,
  ScenarioComparison,
} from './api.ts';

describe('data/api.ts LoanProjectionService (spec §9 «Valores derivados»)', () => {
  it('forLoan returns the per-loan projection', () => {
    expectTypeOf<LoanProjectionService['forLoan']>().parameters.toEqualTypeOf<[Uuid]>();
    expectTypeOf<LoanProjectionService['forLoan']>().returns.toEqualTypeOf<LoanProjection>();
    expectTypeOf<LoanProjectionService['asOf']>().toEqualTypeOf<Signal<LocalDate>>();
    expectTypeOf<LoanProjectionService['checkRealWrite']>().parameters.toEqualTypeOf<[Uuid, RealRecordWrite]>();
    expectTypeOf<LoanProjectionService['checkRealWrite']>().returns.toEqualTypeOf<DomainError | null>();
    expectTypeOf<ScenarioComparison['failed']>().toEqualTypeOf<
      readonly { readonly scenarioId: Uuid; readonly error: DomainError }[]
    >();
  });

  it('declares every spec §9 derived value', () => {
    expectTypeOf<LoanProjection['asOf']>().toEqualTypeOf<Signal<LocalDate>>();
    expectTypeOf<LoanProjection['currentInstallment']>().toEqualTypeOf<Signal<ScheduleRow | null>>();
    expectTypeOf<LoanProjection['balance']>().toEqualTypeOf<Signal<Money | null>>();
    expectTypeOf<LoanProjection['percentPaid']>().toEqualTypeOf<Signal<PercentString | null>>();
    expectTypeOf<LoanProjection['nextInstallmentTotal']>().toEqualTypeOf<Signal<Money | null>>();
    expectTypeOf<LoanProjection['realEndDate']>().toEqualTypeOf<Signal<LocalDate | null>>();
    expectTypeOf<LoanProjection['activeScenarioEndDate']>().toEqualTypeOf<Signal<LocalDate | null>>();
    expectTypeOf<LoanProjection['validation']>().toEqualTypeOf<Signal<LoanValidation>>();
    expectTypeOf<LoanValidation['status']>().toEqualTypeOf<ValidationStatus>();
    expectTypeOf<'UNVALIDATED'>().toExtend<LoanValidation['status']>();
    expectTypeOf<LoanProjection['suggestedPaid']>().toEqualTypeOf<Signal<boolean>>();
    expectTypeOf<LoanProjectionService['totalsByCurrency']>().toEqualTypeOf<Signal<readonly CurrencyTotals[]>>();
    expectTypeOf<PercentString>().toEqualTypeOf<string>();
    expectTypeOf<CurrencyTotals>().toEqualTypeOf<{
      readonly currency: Currency;
      readonly loanCount: number;
      readonly balance: Money;
      readonly nextInstallmentTotal: Money;
    }>();
    expectTypeOf<LoanValidation>().toEqualTypeOf<{
      readonly status: ValidationStatus;
      readonly reportedBalanceId: Uuid | null;
      readonly k: number | null;
      readonly realDelta: Money | null;
      readonly cause: DeltaCause | null;
    }>();
  });

  it('declares cutoffK, the per-row paid flags and Real Δ per anchor and per component from the domain paths', () => {
    expectTypeOf<LoanProjection['cutoffK']>().toEqualTypeOf<Signal<number>>();
    expectTypeOf<LoanProjection['paidInstallments']>().toEqualTypeOf<Signal<ReadonlySet<number>>>();
    expectTypeOf<LoanProjection['realDeltaPerAnchor']>().toEqualTypeOf<Signal<readonly AnchorDelta[]>>();
    expectTypeOf<AnchorDelta>().toExtend<AnchorRealDelta>();
    expectTypeOf<AnchorDelta['status']>().toEqualTypeOf<ValidationStatus>();
    expectTypeOf<AnchorDelta['cause']>().toEqualTypeOf<DeltaCause | null>();
    expectTypeOf<LoanProjection['realDeltaPerComponent']>().toEqualTypeOf<Signal<readonly ComponentRealDelta[]>>();
    expectTypeOf<LoanProjection['paths']>().toEqualTypeOf<Signal<Paths | null>>();
    expectTypeOf<LoanProjection['error']>().toEqualTypeOf<Signal<DomainError | null>>();
  });
});
