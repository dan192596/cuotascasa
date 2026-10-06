/**
 * Frozen DI tokens of the data contract (W0-05). Features and core inject these; data/ provides them.
 * Only `import type` from the packages (ADR-0010 §5).
 */
import { InjectionToken } from '@angular/core';
import type {
  BackupService,
  LoanEventsStore,
  LoanProjectionService,
  LoansStore,
  PaymentsStore,
  ReportedBalancesStore,
  ScenariosStore,
  SettingsStore,
  StorageHealth,
  SyncService,
} from './api.ts';

export const LOANS_STORE = new InjectionToken<LoansStore>('LoansStore');
export const LOAN_EVENTS_STORE = new InjectionToken<LoanEventsStore>('LoanEventsStore');
export const REPORTED_BALANCES_STORE = new InjectionToken<ReportedBalancesStore>('ReportedBalancesStore');
export const PAYMENTS_STORE = new InjectionToken<PaymentsStore>('PaymentsStore');
export const SCENARIOS_STORE = new InjectionToken<ScenariosStore>('ScenariosStore');
export const SETTINGS_STORE = new InjectionToken<SettingsStore>('SettingsStore');
export const LOAN_PROJECTION_SERVICE = new InjectionToken<LoanProjectionService>('LoanProjectionService');
export const BACKUP_SERVICE = new InjectionToken<BackupService>('BackupService');
export const SYNC_SERVICE = new InjectionToken<SyncService>('SyncService');
/** Provided by provideStorageHealth() (core/storage-health, W3-13) next to provideAppData() in app-area.routes.ts. */
export const STORAGE_HEALTH = new InjectionToken<StorageHealth>('StorageHealth');
