import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { StorageEstimateView, StorageHealth } from './api.ts';
import { provideAppData } from './provide-app-data.ts';
import {
  BACKUP_SERVICE,
  LOAN_EVENTS_STORE,
  LOAN_PROJECTION_SERVICE,
  LOANS_STORE,
  PAYMENTS_STORE,
  REPORTED_BALANCES_STORE,
  SCENARIOS_STORE,
  SETTINGS_STORE,
  STORAGE_HEALTH,
  SYNC_SERVICE,
} from './tokens.ts';

/** Stand-in for provideStorageHealth() (core/storage-health), which app-area.routes.ts installs next to provideAppData(). */
const STORAGE_HEALTH_FAKE: StorageHealth = {
  persisted: signal<boolean | null>(null).asReadonly(),
  estimate: signal<StorageEstimateView | null>(null).asReadonly(),
  safariNonStandalone: signal(false).asReadonly(),
  requestPersist: () => Promise.resolve(false),
};

describe('provideAppData()', () => {
  it('provides every data token of tokens.ts except STORAGE_HEALTH', () => {
    TestBed.configureTestingModule({ providers: [provideAppData()] });
    expect(TestBed.inject(STORAGE_HEALTH, null)).toBeNull();

    // As in app-area.routes.ts: the stores may inject STORAGE_HEALTH (requestPersist after the first write, W3-11).
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideAppData(), { provide: STORAGE_HEALTH, useValue: STORAGE_HEALTH_FAKE }],
    });
    const tokens = [
      LOANS_STORE,
      LOAN_EVENTS_STORE,
      REPORTED_BALANCES_STORE,
      PAYMENTS_STORE,
      SCENARIOS_STORE,
      SETTINGS_STORE,
      LOAN_PROJECTION_SERVICE,
      BACKUP_SERVICE,
      SYNC_SERVICE,
    ];
    for (const token of tokens) {
      expect(TestBed.inject(token, null), String(token)).not.toBeNull();
    }
  });
});
