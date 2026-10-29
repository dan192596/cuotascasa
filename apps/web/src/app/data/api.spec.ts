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
import type { DataStore } from '@cuotascasa/persistence';
import type { BackupData, IsoInstant, Uuid } from '@cuotascasa/schema';
import type { LocalDataset, SyncDataset, SyncErrorCode, SyncStatus } from '@cuotascasa/sync';
import { describe, expectTypeOf, it } from 'vitest';
import type {
  AnchorDelta,
  BackupFile,
  BackupService,
  CurrencyTotals,
  DeviceDataService,
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

describe('data/api.ts DeviceDataService (W7-04)', () => {
  it('declares only clearAll(): Promise<void>', () => {
    expectTypeOf<DeviceDataService>().toEqualTypeOf<{ clearAll(): Promise<void> }>();
    expectTypeOf<keyof DeviceDataService>().toEqualTypeOf<'clearAll'>();
  });
});

describe('data/api.ts BackupService (W9-01, ADR-0007 decision 8)', () => {
  it('exportJson only builds the file; markExported(file) is the one that marks the backup', () => {
    expectTypeOf<BackupService['exportJson']>().parameters.toEqualTypeOf<
      [options?: { readonly passphrase?: string }]
    >();
    expectTypeOf<BackupService['exportJson']>().returns.toEqualTypeOf<Promise<BackupFile>>();
    expectTypeOf<BackupService['markExported']>().parameters.toEqualTypeOf<[file: BackupFile]>();
    expectTypeOf<BackupService['markExported']>().returns.toEqualTypeOf<Promise<void>>();
  });
});

describe('W9-01 port amendments seen from data/', () => {
  it('markSynced takes what was uploaded (optional until W9-02)', () => {
    expectTypeOf<DataStore['markSynced']>().parameters.toEqualTypeOf<[at: IsoInstant, uploaded?: BackupData]>();
    expectTypeOf<LocalDataset['markSynced']>().parameters.toEqualTypeOf<[at: IsoInstant, uploaded?: SyncDataset]>();
    expectTypeOf<SyncDataset>().toEqualTypeOf<BackupData>();
  });

  it('a full Drive has its own error code and error status', () => {
    expectTypeOf<'QuotaExceeded'>().toExtend<SyncErrorCode>();
    expectTypeOf<Extract<SyncStatus, { readonly state: 'error' }>['code']>().toEqualTypeOf<
      'UnsupportedVersion' | 'WeakParams' | 'InvalidRemote' | 'QuotaExceeded'
    >();
  });
});
