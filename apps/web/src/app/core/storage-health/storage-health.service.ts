import { Injectable, inject, signal } from '@angular/core';
import type { StorageEstimateView, StorageHealth } from '../../data/api.ts';
import { isSafariNonStandalone } from './safari-detect.ts';
import { STORAGE_HEALTH_ENV } from './storage-health-env.ts';

/** Single source of navigator.storage facts and the only caller of persist() (ADR-0017, decision 5). */
@Injectable()
export class StorageHealthService implements StorageHealth {
  private readonly env = inject(STORAGE_HEALTH_ENV);
  private readonly persistedState = signal<boolean | null>(null);
  private readonly estimateState = signal<StorageEstimateView | null>(null);
  private persistRequest: Promise<boolean> | undefined;
  private persistAnswered = false;

  readonly persisted = this.persistedState.asReadonly();
  readonly estimate = this.estimateState.asReadonly();
  readonly safariNonStandalone = signal(isSafariNonStandalone(this.env.browser)).asReadonly();

  constructor() {
    void this.refresh();
  }

  /** At most one navigator.storage.persist() call per session; later calls share its result. */
  requestPersist(): Promise<boolean> {
    this.persistRequest ??= this.doPersist();
    return this.persistRequest;
  }

  private async doPersist(): Promise<boolean> {
    const storage = this.env.storage;
    if (storage === undefined || typeof storage.persist !== 'function') return false;
    try {
      const granted = await storage.persist();
      this.persistAnswered = true;
      this.persistedState.set(granted);
      void this.refresh();
      return granted;
    } catch {
      return false;
    }
  }

  private async refresh(): Promise<void> {
    const storage = this.env.storage;
    if (storage === undefined) return;
    try {
      if (typeof storage.persisted === 'function') {
        const current = await storage.persisted();
        if (!this.persistAnswered) this.persistedState.set(current);
      }
    } catch {
      /* unknown stays null */
    }
    try {
      if (typeof storage.estimate === 'function') {
        const { usage, quota } = await storage.estimate();
        if (typeof usage === 'number' && typeof quota === 'number') {
          this.estimateState.set({ usageBytes: usage, quotaBytes: quota });
        }
      }
    } catch {
      /* unknown stays null */
    }
  }
}
