import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { backupDocumentSchema } from '../backup/types.ts';
import { ENTITY_KEYS, ENTITY_SCHEMAS } from '../entities/registry.ts';
import { entityArbitraries } from './index.ts';

const arbitraries = entityArbitraries();

describe('schema arbitraries', () => {
  for (const key of ENTITY_KEYS) {
    it(`every generated ${key} record passes its zod schema (1000 runs)`, () => {
      fc.assert(
        fc.property(arbitraries[key], (record) => {
          const result = ENTITY_SCHEMAS[key].safeParse(record);
          expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
        }),
        { numRuns: 1000 },
      );
    });
  }

  it('every generated backup document passes the latest document schema (500 runs)', () => {
    fc.assert(
      fc.property(arbitraries.backupDocument, (document) => {
        expect(backupDocumentSchema.safeParse(document).success).toBe(true);
        expect(document).not.toHaveProperty('synthetic');
      }),
      { numRuns: 500 },
    );
  });

  it('exposes one arbitrary per entity key plus whole data and documents', () => {
    expect(Object.keys(arbitraries).sort()).toEqual([...ENTITY_KEYS, 'backupData', 'backupDocument'].sort());
  });

  it('covers every event type, both settings scopes, tombstones and optional fields', () => {
    const seen = {
      types: new Set<string>(),
      scopes: new Set<string>(),
      tombstone: false,
      live: false,
      noteAbsent: false,
      notePresent: false,
      commission: false,
    };
    const sample = (arb: fc.Arbitrary<unknown>, count: number): unknown[] =>
      fc.sample(arb, { numRuns: count, seed: 7 });
    for (const event of sample(arbitraries.events, 400) as {
      type: string;
      deletedAt: string | null;
      note?: string;
      commission?: unknown;
    }[]) {
      seen.types.add(event.type);
      seen.tombstone ||= event.deletedAt !== null;
      seen.live ||= event.deletedAt === null;
      seen.noteAbsent ||= event.note === undefined;
      seen.notePresent ||= event.note !== undefined;
      seen.commission ||= event.commission !== undefined;
    }
    for (const setting of sample(arbitraries.settings, 100) as { scope: string }[]) {
      seen.scopes.add(setting.scope);
    }
    expect([...seen.types].sort()).toEqual(['AdvanceInstallments', 'FixedChargeChange', 'Prepayment', 'RateChange']);
    expect([...seen.scopes].sort()).toEqual(['device', 'synced']);
    expect(seen).toMatchObject({ tombstone: true, live: true, noteAbsent: true, notePresent: true, commission: true });
  });
});
