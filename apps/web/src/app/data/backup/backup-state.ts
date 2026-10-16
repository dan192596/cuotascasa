import { type Signal, computed, signal } from '@angular/core';
import type { Clock, DataStore } from '@cuotascasa/persistence';
import type { IsoInstant } from '@cuotascasa/schema';

const DAY_MS = 24 * 60 * 60 * 1000;
/** ADR-0007 decision 8. */
export const REMINDER_MAX_DAYS = 30;
export const REMINDER_MAX_CHANGES = 20;

/**
 * ADR-0007 decision 8, the single source of the reminder rule. With a previous backup: more than 30 days since it or more
 * than 20 changes. Without one: more than 20 changes, or the oldest active record is more than 30 days old (none: only
 * the changes count).
 */
export function isReminderDue(input: {
  readonly lastBackupAt: IsoInstant | null;
  readonly changesSinceBackup: number;
  readonly oldestActiveAt: IsoInstant | null;
  readonly now: IsoInstant;
}): boolean {
  if (input.changesSinceBackup > REMINDER_MAX_CHANGES) {
    return true;
  }
  const reference = input.lastBackupAt ?? input.oldestActiveAt;
  if (reference === null) {
    return false;
  }
  return Date.parse(input.now) - Date.parse(reference) > REMINDER_MAX_DAYS * DAY_MS;
}

/** Signals of the backup service, refreshed from the DataStore (last write wins on concurrent refreshes). */
export class BackupState {
  private readonly lastBackupState = signal<IsoInstant | null>(null);
  private readonly changesState = signal(0);
  private readonly oldestState = signal<IsoInstant | null>(null);
  private readonly nowState: ReturnType<typeof signal<IsoInstant>>;
  private sequence = 0;

  readonly lastBackupAt: Signal<IsoInstant | null> = this.lastBackupState.asReadonly();
  readonly changesSinceBackup: Signal<number> = this.changesState.asReadonly();
  readonly reminderDue: Signal<boolean>;

  protected readonly source: Promise<DataStore>;
  private readonly clock: Clock;

  constructor(source: Promise<DataStore>, clock: Clock) {
    this.source = source;
    this.clock = clock;
    this.nowState = signal(clock.now());
    this.reminderDue = computed(() =>
      isReminderDue({
        lastBackupAt: this.lastBackupState(),
        changesSinceBackup: this.changesState(),
        oldestActiveAt: this.oldestState(),
        now: this.nowState(),
      }),
    );
  }

  protected clockNow(): IsoInstant {
    return this.clock.now();
  }

  protected clockToday(): string {
    return this.clock.today();
  }

  protected async refresh(): Promise<void> {
    const mine = ++this.sequence;
    try {
      const store = await this.source;
      const [meta, changes] = await Promise.all([store.getMeta(), store.changesSinceBackup()]);
      const oldest = meta.lastBackupAt === null ? await this.oldestActive(store) : null;
      if (mine !== this.sequence) {
        return;
      }
      this.lastBackupState.set(meta.lastBackupAt);
      this.changesState.set(changes);
      this.oldestState.set(oldest);
      this.nowState.set(this.clock.now());
    } catch {
      // The signals keep their last values; the next notification retries.
    }
  }

  private async oldestActive(store: DataStore): Promise<IsoInstant | null> {
    const lists = await Promise.all([
      store.loans.list(),
      store.events.list(),
      store.reportedBalances.list(),
      store.payments.list(),
      store.scenarios.list(),
    ]);
    let oldest: IsoInstant | null = null;
    for (const records of lists) {
      for (const record of records) {
        if (oldest === null || Date.parse(record.createdAt) < Date.parse(oldest)) {
          oldest = record.createdAt;
        }
      }
    }
    return oldest;
  }
}
