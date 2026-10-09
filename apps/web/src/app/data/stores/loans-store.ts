import { computed, type Signal } from '@angular/core';
import type { DataStoreTransaction } from '@cuotascasa/persistence';
import { isLoanCurrencyLocked, type Loan, type LoanStatus, type ReportedBalance, type Uuid } from '@cuotascasa/schema';
import { type AnchorDraft, DataError, type LoanDraft, type LoansStore, type LoanUpdate } from '../api.ts';
import { type StoresRuntime, toUpdate, withoutKey } from './store-runtime.ts';

/** Anything that can tombstone the children of a loan. */
interface Tombstoner {
  listByLoan(loanId: Uuid): Promise<readonly { readonly id: Uuid }[]>;
  delete(id: Uuid): Promise<unknown>;
}

export async function tombstoneChildren(tx: DataStoreTransaction, loanId: Uuid): Promise<void> {
  const repositories: readonly Tombstoner[] = [tx.events, tx.reportedBalances, tx.payments, tx.scenarios];
  for (const repository of repositories) {
    for (const record of await repository.listByLoan(loanId)) {
      await repository.delete(record.id);
    }
  }
}

/** Removes the loan's active-scenario pointer, when it has one. Runs inside the caller's transaction. */
export async function clearActiveScenario(
  tx: DataStoreTransaction,
  loanId: Uuid,
  onlyScenarioId?: Uuid,
): Promise<void> {
  const synced = await tx.settings.getSynced();
  const pointer = synced?.activeScenarioByLoan[loanId];
  if (!synced || pointer === undefined || (onlyScenarioId !== undefined && pointer !== onlyScenarioId)) {
    return;
  }
  await tx.settings.saveSynced({ activeScenarioByLoan: withoutKey(synced.activeScenarioByLoan, loanId) });
}

export class LoansStoreImpl implements LoansStore {
  readonly ready: Signal<boolean>;
  readonly loans: Signal<readonly Loan[]>;
  private readonly loanSignals = new Map<Uuid, Signal<Loan | undefined>>();
  private readonly lockSignals = new Map<Uuid, Signal<boolean>>();

  private readonly runtime: StoresRuntime;

  constructor(runtime: StoresRuntime) {
    this.runtime = runtime;
    this.ready = runtime.ready;
    this.loans = runtime.loans;
  }

  loan(id: Uuid): Signal<Loan | undefined> {
    let signal = this.loanSignals.get(id);
    if (!signal) {
      signal = computed(() => this.runtime.loans().find((loan) => loan.id === id));
      this.loanSignals.set(id, signal);
    }
    return signal;
  }

  create(draft: LoanDraft): Promise<Loan> {
    return this.runtime.write(['loans'], (store) => store.loans.create(draft));
  }

  createWithAnchor(
    draft: LoanDraft,
    anchor: AnchorDraft,
  ): Promise<{ readonly loan: Loan; readonly anchor: ReportedBalance }> {
    return this.runtime.write(['loans', 'reportedBalances'], (store) =>
      store.transaction(async (tx) => {
        const loan = await tx.loans.create(draft);
        const created = await tx.reportedBalances.create({ ...anchor, loanId: loan.id });
        return { loan, anchor: created };
      }),
    );
  }

  update(update: LoanUpdate): Promise<Loan> {
    return this.runtime.write(['loans'], (store) =>
      store.transaction(async (tx) => {
        const current = await tx.loans.get(update.id);
        if (!current) {
          throw new DataError('NOT_FOUND');
        }
        if (current.currency !== update.currency) {
          const children = {
            events: await tx.events.listByLoan(update.id),
            reportedBalances: await tx.reportedBalances.listByLoan(update.id),
            payments: await tx.payments.listByLoan(update.id),
            scenarios: await tx.scenarios.listByLoan(update.id),
          };
          if (isLoanCurrencyLocked(update.id, children)) {
            throw new DataError('CURRENCY_LOCKED');
          }
        }
        return tx.loans.update(update);
      }),
    );
  }

  setStatus(id: Uuid, status: LoanStatus): Promise<Loan> {
    return this.runtime.write(['loans'], (store) =>
      store.transaction(async (tx) => {
        const current = await tx.loans.get(id);
        if (!current) {
          throw new DataError('NOT_FOUND');
        }
        return tx.loans.update(toUpdate(current, { status }));
      }),
    );
  }

  delete(id: Uuid): Promise<void> {
    return this.runtime.write(['loans', 'events', 'reportedBalances', 'payments', 'scenarios', 'settings'], (store) =>
      store.transaction(async (tx) => {
        await tx.loans.delete(id);
        await tombstoneChildren(tx, id);
        await clearActiveScenario(tx, id);
      }),
    );
  }

  isCurrencyLocked(id: Uuid): Signal<boolean> {
    let signal = this.lockSignals.get(id);
    if (!signal) {
      signal = computed(() =>
        isLoanCurrencyLocked(id, {
          events: this.runtime.events(),
          reportedBalances: this.runtime.reportedBalances(),
          payments: this.runtime.payments(),
          scenarios: this.runtime.scenarios(),
        }),
      );
      this.lockSignals.set(id, signal);
    }
    return signal;
  }
}
