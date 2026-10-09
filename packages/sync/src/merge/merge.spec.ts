import type { BackupData, DeviceSettings, Loan, SyncedSettings } from '@cuotascasa/schema';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { compareRecordOrder } from '../ports.ts';
import { DEVICES, DEVICE_SETTINGS_ID, SYNCED_ID, datasetArb, deepFreeze } from './testing/arbitraries.ts';
import { mergeDatasets } from './index.ts';

const RUNS = { numRuns: 500 };
const [A, B] = DEVICES;
const empty: BackupData = { loans: [], events: [], reportedBalances: [], payments: [], scenarios: [], settings: [] };

function loan(updatedAt: string, device: string, deletedAt: string | null = null, name = 'Casa'): Loan {
  return {
    id: 'a0000000-0000-4000-8000-000000000001',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt,
    updatedByDevice: device,
    deletedAt,
    name,
    bank: 'Banco Ficticio',
    currency: 'GTQ',
    principal: '500000.00',
    termMonths: 240,
    disbursementDate: '2025-01-31',
    firstDueDate: '2025-02-28',
    paymentDay: 'END_OF_MONTH',
    interestRate: '0.07',
    rateType: 'VARIABLE',
    insuranceRates: ['0.01', '0.0026'],
    fixedCharges: [],
    roundingProfile: 'FHA_GT_V1',
    templateRef: { id: 'fha-gt', version: 1 },
    status: 'active',
  };
}
const withLoans = (...loans: Loan[]): BackupData => ({ ...empty, loans });
const T1 = '2026-10-02T10:00:00.000Z';
const T2 = '2026-10-02T10:00:00.001Z';

describe('mergeDatasets properties', () => {
  for (const monotonic of [true, false]) {
    const arb = datasetArb({ monotonic });
    const label = monotonic ? 'monotonic stamping' : 'free versions';
    it(`is commutative (${label})`, () => {
      fc.assert(
        fc.property(arb, arb, (a, b) => {
          expect(mergeDatasets(a, b).merged).toEqual(mergeDatasets(b, a).merged);
        }),
        RUNS,
      );
    });
    it(`is idempotent (${label})`, () => {
      fc.assert(
        fc.property(arb, arb, (a, b) => {
          const m = mergeDatasets(a, b).merged;
          expect(mergeDatasets(m, b).merged).toEqual(m);
          expect(mergeDatasets(a, m).merged).toEqual(m);
          expect(mergeDatasets(m, m).merged).toEqual(m);
        }),
        RUNS,
      );
    });
    it(`is associative (${label})`, () => {
      fc.assert(
        fc.property(arb, arb, arb, (a, b, c) => {
          const left = mergeDatasets(mergeDatasets(a, b).merged, c).merged;
          const right = mergeDatasets(a, mergeDatasets(b, c).merged).merged;
          expect(left).toEqual(right);
        }),
        RUNS,
      );
    });
    it(`never yields duplicate ids and keeps the greatest version (${label})`, () => {
      fc.assert(
        fc.property(arb, arb, (a, b) => {
          const { merged } = mergeDatasets(a, b);
          for (const key of ['loans', 'reportedBalances', 'payments', 'settings'] as const) {
            const ids = merged[key].map((r) => r.id);
            expect(new Set(ids).size).toBe(ids.length);
            const all = [...a[key], ...b[key]].filter((r) => r.id !== DEVICE_SETTINGS_ID);
            for (const r of merged[key]) {
              const rivals = all.filter((x) => x.id === r.id);
              expect(rivals.every((x) => compareRecordOrder(r, x) >= 0)).toBe(true);
            }
            expect(new Set(all.map((r) => r.id))).toEqual(new Set(ids));
          }
        }),
        RUNS,
      );
    });
    it(`never mutates frozen inputs (${label})`, () => {
      fc.assert(
        fc.property(arb, arb, (a, b) => {
          const snapshot = JSON.stringify([a, b]);
          deepFreeze(a);
          deepFreeze(b);
          mergeDatasets(a, b);
          expect(JSON.stringify([a, b])).toBe(snapshot);
        }),
        RUNS,
      );
    });
  }
});

describe('mergeDatasets cases', () => {
  it('a newer tombstone beats an older edit, in either argument order', () => {
    const edit = loan(T1, A, null, 'Editada');
    const tomb = loan(T2, B, T2);
    expect(mergeDatasets(withLoans(edit), withLoans(tomb)).merged.loans).toEqual([tomb]);
    expect(mergeDatasets(withLoans(tomb), withLoans(edit)).merged.loans).toEqual([tomb]);
  });

  it('a newer edit beats an older tombstone (undo by editing later)', () => {
    const tomb = loan(T1, A, T1);
    const edit = loan(T2, B, null, 'Revivida');
    expect(mergeDatasets(withLoans(tomb), withLoans(edit)).merged.loans).toEqual([edit]);
    expect(mergeDatasets(withLoans(edit), withLoans(tomb)).merged.loans).toEqual([edit]);
  });

  it('a full tie (same updatedAt and device) resolves to the tombstone', () => {
    const edit = loan(T1, A, null, 'Viva');
    const tomb = loan(T1, A, T1, 'Viva');
    expect(mergeDatasets(withLoans(edit), withLoans(tomb)).merged.loans).toEqual([tomb]);
    expect(mergeDatasets(withLoans(tomb), withLoans(edit)).merged.loans).toEqual([tomb]);
  });

  it('equal updatedAt resolves by the greater updatedByDevice', () => {
    const fromA = loan(T1, A, null, 'De A');
    const fromB = loan(T1, B, null, 'De B');
    expect(mergeDatasets(withLoans(fromA), withLoans(fromB)).merged.loans).toEqual([fromB]);
    expect(mergeDatasets(withLoans(fromB), withLoans(fromA)).merged.loans).toEqual([fromB]);
  });

  it('keeps records present on one side only and sorts the output by id', () => {
    const one = { ...loan(T1, A), id: 'a0000000-0000-4000-8000-000000000002' };
    const two = { ...loan(T1, A), id: 'a0000000-0000-4000-8000-000000000001' };
    const { merged } = mergeDatasets(withLoans(one), withLoans(two));
    expect(merged.loans.map((l) => l.id)).toEqual([two.id, one.id]);
  });

  it('collapses duplicate ids inside one input to the greatest version', () => {
    const older = loan(T1, A);
    const newer = loan(T2, A);
    expect(mergeDatasets(withLoans(older, newer), empty).merged.loans).toEqual([newer]);
  });

  it('reports stats: fromLocal, fromRemote and tombstones', () => {
    const idOf = (n: number) => `a0000000-0000-4000-8000-00000000000${n}`;
    const local = withLoans(
      { ...loan(T2, A), id: idOf(1) }, // local wins
      { ...loan(T1, A), id: idOf(2) }, // remote wins
      { ...loan(T1, A), id: idOf(3) }, // identical
      { ...loan(T1, A), id: idOf(4) }, // local only
    );
    const remote = withLoans(
      { ...loan(T1, B), id: idOf(1) },
      { ...loan(T2, B, T2), id: idOf(2) },
      { ...loan(T1, A), id: idOf(3) },
      { ...loan(T1, B), id: idOf(5) }, // remote only
    );
    expect(mergeDatasets(local, remote).stats).toEqual({ fromLocal: 3, fromRemote: 2, tombstones: 1 });
  });
});

describe('mergeDatasets settings', () => {
  const synced = (updatedAt: string, device: string): SyncedSettings => ({
    id: SYNCED_ID,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt,
    updatedByDevice: device,
    deletedAt: null,
    scope: 'synced',
    activeScenarioByLoan: {},
  });
  const device = (theme: DeviceSettings['theme'], updatedAt: string): DeviceSettings => ({
    id: DEVICE_SETTINGS_ID,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt,
    updatedByDevice: A,
    deletedAt: null,
    scope: 'device',
    theme,
    driveSyncEnabled: true,
  });

  it('merges synced settings like any record', () => {
    const merged = mergeDatasets(
      { ...empty, settings: [synced(T1, A)] },
      { ...empty, settings: [synced(T2, B)] },
    ).merged;
    expect(merged.settings).toEqual([synced(T2, B)]);
  });

  it('drops device-local settings from both inputs and from the result', () => {
    const local = { ...empty, settings: [synced(T1, A), device('dark', T2)] };
    const remote = { ...empty, settings: [device('light', T2)] };
    const { merged, stats } = mergeDatasets(local, remote);
    expect(merged.settings).toEqual([synced(T1, A)]);
    expect(stats).toEqual({ fromLocal: 1, fromRemote: 0, tombstones: 0 });
    expect(mergeDatasets(remote, local).merged.settings).toEqual([synced(T1, A)]);
    expect(mergeDatasets(remote, remote).merged.settings).toEqual([]);
  });

  it('drops a device record identified by scope even with another id', () => {
    const odd = { ...device('dark', T1), id: 'b0000000-0000-4000-8000-000000000009' } as unknown as DeviceSettings;
    expect(mergeDatasets({ ...empty, settings: [odd] }, empty).merged.settings).toEqual([]);
  });
});
