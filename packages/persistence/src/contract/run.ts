import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DataStoreFactory } from '../ports.ts';
import { CONTRACT_CASES, type ContractContext } from './cases.ts';
import { createManualClock, createSequentialIds } from './fakes.ts';

const SETTLE_MS = 25;

/**
 * Registers the frozen DataStore contract for one adapter (ADR-0006 decision 4).
 * `factory` must return an empty store isolated from every other call (a fresh database per call for Dexie).
 */
export function runDataStoreContract(name: string, factory: DataStoreFactory): void {
  describe(`DataStore contract: ${name}`, () => {
    let ctx: ContractContext | undefined;

    beforeEach(async () => {
      const clock = createManualClock();
      const ids = createSequentialIds();
      const store = await factory({ clock, ids });
      ctx = {
        store,
        clock,
        ids,
        settle: () =>
          new Promise<void>((resolve) => {
            setTimeout(resolve, SETTLE_MS);
          }),
      };
    });

    afterEach(async () => {
      const finished = ctx;
      ctx = undefined;
      await finished?.store.close();
      // ports.ts (Clock.today): persistence never reads Clock.today, whatever the case did (the domain's asOf comes
      // from data/).
      if (finished !== undefined) {
        expect(finished.clock.todayCalls, 'the store must never call Clock.today').toBe(0);
      }
    });

    for (const contractCase of CONTRACT_CASES) {
      it(contractCase.name, async () => {
        if (ctx === undefined) {
          throw new Error('Contract context was not created');
        }
        await contractCase.run(ctx);
      });
    }
  });
}
