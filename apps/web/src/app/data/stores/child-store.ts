import { computed, type Signal } from '@angular/core';
import type {
  DataStoreRepositories,
  EntityName,
  LoanChildRepository,
  NewRecord,
  RecordUpdate,
} from '@cuotascasa/persistence';
import type { BaseRecord, Uuid } from '@cuotascasa/schema';
import { DataError, type LoanChildStore } from '../api.ts';
import type { StoresRuntime } from './store-runtime.ts';

export type ChildRecord = BaseRecord & { readonly loanId: Uuid };

/** One loan child collection (events, reported balances, payments, scenarios) over the shared runtime. */
export class ChildStore<T extends ChildRecord> implements LoanChildStore<T, NewRecord<T>, RecordUpdate<T>> {
  readonly ready: Signal<boolean>;
  private readonly signals = new Map<Uuid, Signal<readonly T[]>>();

  protected readonly runtime: StoresRuntime;
  protected readonly entity: EntityName;
  private readonly records: Signal<readonly T[]>;
  protected readonly repository: (repositories: DataStoreRepositories) => LoanChildRepository<T>;

  constructor(
    runtime: StoresRuntime,
    entity: EntityName,
    records: Signal<readonly T[]>,
    repository: (repositories: DataStoreRepositories) => LoanChildRepository<T>,
  ) {
    this.runtime = runtime;
    this.entity = entity;
    this.records = records;
    this.repository = repository;
    this.ready = runtime.ready;
  }

  listByLoan(loanId: Uuid): Signal<readonly T[]> {
    let signal = this.signals.get(loanId);
    if (!signal) {
      signal = computed(() => this.records().filter((record) => record.loanId === loanId));
      this.signals.set(loanId, signal);
    }
    return signal;
  }

  create(draft: NewRecord<T>): Promise<T> {
    return this.runtime.write([this.entity], (store) =>
      store.transaction(async (tx) => {
        if (!(await tx.loans.get(draft.loanId))) {
          throw new DataError('VALIDATION');
        }
        return this.repository(tx).create(draft);
      }),
    );
  }

  update(update: RecordUpdate<T>): Promise<T> {
    return this.runtime.write([this.entity], (store) =>
      store.transaction(async (tx) => {
        const current = await this.repository(tx).get(update.id);
        if (!current) {
          throw new DataError('NOT_FOUND');
        }
        if (current.loanId !== update.loanId) {
          throw new DataError('VALIDATION');
        }
        return this.repository(tx).update(update);
      }),
    );
  }

  async delete(id: Uuid): Promise<void> {
    await this.runtime.write([this.entity], (store) => this.repository(store).delete(id));
  }
}
