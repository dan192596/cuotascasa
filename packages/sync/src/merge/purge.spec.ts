import type { BackupData, Loan, Scenario } from '@cuotascasa/schema';
import { describe, expect, it } from 'vitest';
import { TOMBSTONE_RETENTION_MS } from '../ports.ts';
import { deepFreeze } from './testing/arbitraries.ts';
import { purgeTombstones } from './index.ts';

const DAY = 86_400_000;
const LAST = '2026-10-01T12:00:00.000Z';
const lastMs = Date.parse(LAST);
const iso = (ms: number) => new Date(ms).toISOString();
const empty: BackupData = { loans: [], events: [], reportedBalances: [], payments: [], scenarios: [], settings: [] };

function loan(id: number, deletedAt: string | null): Loan {
  return {
    id: `a0000000-0000-4000-8000-00000000000${id}`,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: deletedAt ?? '2026-01-01T00:00:00.000Z',
    updatedByDevice: 'd0000000-0000-4000-8000-00000000000a',
    deletedAt,
    name: 'Casa',
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
const purgedFor = (deletedAt: string | null, lastSyncAt: string | null = LAST) =>
  purgeTombstones({ ...empty, loans: [loan(1, deletedAt)] }, lastSyncAt);

describe('purgeTombstones (ADR-0008 decision 4)', () => {
  it('uses 90 x 86 400 000 ms', () => {
    expect(TOMBSTONE_RETENTION_MS).toBe(7_776_000_000);
  });

  it('purges only when deletedAt is strictly earlier than lastSyncAt - 90 days', () => {
    const edge = lastMs - 90 * DAY;
    expect(purgedFor(iso(edge - 1)).purged).toBe(1);
    expect(purgedFor(iso(edge - 1)).dataset.loans).toEqual([]);
    expect(purgedFor(iso(edge)).purged).toBe(0);
    expect(purgedFor(iso(edge + 1)).purged).toBe(0);
    expect(purgedFor(iso(lastMs - 89 * DAY)).purged).toBe(0);
    expect(purgedFor(iso(lastMs - 91 * DAY)).purged).toBe(1);
  });

  it('purges nothing when lastSyncAt is null', () => {
    const r = purgedFor('2000-01-01T00:00:00.000Z', null);
    expect(r.purged).toBe(0);
    expect(r.dataset.loans).toHaveLength(1);
  });

  it('never purges live records', () => {
    expect(purgedFor(null).purged).toBe(0);
  });

  it('compares instants in ms, not as calendar days', () => {
    const edge = lastMs - 90 * DAY;
    // 90 days minus one millisecond earlier lastSyncAt in another second: still in retention
    expect(purgedFor(iso(edge + 999)).purged).toBe(0);
  });

  it('counts purged records across collections and keeps the rest', () => {
    const old = iso(lastMs - 100 * DAY);
    const data: BackupData = {
      ...empty,
      loans: [loan(1, old), loan(2, null), loan(3, iso(lastMs - DAY))],
    };
    const r = purgeTombstones(data, LAST);
    expect(r.purged).toBe(1);
    expect(r.dataset.loans.map((l) => l.id)).toEqual([data.loans[1]?.id, data.loans[2]?.id]);
  });

  it('removes whole records only and never edits content (nested deletedAt stay)', () => {
    const old = iso(lastMs - 100 * DAY);
    const scenario = {
      id: 'f0000000-0000-4000-8000-000000000001',
      createdAt: old,
      updatedAt: iso(lastMs - DAY),
      updatedByDevice: 'd0000000-0000-4000-8000-00000000000a',
      deletedAt: null,
      events: [{ deletedAt: old }],
    } as unknown as Scenario;
    const data = deepFreeze({ ...empty, scenarios: [scenario] });
    const r = purgeTombstones(data, LAST);
    expect(r.purged).toBe(0);
    expect(r.dataset.scenarios[0]).toBe(scenario);
  });

  it('is idempotent and does not mutate frozen input', () => {
    const data = deepFreeze({ ...empty, loans: [loan(1, iso(lastMs - 100 * DAY)), loan(2, null)] });
    const once = purgeTombstones(data, LAST);
    const twice = purgeTombstones(once.dataset, LAST);
    expect(twice.purged).toBe(0);
    expect(twice.dataset).toEqual(once.dataset);
    expect(data.loans).toHaveLength(2);
  });
});
