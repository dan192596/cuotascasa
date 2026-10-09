import { computed, type Signal } from '@angular/core';
import type { Scenario, Uuid } from '@cuotascasa/schema';
import { DataError, type ScenariosStore } from '../api.ts';
import { ChildStore } from './child-store.ts';
import { clearActiveScenario } from './loans-store.ts';
import { type StoresRuntime, withoutKey } from './store-runtime.ts';

export class ScenariosStoreImpl extends ChildStore<Scenario> implements ScenariosStore {
  private readonly activeSignals = new Map<Uuid, Signal<Uuid | null>>();

  constructor(runtime: StoresRuntime) {
    super(runtime, 'scenarios', runtime.scenarios, (repositories) => repositories.scenarios);
  }

  override async delete(id: Uuid): Promise<void> {
    await this.runtime.write(['scenarios', 'settings'], (store) =>
      store.transaction(async (tx) => {
        const scenario = await tx.scenarios.delete(id);
        await clearActiveScenario(tx, scenario.loanId, id);
      }),
    );
  }

  activeScenarioId(loanId: Uuid): Signal<Uuid | null> {
    let signal = this.activeSignals.get(loanId);
    if (!signal) {
      signal = computed(() => this.runtime.synced()?.activeScenarioByLoan[loanId] ?? null);
      this.activeSignals.set(loanId, signal);
    }
    return signal;
  }

  async setActiveScenario(loanId: Uuid, scenarioId: Uuid | null): Promise<void> {
    await this.runtime.write(['settings'], (store) =>
      store.transaction(async (tx) => {
        if (scenarioId !== null) {
          const scenario = await tx.scenarios.get(scenarioId);
          if (!scenario || scenario.loanId !== loanId) {
            throw new DataError('VALIDATION');
          }
        }
        const current = await tx.settings.getSynced();
        const others = withoutKey(current?.activeScenarioByLoan ?? {}, loanId);
        await tx.settings.saveSynced({
          activeScenarioByLoan: scenarioId === null ? others : { ...others, [loanId]: scenarioId },
        });
      }),
    );
  }
}
