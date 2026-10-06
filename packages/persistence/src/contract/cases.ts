import {
  DEVICE_SETTINGS_ID,
  ENTITY_KEYS,
  SYNCED_SETTINGS_ID,
  backupDataSchema,
  uuidSchema,
  type BackupData,
  type BaseRecord,
  type DeviceSettingsValues,
  type SyncedSettingsValues,
} from '@cuotascasa/schema';
import { expect, vi } from 'vitest';
import {
  RecordNotFoundError,
  RecordValidationError,
  SnapshotNotFoundError,
  type ChangeEvent,
  type DataStore,
  type DataStoreRepositories,
  type EntityName,
} from '../ports.ts';
import type { ManualClock, SequentialIds } from './fakes.ts';
import { sequentialUuid } from './fakes.ts';
import type { PortMethodId } from './registry.ts';
import {
  ENTITY_DESCRIPTORS,
  sampleEvent,
  sampleLoan,
  samplePayment,
  sampleReportedBalance,
  sampleScenario,
  type AnyRecord,
  type EntityDescriptor,
  type UntypedRepository,
} from './samples.ts';

export interface ContractContext {
  readonly store: DataStore;
  readonly clock: ManualClock;
  readonly ids: SequentialIds;
  /** Gives pending asynchronous notifications time to be delivered (negative assertions). */
  settle(): Promise<void>;
}

export interface ContractCase {
  readonly name: string;
  /** Port methods whose behaviour this case pins; the meta-test requires the union to cover ports.ts. */
  readonly covers: readonly PortMethodId[];
  run(ctx: ContractContext): Promise<void>;
}

const OTHER_DEVICE = 'd0000000-0000-4000-8000-0000000000ff';

function loansOf(ctx: ContractContext): UntypedRepository {
  return ctx.store.loans as unknown as UntypedRepository;
}

async function newLoanId(ctx: ContractContext): Promise<string> {
  return (await loansOf(ctx).create(sampleLoan())).id;
}

function record(events: ChangeEvent[]): (event: ChangeEvent) => void {
  return (event) => {
    events.push(event);
  };
}

function isOrdered(records: readonly BaseRecord[]): boolean {
  return records.every((current, index) => {
    const previous = records[index - 1];
    if (previous === undefined) {
      return true;
    }
    return (
      previous.createdAt < current.createdAt || (previous.createdAt === current.createdAt && previous.id < current.id)
    );
  });
}

function plusMs(instant: string, milliseconds: number): string {
  return new Date(Date.parse(instant) + milliseconds).toISOString();
}

/** The call must reject with an instance of `type` whose own fields include `fields` (error class and payload). */
async function expectRejection(
  call: Promise<unknown>,
  type: new (...args: never[]) => Error,
  fields: Record<string, unknown>,
): Promise<void> {
  await expect(call).rejects.toBeInstanceOf(type);
  await expect(call).rejects.toMatchObject(fields);
}

/** Payload of RecordValidationError(target, issues): at least one issue, each with a path and a message. */
function validationPayload(target: EntityName | 'dataset'): Record<string, unknown> {
  return {
    code: 'VALIDATION',
    target,
    issues: expect.arrayContaining([expect.objectContaining({ path: expect.any(Array), message: expect.any(String) })]),
  };
}

/** Payload of RecordNotFoundError(entity, id): the collection and the id that was looked up. */
function notFoundPayload(entity: EntityName, id: string): Record<string, unknown> {
  return { code: 'NOT_FOUND', entity, id };
}

/** Payload of SnapshotNotFoundError(snapshotId): the id that was looked up. */
function snapshotPayload(snapshotId: string): Record<string, unknown> {
  return { code: 'SNAPSHOT_NOT_FOUND', snapshotId };
}

/**
 * Mutates `value` in place at every depth: pushes an element into every array and adds a key to every object.
 * Frozen or sealed values are left alone, because an immutable copy cannot be corrupted either.
 */
function scribble(value: unknown): void {
  if (typeof value !== 'object' || value === null) {
    return;
  }
  const children: unknown[] = Array.isArray(value) ? value : Object.values(value);
  for (const child of children) {
    scribble(child);
  }
  if (!Object.isExtensible(value)) {
    return;
  }
  if (Array.isArray(value)) {
    value.push('scribbled');
  } else {
    Object.assign(value, { scribbled: true });
  }
}

function stamped<T extends object>(
  fields: T,
  id: string,
  at: string,
  device = OTHER_DEVICE,
  deletedAt: string | null = null,
) {
  return { ...fields, id, createdAt: at, updatedAt: at, updatedByDevice: device, deletedAt };
}

/** A valid foreign dataset (stamps from another device) used by the replaceAll and snapshot cases. */
function foreignDataset(): BackupData {
  const loanA = sequentialUuid(501);
  const loanB = sequentialUuid(502);
  return {
    loans: [
      stamped(sampleLoan(), loanA, '2026-09-01T10:00:00.000Z'),
      stamped(
        { ...sampleLoan(), name: 'Casa C' },
        loanB,
        '2026-09-02T10:00:00.000Z',
        OTHER_DEVICE,
        '2026-09-03T10:00:00.000Z',
      ),
    ],
    events: [stamped(sampleEvent(loanA), sequentialUuid(503), '2026-09-01T11:00:00.000Z')],
    reportedBalances: [],
    payments: [],
    scenarios: [],
    settings: [
      { ...stamped({ activeScenarioByLoan: {} }, SYNCED_SETTINGS_ID, '2026-09-01T12:00:00.000Z'), scope: 'synced' },
      {
        ...stamped({ theme: 'light', driveSyncEnabled: true }, DEVICE_SETTINGS_ID, '2026-09-01T12:00:00.000Z'),
        scope: 'device',
      },
    ],
  } as BackupData;
}

async function parentFor(ctx: ContractContext, descriptor: EntityDescriptor): Promise<string> {
  return descriptor.isLoanChild ? newLoanId(ctx) : sequentialUuid(0);
}

/**
 * The per-collection cases, run once at store level and once through one-call transactions (TRANSACTION_BATTERY, below).
 * `observesNotifications` is true at store level and false in the battery, where the one case that listens for
 * notifications leaves that assertion out.
 */
function entityCases(descriptor: EntityDescriptor, observesNotifications: boolean): ContractCase[] {
  const key = descriptor.key;
  const listByLoanCover: readonly PortMethodId[] = descriptor.isLoanChild ? ['LoanChildRepository.listByLoan'] : [];
  const listings = descriptor.isLoanChild ? 'list, listByLoan' : 'list';
  return [
    {
      name: `${key}: create stamps the record with Clock.now, IdGenerator.newId and the device id; get returns it`,
      covers: ['Repository.create', 'Repository.get'],
      async run(ctx) {
        const loanId = await parentFor(ctx, descriptor);
        ctx.clock.set('2026-10-04T16:00:00.000Z');
        const repo = descriptor.repo(ctx.store);
        const created = await repo.create(descriptor.sample(loanId));
        const meta = await ctx.store.getMeta();
        expect(uuidSchema.safeParse(created.id).success).toBe(true);
        expect(ctx.ids.issued).toContain(created.id);
        expect(created.createdAt).toBe('2026-10-04T16:00:00.000Z');
        expect(created.updatedAt).toBe(created.createdAt);
        expect(created.updatedByDevice).toBe(meta.deviceId);
        expect(created.deletedAt).toBeNull();
        expect(created).toMatchObject(descriptor.sample(loanId));
        expect(await repo.get(created.id)).toEqual(created);
      },
    },
    {
      name: `${key}: create rejects an invalid record with RecordValidationError and writes nothing`,
      covers: observesNotifications ? ['Repository.create', 'DataStore.subscribe'] : ['Repository.create'],
      async run(ctx) {
        const loanId = await parentFor(ctx, descriptor);
        const events: ChangeEvent[] = [];
        if (observesNotifications) {
          await ctx.settle();
          ctx.store.subscribe(record(events));
        }
        const pendingBefore = await ctx.store.pendingChanges();
        const repo = descriptor.repo(ctx.store);
        await expectRejection(repo.create(descriptor.invalid(loanId)), RecordValidationError, validationPayload(key));
        expect(await repo.list({ includeDeleted: true })).toEqual([]);
        expect(await ctx.store.pendingChanges()).toBe(pendingBefore);
        if (observesNotifications) {
          await ctx.settle();
          expect(events).toEqual([]);
        }
      },
    },
    {
      name: `${key}: update replaces user fields, keeps id and createdAt and stamps a newer updatedAt`,
      covers: ['Repository.update'],
      async run(ctx) {
        const loanId = await parentFor(ctx, descriptor);
        const repo = descriptor.repo(ctx.store);
        const created = await repo.create(descriptor.sample(loanId));
        ctx.clock.set('2026-10-04T17:00:00.000Z');
        const edit = descriptor.edit(created);
        const updated = await repo.update(edit);
        expect(updated.id).toBe(created.id);
        expect(updated.createdAt).toBe(created.createdAt);
        expect(updated.updatedAt).toBe('2026-10-04T17:00:00.000Z');
        expect(updated).toMatchObject(edit);
        expect(await repo.get(created.id)).toEqual(updated);
      },
    },
    // ports.ts (Repository): every write validates the stamped record and rejects without writing, update included.
    {
      name: `${key}: update rejects an invalid record with RecordValidationError and keeps the stored record`,
      covers: ['Repository.update', 'DataStore.pendingChanges'],
      async run(ctx) {
        const loanId = await parentFor(ctx, descriptor);
        const repo = descriptor.repo(ctx.store);
        const created = await repo.create(descriptor.sample(loanId));
        await ctx.store.markSynced('2026-10-04T18:00:00.000Z');
        await expectRejection(
          repo.update({ ...descriptor.invalid(loanId), id: created.id }),
          RecordValidationError,
          validationPayload(key),
        );
        expect(await repo.get(created.id)).toEqual(created);
        expect(await ctx.store.pendingChanges()).toBe(0);
      },
    },
    {
      name: `${key}: update of a missing or deleted record throws RecordNotFoundError`,
      covers: ['Repository.update', 'Repository.delete'],
      async run(ctx) {
        const loanId = await parentFor(ctx, descriptor);
        const repo = descriptor.repo(ctx.store);
        const created = await repo.create(descriptor.sample(loanId));
        const edit = descriptor.edit(created);
        await expectRejection(
          repo.update({ ...edit, id: sequentialUuid(999) }),
          RecordNotFoundError,
          notFoundPayload(key, sequentialUuid(999)),
        );
        await repo.delete(created.id);
        await expectRejection(repo.update(edit), RecordNotFoundError, notFoundPayload(key, created.id));
      },
    },
    {
      name: `${key}: delete leaves a tombstone that only includeDeleted reads return`,
      covers: ['Repository.delete', 'Repository.get', 'Repository.list'],
      async run(ctx) {
        const loanId = await parentFor(ctx, descriptor);
        const repo = descriptor.repo(ctx.store);
        const created = await repo.create(descriptor.sample(loanId));
        ctx.clock.set('2026-10-04T17:00:00.000Z');
        const deleted = await repo.delete(created.id);
        expect(deleted.deletedAt).toBe(deleted.updatedAt);
        expect(deleted.updatedAt).toBe('2026-10-04T17:00:00.000Z');
        expect(await repo.get(created.id)).toBeUndefined();
        expect(await repo.get(created.id, { includeDeleted: true })).toEqual(deleted);
        expect(await repo.list()).toEqual([]);
        expect(await repo.list({ includeDeleted: true })).toEqual([deleted]);
        // An id that never existed is not a tombstone: get resolves undefined instead of throwing.
        expect(await repo.get(sequentialUuid(999))).toBeUndefined();
        expect(await repo.get(sequentialUuid(999), { includeDeleted: true })).toBeUndefined();
      },
    },
    {
      name: `${key}: delete of a missing id throws RecordNotFoundError; deleting a tombstone again is a no-op`,
      covers: ['Repository.delete', 'DataStore.pendingChanges'],
      async run(ctx) {
        const loanId = await parentFor(ctx, descriptor);
        const repo = descriptor.repo(ctx.store);
        await expectRejection(
          repo.delete(sequentialUuid(999)),
          RecordNotFoundError,
          notFoundPayload(key, sequentialUuid(999)),
        );
        const created = await repo.create(descriptor.sample(loanId));
        const first = await repo.delete(created.id);
        await ctx.store.markSynced('2026-10-04T18:00:00.000Z');
        ctx.clock.advance(1_000);
        const second = await repo.delete(created.id);
        expect(second).toEqual(first);
        expect(await ctx.store.pendingChanges()).toBe(0);
      },
    },
    // ports.ts (Repository, LoanChildRepository.listByLoan and DataStore.exportAll), ADR-0006 decision 4: every
    // listing, exportAll and listByLoan included, orders by (createdAt, id). The retimed dataset makes creation order,
    // id order and insertion order all disagree with it.
    {
      name: `${key}: ${listings} and exportAll order by (createdAt, id) and every read returns a copy`,
      covers: ['Repository.list', 'Repository.get', 'DataStore.replaceAll', 'DataStore.exportAll', ...listByLoanCover],
      async run(ctx) {
        const loanId = await parentFor(ctx, descriptor);
        const repo = descriptor.repo(ctx.store);
        const first = await repo.create(descriptor.sample(loanId));
        const second = await repo.create(descriptor.sample(loanId));
        const third = await repo.create(descriptor.sample(loanId));
        const data = await ctx.store.exportAll();
        const rows = data[key] as unknown as AnyRecord[];
        const retimed = rows.map((row) => {
          if (row.id === second.id) {
            return { ...row, createdAt: '2026-01-01T00:00:00.000Z' };
          }
          if (row.id === third.id) {
            return { ...row, createdAt: first.createdAt };
          }
          return row;
        });
        await ctx.store.replaceAll({ ...data, [key]: [...retimed].reverse() } as BackupData, {
          pending: 'keep',
          backedUpAt: 'keep',
        });
        const expectedOrder = [second.id, first.id, third.id];
        const listed = await repo.list();
        expect(listed.map((row) => row.id)).toEqual(expectedOrder);
        const exported = (await ctx.store.exportAll())[key] as unknown as AnyRecord[];
        expect(exported.map((row) => row.id)).toEqual(expectedOrder);
        if (descriptor.isLoanChild) {
          const listByLoan = repo.listByLoan?.bind(repo);
          expect(listByLoan).toBeDefined();
          if (listByLoan !== undefined) {
            expect((await listByLoan(loanId)).map((row) => row.id)).toEqual(expectedOrder);
          }
        }
        (listed[0] as { updatedByDevice: string }).updatedByDevice = 'mutated';
        const fetched = await repo.get(second.id);
        expect(fetched?.updatedByDevice).toBe(second.updatedByDevice);
        (fetched as { updatedByDevice: string }).updatedByDevice = 'mutated';
        expect((await repo.list())[0]?.updatedByDevice).toBe(second.updatedByDevice);
      },
    },
    // ports.ts (Repository: reads return copies and writes copy their input) and ADR-0006 decision 4: IndexedDB
    // structured-clones at any depth, so no object that crosses the port, going in or coming out, may be shared with
    // the store, nested values included.
    {
      name: `${key}: no object that crosses the port is shared with the store, at any depth`,
      covers: [
        'Repository.create',
        'Repository.get',
        'Repository.list',
        'Repository.update',
        'Repository.delete',
        'DataStore.exportAll',
        ...listByLoanCover,
      ],
      async run(ctx) {
        const loanId = await parentFor(ctx, descriptor);
        const repo = descriptor.repo(ctx.store);
        const input = descriptor.sample(loanId);
        const created = await repo.create(input);
        let expected = structuredClone(created);
        const intact = async (): Promise<void> => {
          expect(await repo.get(created.id, { includeDeleted: true })).toEqual(expected);
        };
        scribble(input);
        await intact();
        scribble(created);
        await intact();
        scribble(await repo.get(created.id));
        await intact();
        scribble(await repo.list());
        await intact();
        scribble(await ctx.store.exportAll());
        await intact();
        const listByLoan = repo.listByLoan?.bind(repo);
        if (listByLoan !== undefined) {
          scribble(await listByLoan(loanId));
          await intact();
        }
        const edit = descriptor.edit(structuredClone(expected));
        const updated = await repo.update(edit);
        expected = structuredClone(updated);
        scribble(edit);
        await intact();
        scribble(updated);
        await intact();
        const deleted = await repo.delete(created.id);
        expected = structuredClone(deleted);
        scribble(deleted);
        await intact();
      },
    },
  ];
}

function childCases(descriptor: EntityDescriptor): ContractCase[] {
  return [
    {
      name: `${descriptor.key}: listByLoan filters by loan, keeps (createdAt, id) order and hides tombstones`,
      covers: ['LoanChildRepository.listByLoan'],
      async run(ctx) {
        const loanA = await newLoanId(ctx);
        const loanB = await newLoanId(ctx);
        const repo = descriptor.repo(ctx.store);
        const a1 = await repo.create(descriptor.sample(loanA));
        const b1 = await repo.create(descriptor.sample(loanB));
        const a2 = await repo.create(descriptor.sample(loanA));
        const a3 = await repo.create(descriptor.sample(loanA));
        const a2Deleted = await repo.delete(a2.id);
        const listByLoan = repo.listByLoan?.bind(repo);
        expect(listByLoan).toBeDefined();
        if (listByLoan === undefined) {
          return;
        }
        expect(await listByLoan(loanA)).toEqual([a1, a3]);
        expect(await listByLoan(loanA, { includeDeleted: true })).toEqual([a1, a2Deleted, a3]);
        expect(await listByLoan(loanB)).toEqual([b1]);
        expect(await listByLoan(sequentialUuid(999))).toEqual([]);
      },
    },
  ];
}

const settingsCases: ContractCase[] = [
  {
    name: 'settings: an empty store has neither settings record',
    covers: ['SettingsRepository.getSynced', 'SettingsRepository.getDevice'],
    async run(ctx) {
      expect(await ctx.store.settings.getSynced()).toBeUndefined();
      expect(await ctx.store.settings.getDevice()).toBeUndefined();
    },
  },
  {
    name: 'settings: saveSynced creates then updates the fixed-id synced record and counts as one change',
    covers: ['SettingsRepository.saveSynced', 'SettingsRepository.getSynced', 'DataStore.changesSinceBackup'],
    async run(ctx) {
      const first = await ctx.store.settings.saveSynced({ activeScenarioByLoan: {} });
      expect(first).toMatchObject({ id: SYNCED_SETTINGS_ID, scope: 'synced', deletedAt: null });
      expect(first.updatedAt).toBe(first.createdAt);
      ctx.clock.advance(1_000);
      const second = await ctx.store.settings.saveSynced({
        activeScenarioByLoan: { [sequentialUuid(700)]: sequentialUuid(701) },
      });
      expect(second.createdAt).toBe(first.createdAt);
      expect(second.updatedAt).toBe(plusMs(first.updatedAt, 1_000));
      expect(await ctx.store.settings.getSynced()).toEqual(second);
      expect(await ctx.store.pendingChanges()).toBe(1);
      expect(await ctx.store.changesSinceBackup()).toBe(1);
    },
  },
  {
    name: 'settings: saveDevice creates then updates the device record and never counts as a change',
    covers: ['SettingsRepository.saveDevice', 'SettingsRepository.getDevice', 'DataStore.pendingChanges'],
    async run(ctx) {
      const first = await ctx.store.settings.saveDevice({ theme: 'dark', driveSyncEnabled: false });
      expect(first).toMatchObject({ id: DEVICE_SETTINGS_ID, scope: 'device', theme: 'dark' });
      ctx.clock.advance(1_000);
      const second = await ctx.store.settings.saveDevice({ theme: 'light', driveSyncEnabled: true });
      expect(second.createdAt).toBe(first.createdAt);
      expect(await ctx.store.settings.getDevice()).toEqual(second);
      expect(await ctx.store.pendingChanges()).toBe(0);
      expect(await ctx.store.changesSinceBackup()).toBe(0);
    },
  },
  {
    name: 'settings: invalid values are rejected with RecordValidationError and nothing is written',
    covers: ['SettingsRepository.saveSynced', 'SettingsRepository.saveDevice'],
    async run(ctx) {
      await expectRejection(
        ctx.store.settings.saveSynced({ activeScenarioByLoan: { 'loan-1': 'x' } }),
        RecordValidationError,
        validationPayload('settings'),
      );
      await expectRejection(
        ctx.store.settings.saveDevice({ theme: 'sepia' as 'dark', driveSyncEnabled: false }),
        RecordValidationError,
        validationPayload('settings'),
      );
      expect(await ctx.store.settings.getSynced()).toBeUndefined();
      expect(await ctx.store.settings.getDevice()).toBeUndefined();
    },
  },
  // ports.ts (Repository): writes copy their input and reads return copies, at any depth. The settings records follow
  // the same rule and the per-collection case never reaches them, so they get their own case.
  {
    name: 'settings: no object that crosses the port is shared with the store, at any depth',
    covers: [
      'SettingsRepository.saveSynced',
      'SettingsRepository.getSynced',
      'SettingsRepository.saveDevice',
      'SettingsRepository.getDevice',
    ],
    async run(ctx) {
      const syncedInput: SyncedSettingsValues = {
        activeScenarioByLoan: { [sequentialUuid(700)]: sequentialUuid(701) },
      };
      const deviceInput: DeviceSettingsValues = { theme: 'dark', driveSyncEnabled: false };
      // Each save is scribbled before the next write: a store that copies its state on every write would otherwise
      // orphan a leaked object, and the leak would go unnoticed.
      const synced = await ctx.store.settings.saveSynced(syncedInput);
      const expectedSynced = structuredClone(synced);
      scribble(syncedInput);
      scribble(synced);
      const device = await ctx.store.settings.saveDevice(deviceInput);
      const expectedDevice = structuredClone(device);
      scribble(deviceInput);
      scribble(device);
      scribble(await ctx.store.settings.getSynced());
      scribble(await ctx.store.settings.getDevice());
      expect(await ctx.store.settings.getSynced()).toEqual(expectedSynced);
      expect(await ctx.store.settings.getDevice()).toEqual(expectedDevice);
    },
  },
];

const stampCases: ContractCase[] = [
  {
    name: 'stamps: writes read Clock.now and IdGenerator.newId and never call Clock.today',
    covers: ['Clock.now', 'Clock.today', 'IdGenerator.newId'],
    async run(ctx) {
      const nowCalls = ctx.clock.nowCalls;
      const loan = await loansOf(ctx).create(sampleLoan());
      expect(ctx.clock.nowCalls).toBeGreaterThan(nowCalls);
      expect(ctx.ids.issued).toContain(loan.id);
      await loansOf(ctx).update({ ...sampleLoan(), id: loan.id });
      await ctx.store.settings.saveSynced({ activeScenarioByLoan: {} });
      await ctx.store.exportAll();
      await loansOf(ctx).delete(loan.id);
      expect(ctx.clock.todayCalls).toBe(0);
    },
  },
  {
    name: 'stamps: updatedAt grows by 1 ms per write when the clock repeats',
    covers: ['Clock.now', 'Repository.update'],
    async run(ctx) {
      ctx.clock.set('2026-10-04T16:00:00.000Z');
      const created = await loansOf(ctx).create(sampleLoan());
      const once = await loansOf(ctx).update({ ...sampleLoan(), id: created.id, name: 'Casa B' });
      const twice = await loansOf(ctx).update({ ...sampleLoan(), id: created.id, name: 'Casa C' });
      expect([created.updatedAt, once.updatedAt, twice.updatedAt]).toEqual([
        '2026-10-04T16:00:00.000Z',
        '2026-10-04T16:00:00.001Z',
        '2026-10-04T16:00:00.002Z',
      ]);
    },
  },
  {
    name: 'stamps: stay strictly increasing when the clock goes backwards',
    covers: ['Clock.now', 'Repository.create'],
    async run(ctx) {
      ctx.clock.set('2026-10-04T16:00:00.000Z');
      const first = await loansOf(ctx).create(sampleLoan());
      ctx.clock.set('2026-10-04T15:00:00.000Z');
      const second = await loansOf(ctx).create(sampleLoan());
      const edited = await loansOf(ctx).update({ ...sampleLoan(), id: first.id, name: 'Casa B' });
      expect(second.createdAt).toBe('2026-10-04T16:00:00.001Z');
      expect(edited.updatedAt).toBe('2026-10-04T16:00:00.002Z');
    },
  },
  {
    name: 'stamps: an update supersedes a record stamped in the future by another device',
    covers: ['Repository.update', 'DataStore.replaceAll'],
    async run(ctx) {
      const data = foreignDataset();
      const future = '2026-10-05T15:00:00.000Z';
      const loan = { ...(data.loans[0] as AnyRecord), updatedAt: future };
      await ctx.store.replaceAll({ ...data, loans: [loan] } as BackupData, { pending: 'keep', backedUpAt: 'keep' });
      const updated = await loansOf(ctx).update({ ...sampleLoan(), id: loan.id, name: 'Casa B' });
      expect(updated.updatedAt).toBe(plusMs(future, 1));
      expect(updated.updatedByDevice).toBe((await ctx.store.getMeta()).deviceId);
    },
  },
  // ports.ts (DataStore), ADR-0005 decision 2 and ADR-0008 decision 4.3: a delete stamped below a future-stamped
  // record would lose the merge, and the deleted record would come back.
  {
    name: 'stamps: a delete supersedes a record stamped in the future by another device',
    covers: ['Repository.delete', 'DataStore.replaceAll'],
    async run(ctx) {
      const data = foreignDataset();
      const future = '2026-10-05T15:00:00.000Z';
      const loan = { ...(data.loans[0] as AnyRecord), updatedAt: future };
      await ctx.store.replaceAll({ ...data, loans: [loan] } as BackupData, { pending: 'keep', backedUpAt: 'keep' });
      const deleted = await loansOf(ctx).delete(loan.id);
      expect(deleted.updatedAt).toBe(plusMs(future, 1));
      expect(deleted.deletedAt).toBe(deleted.updatedAt);
      expect(deleted.updatedByDevice).toBe((await ctx.store.getMeta()).deviceId);
    },
  },
  // Same rule for the settings records (ports.ts: SettingsRepository.saveSynced and DataStore): the save is stamped
  // above the stored record.
  {
    name: 'stamps: saveSynced supersedes a synced settings record stamped in the future by another device',
    covers: ['SettingsRepository.saveSynced', 'DataStore.replaceAll'],
    async run(ctx) {
      const data = foreignDataset();
      const future = '2026-10-05T15:00:00.000Z';
      const synced = { ...(data.settings[0] as AnyRecord), updatedAt: future };
      await ctx.store.replaceAll({ ...data, settings: [synced] } as BackupData, {
        pending: 'keep',
        backedUpAt: 'keep',
      });
      const saved = await ctx.store.settings.saveSynced({
        activeScenarioByLoan: { [sequentialUuid(700)]: sequentialUuid(701) },
      });
      expect(saved.updatedAt).toBe(plusMs(future, 1));
      expect(saved.createdAt).toBe(synced.createdAt);
      expect(saved.updatedByDevice).toBe((await ctx.store.getMeta()).deviceId);
    },
  },
  // ports.ts (DataStore): the stamp sequence is per device, so both settings records draw from it (+1 ms on a
  // repeating or backwards clock) together with the collections: the record written between the two saves takes the
  // stamp in between.
  {
    name: 'stamps: settings saves draw from the same monotonic sequence as record writes',
    covers: ['SettingsRepository.saveSynced', 'SettingsRepository.saveDevice', 'Repository.create', 'Clock.now'],
    async run(ctx) {
      ctx.clock.set('2026-10-04T16:00:00.000Z');
      const synced = await ctx.store.settings.saveSynced({ activeScenarioByLoan: {} });
      const loan = await loansOf(ctx).create(sampleLoan());
      const device = await ctx.store.settings.saveDevice({ theme: 'dark', driveSyncEnabled: false });
      ctx.clock.set('2026-10-04T15:00:00.000Z');
      const syncedAgain = await ctx.store.settings.saveSynced({
        activeScenarioByLoan: { [sequentialUuid(700)]: sequentialUuid(701) },
      });
      const deviceAgain = await ctx.store.settings.saveDevice({ theme: 'light', driveSyncEnabled: true });
      expect([synced, loan, device, syncedAgain, deviceAgain].map((saved) => saved.updatedAt)).toEqual([
        '2026-10-04T16:00:00.000Z',
        '2026-10-04T16:00:00.001Z',
        '2026-10-04T16:00:00.002Z',
        '2026-10-04T16:00:00.003Z',
        '2026-10-04T16:00:00.004Z',
      ]);
      expect(syncedAgain.createdAt).toBe(synced.createdAt);
      expect(deviceAgain.createdAt).toBe(device.createdAt);
    },
  },
];

const transactionCases: ContractCase[] = [
  {
    name: 'transaction: commits every write together, reads its own writes, returns the result and notifies once',
    covers: ['DataStore.transaction', 'DataStore.subscribe'],
    async run(ctx) {
      const events: ChangeEvent[] = [];
      ctx.store.subscribe(record(events));
      const loanId = await ctx.store.transaction(async (tx) => {
        const loan = await tx.loans.create(sampleLoan());
        expect(await tx.loans.get(loan.id)).toEqual(loan);
        await tx.payments.create(samplePayment(loan.id));
        return loan.id;
      });
      expect(await ctx.store.loans.get(loanId)).toBeDefined();
      expect(await ctx.store.payments.listByLoan(loanId)).toHaveLength(1);
      await vi.waitFor(() => {
        expect(events).toHaveLength(1);
      });
      await ctx.settle();
      expect(events).toEqual([{ entities: ['loans', 'payments'], origin: 'write' }]);
    },
  },
  {
    name: 'transaction: a failure rolls back every write, keeps the counters and does not notify',
    covers: ['DataStore.transaction', 'DataStore.subscribe'],
    async run(ctx) {
      const events: ChangeEvent[] = [];
      ctx.store.subscribe(record(events));
      const failure = new Error('synthetic failure');
      await expect(
        ctx.store.transaction(async (tx) => {
          const loan = await tx.loans.create(sampleLoan());
          await tx.reportedBalances.create(sampleReportedBalance(loan.id));
          await tx.settings.saveSynced({ activeScenarioByLoan: {} });
          throw failure;
        }),
      ).rejects.toBe(failure);
      expect(await ctx.store.loans.list({ includeDeleted: true })).toEqual([]);
      expect(await ctx.store.reportedBalances.list({ includeDeleted: true })).toEqual([]);
      expect(await ctx.store.settings.getSynced()).toBeUndefined();
      expect(await ctx.store.pendingChanges()).toBe(0);
      expect(await ctx.store.changesSinceBackup()).toBe(0);
      await ctx.settle();
      expect(events).toEqual([]);
    },
  },
  // ports.ts (DataStore, DataStore.pendingChanges and DataStore.changesSinceBackup): the writes of a transaction are
  // stamped one by one and counted like single writes.
  {
    name: 'transaction: writes are stamped one by one and counted like single writes',
    covers: ['DataStore.transaction', 'DataStore.pendingChanges', 'DataStore.changesSinceBackup'],
    async run(ctx) {
      ctx.clock.set('2026-10-04T16:00:00.000Z');
      const loan = await loansOf(ctx).create(sampleLoan());
      await ctx.store.markSynced('2026-10-04T16:30:00.000Z');
      await ctx.store.markBackedUp('2026-10-04T16:30:00.000Z');
      const written = await ctx.store.transaction(async (tx) => {
        const event = await tx.events.create(sampleEvent(loan.id));
        const updated = await tx.loans.update({ ...sampleLoan(), id: loan.id, name: 'Casa B' });
        const deleted = await tx.events.delete(event.id);
        return { event, updated, deleted };
      });
      expect([written.event.updatedAt, written.updated.updatedAt, written.deleted.updatedAt]).toEqual([
        '2026-10-04T16:00:00.001Z',
        '2026-10-04T16:00:00.002Z',
        '2026-10-04T16:00:00.003Z',
      ]);
      expect(written.deleted.deletedAt).toBe(written.deleted.updatedAt);
      expect(await ctx.store.events.get(written.event.id)).toBeUndefined();
      expect(await ctx.store.pendingChanges()).toBe(2);
      expect(await ctx.store.changesSinceBackup()).toBe(2);
    },
  },
  // ports.ts (Repository and DataStore.transaction): writes made through the transaction's repositories are
  // validated too, and an invalid one rolls the whole transaction back.
  {
    name: 'transaction: an invalid write rejects with RecordValidationError and rolls the transaction back',
    covers: ['DataStore.transaction', 'Repository.create'],
    async run(ctx) {
      const before = await ctx.store.exportAll();
      const attempt = ctx.store.transaction(async (tx) => {
        await tx.loans.create(sampleLoan());
        await (tx.loans as unknown as UntypedRepository).create({ ...sampleLoan(), principal: 500000 });
      });
      await expectRejection(attempt, RecordValidationError, validationPayload('loans'));
      expect(await ctx.store.exportAll()).toEqual(before);
      expect(await ctx.store.pendingChanges()).toBe(0);
    },
  },
  // Twin of the future-stamped cases of `stamps`: the record floor holds inside a transaction, and the second write
  // is stamped above the first.
  {
    name: 'transaction: writes supersede records stamped in the future by another device',
    covers: ['DataStore.transaction', 'DataStore.replaceAll'],
    async run(ctx) {
      const data = foreignDataset();
      const future = '2026-10-05T15:00:00.000Z';
      const loan = { ...(data.loans[0] as AnyRecord), updatedAt: future };
      const synced = { ...(data.settings[0] as AnyRecord), updatedAt: future };
      await ctx.store.replaceAll({ ...data, loans: [loan], settings: [synced] } as BackupData, {
        pending: 'keep',
        backedUpAt: 'keep',
      });
      const written = await ctx.store.transaction(async (tx) => {
        const updated = await tx.loans.update({ ...sampleLoan(), id: loan.id, name: 'Casa B' });
        const saved = await tx.settings.saveSynced({ activeScenarioByLoan: {} });
        return { updated, saved };
      });
      expect(written.updated.updatedAt).toBe(plusMs(future, 1));
      expect(written.saved.updatedAt).toBe(plusMs(future, 2));
    },
  },
  // ports.ts (SettingsRepository.saveSynced, DataStore and DataStore.transaction), ADR-0005 decision 2: the settings
  // record floor holds inside a transaction too. The save is the first stamp of the store here, so only the stored
  // record's own updatedAt can lift it above the clock (in the twin above, the previous write's stamp would already do
  // it).
  {
    name: 'transaction: saveSynced supersedes a synced settings record stamped in the future by another device',
    covers: ['DataStore.transaction', 'SettingsRepository.saveSynced', 'DataStore.replaceAll'],
    async run(ctx) {
      const data = foreignDataset();
      const future = '2026-10-05T15:00:00.000Z';
      const synced = { ...(data.settings[0] as AnyRecord), updatedAt: future };
      await ctx.store.replaceAll({ ...data, settings: [synced] } as BackupData, {
        pending: 'keep',
        backedUpAt: 'keep',
      });
      const saved = await ctx.store.transaction((tx) =>
        tx.settings.saveSynced({ activeScenarioByLoan: { [sequentialUuid(700)]: sequentialUuid(701) } }),
      );
      expect(saved.updatedAt).toBe(plusMs(future, 1));
      expect(saved.createdAt).toBe(synced.createdAt);
      expect(saved.updatedByDevice).toBe((await ctx.store.getMeta()).deviceId);
    },
  },
  // ports.ts (Repository.delete, DataStore and DataStore.transaction), ADR-0005 decision 2 and ADR-0008 decision 4.3:
  // a delete made through the transaction's repositories (cascading tombstones are written this way) keeps the record
  // floor too. It is the first stamp of the store here, so only the stored record's own updatedAt can lift it above the
  // clock.
  {
    name: 'transaction: a delete supersedes a record stamped in the future by another device',
    covers: ['DataStore.transaction', 'Repository.delete', 'DataStore.replaceAll'],
    async run(ctx) {
      const data = foreignDataset();
      const future = '2026-10-05T15:00:00.000Z';
      const loan = { ...(data.loans[0] as AnyRecord), updatedAt: future };
      await ctx.store.replaceAll({ ...data, loans: [loan] } as BackupData, { pending: 'keep', backedUpAt: 'keep' });
      const deleted = await ctx.store.transaction((tx) => tx.loans.delete(loan.id));
      expect(deleted.updatedAt).toBe(plusMs(future, 1));
      expect(deleted.deletedAt).toBe(deleted.updatedAt);
      expect(deleted.updatedByDevice).toBe((await ctx.store.getMeta()).deviceId);
    },
  },
  // ports.ts (DataStore): inside a transaction both settings records still draw from the per-device stamp sequence
  // with the collections, so at an unchanged clock each write is stamped one millisecond after the one before it.
  {
    name: 'transaction: settings saves draw from the same monotonic sequence as record writes',
    covers: [
      'DataStore.transaction',
      'SettingsRepository.saveSynced',
      'SettingsRepository.saveDevice',
      'Repository.create',
    ],
    async run(ctx) {
      ctx.clock.set('2026-10-04T16:00:00.000Z');
      const saved = await ctx.store.transaction(async (tx) => {
        const synced = await tx.settings.saveSynced({ activeScenarioByLoan: {} });
        const loan = await tx.loans.create(sampleLoan());
        const device = await tx.settings.saveDevice({ theme: 'dark', driveSyncEnabled: false });
        return [synced, loan, device];
      });
      expect(saved.map((record) => record.updatedAt)).toEqual([
        '2026-10-04T16:00:00.000Z',
        '2026-10-04T16:00:00.001Z',
        '2026-10-04T16:00:00.002Z',
      ]);
    },
  },
  // ports.ts (Repository.delete): deleting a record that is already deleted is a no-op, inside a transaction too. A
  // cascade that reaches a child deleted earlier (W3-11) must leave its stamp, and the pending set, alone.
  {
    name: 'transaction: deleting an already deleted record is a no-op and does not re-stamp it',
    covers: ['DataStore.transaction', 'Repository.delete', 'DataStore.pendingChanges'],
    async run(ctx) {
      const loan = await loansOf(ctx).create(sampleLoan());
      const first = await loansOf(ctx).delete(loan.id);
      await ctx.store.markSynced('2026-10-04T18:00:00.000Z');
      ctx.clock.advance(1_000);
      const second = await ctx.store.transaction((tx) => tx.loans.delete(loan.id));
      expect(second).toEqual(first);
      expect(await ctx.store.pendingChanges()).toBe(0);
    },
  },
  // ports.ts (Repository.update): update rejects with RecordNotFoundError when the record is missing or deleted,
  // inside a transaction too, so an update never revives a tombstone (a revived record would win the LWW merge against
  // its own delete).
  {
    name: 'transaction: update of a missing or deleted record throws RecordNotFoundError and revives nothing',
    covers: ['DataStore.transaction', 'Repository.update'],
    async run(ctx) {
      const loan = await loansOf(ctx).create(sampleLoan());
      const deleted = await loansOf(ctx).delete(loan.id);
      const edit = { ...sampleLoan(), id: loan.id, name: 'Casa B' };
      const missingId = sequentialUuid(999);
      await expectRejection(
        ctx.store.transaction((tx) => tx.loans.update({ ...edit, id: missingId })),
        RecordNotFoundError,
        notFoundPayload('loans', missingId),
      );
      await expectRejection(
        ctx.store.transaction((tx) => tx.loans.update(edit)),
        RecordNotFoundError,
        notFoundPayload('loans', loan.id),
      );
      expect(await ctx.store.loans.get(loan.id)).toBeUndefined();
      expect(await ctx.store.loans.get(loan.id, { includeDeleted: true })).toEqual(deleted);
    },
  },
  // ports.ts (Repository.update and DataStoreMeta.deviceId): an update made through the transaction's repositories
  // replaces the user fields, keeps id and createdAt, takes a new stamp and is attributed to this device, even when
  // another device wrote the record last (ADR-0008 decision 4.3 breaks updatedAt ties by updatedByDevice).
  {
    name: 'transaction: update replaces the user fields and attributes the record to this device',
    covers: ['DataStore.transaction', 'Repository.update', 'DataStore.replaceAll'],
    async run(ctx) {
      const data = foreignDataset();
      await ctx.store.replaceAll(data, { pending: 'keep', backedUpAt: 'keep' });
      const loan = data.loans[0] as AnyRecord;
      ctx.clock.set('2026-10-04T17:00:00.000Z');
      const updated = await ctx.store.transaction((tx) =>
        tx.loans.update({ ...sampleLoan(), id: loan.id, name: 'Casa B' }),
      );
      expect(updated).toMatchObject({
        id: loan.id,
        createdAt: loan.createdAt,
        updatedAt: '2026-10-04T17:00:00.000Z',
        name: 'Casa B',
      });
      expect(updated.updatedByDevice).toBe((await ctx.store.getMeta()).deviceId);
      expect(await ctx.store.loans.get(loan.id)).toEqual(updated);
    },
  },
  // ports.ts (Repository.create and DataStoreMeta.deviceId): a create made through the transaction's repositories
  // assigns the id from IdGenerator, the stamp from Clock.now and this device as author, like a single create.
  {
    name: 'transaction: create stamps the record with Clock.now, IdGenerator.newId and the device id',
    covers: ['DataStore.transaction', 'Repository.create'],
    async run(ctx) {
      ctx.clock.set('2026-10-04T16:00:00.000Z');
      const created = await ctx.store.transaction((tx) => tx.loans.create(sampleLoan()));
      const meta = await ctx.store.getMeta();
      expect(uuidSchema.safeParse(created.id).success).toBe(true);
      expect(ctx.ids.issued).toContain(created.id);
      expect(created.createdAt).toBe('2026-10-04T16:00:00.000Z');
      expect(created.updatedAt).toBe(created.createdAt);
      expect(created.updatedByDevice).toBe(meta.deviceId);
      expect(created.deletedAt).toBeNull();
      expect(created).toMatchObject(sampleLoan());
      expect(await ctx.store.loans.get(created.id)).toEqual(created);
    },
  },
  // ports.ts (GetOptions, ListOptions and Repository.delete): get and list return a tombstone only with
  // includeDeleted, inside a transaction too.
  {
    name: 'transaction: get and list return a tombstone only with includeDeleted',
    covers: ['DataStore.transaction', 'Repository.get', 'Repository.list'],
    async run(ctx) {
      const loan = await loansOf(ctx).create(sampleLoan());
      const deleted = await loansOf(ctx).delete(loan.id);
      const reads = await ctx.store.transaction(async (tx) => [
        await tx.loans.get(loan.id),
        await tx.loans.get(loan.id, { includeDeleted: true }),
        await tx.loans.list(),
        await tx.loans.list({ includeDeleted: true }),
      ]);
      expect(reads).toEqual([undefined, deleted, [], [deleted]]);
    },
  },
  // ports.ts (SettingsRepository and DataStoreTransaction): a transaction's repositories are the same settings
  // interface, so a get after a save in the same transaction returns what was saved, as at store level (the first case
  // of this group pins it for records).
  {
    name: 'transaction: settings reads see what the same transaction saved',
    covers: [
      'DataStore.transaction',
      'SettingsRepository.getSynced',
      'SettingsRepository.saveSynced',
      'SettingsRepository.getDevice',
      'SettingsRepository.saveDevice',
    ],
    async run(ctx) {
      const seen = await ctx.store.transaction(async (tx) => {
        const before = [await tx.settings.getSynced(), await tx.settings.getDevice()];
        const synced = await tx.settings.saveSynced({
          activeScenarioByLoan: { [sequentialUuid(700)]: sequentialUuid(701) },
        });
        const device = await tx.settings.saveDevice({ theme: 'dark', driveSyncEnabled: false });
        const after = [await tx.settings.getSynced(), await tx.settings.getDevice()];
        return { before, synced, device, after };
      });
      expect(seen.before).toEqual([undefined, undefined]);
      expect(seen.after).toEqual([seen.synced, seen.device]);
      expect(await ctx.store.settings.getSynced()).toEqual(seen.synced);
      expect(await ctx.store.settings.getDevice()).toEqual(seen.device);
    },
  },
  // ports.ts (DataStoreTransaction): a transaction's repositories see the transaction's own writes, so update, list and
  // listByLoan work on records the same transaction created (the first case of this group pins get).
  {
    name: 'transaction: update, list and listByLoan see the records the same transaction wrote',
    covers: ['DataStore.transaction', 'Repository.update', 'Repository.list', 'LoanChildRepository.listByLoan'],
    async run(ctx) {
      const seen = await ctx.store.transaction(async (tx) => {
        const loan = await tx.loans.create(sampleLoan());
        const updated = await tx.loans.update({ ...sampleLoan(), id: loan.id, name: 'Casa B' });
        const payment = await tx.payments.create(samplePayment(loan.id));
        return { updated, payment, loans: await tx.loans.list(), payments: await tx.payments.listByLoan(loan.id) };
      });
      expect(seen.loans).toEqual([seen.updated]);
      expect(seen.payments).toEqual([seen.payment]);
    },
  },
  // ports.ts (ChangeEvent.entities and DataStore): one notification per transaction, naming each touched collection
  // once, in ENTITY_KEYS order whatever the order of the writes.
  {
    name: 'transaction: the notification names each touched collection once, in ENTITY_KEYS order',
    covers: ['DataStore.transaction', 'DataStore.subscribe'],
    async run(ctx) {
      const loan = await loansOf(ctx).create(sampleLoan());
      await ctx.settle();
      const events: ChangeEvent[] = [];
      ctx.store.subscribe(record(events));
      await ctx.store.transaction(async (tx) => {
        await tx.payments.create(samplePayment(loan.id));
        await tx.loans.update({ ...sampleLoan(), id: loan.id, name: 'Casa B' });
        await tx.payments.create(samplePayment(loan.id));
      });
      await vi.waitFor(() => {
        expect(events).toHaveLength(1);
      });
      await ctx.settle();
      expect(events).toEqual([{ entities: ['loans', 'payments'], origin: 'write' }]);
    },
  },
  // ports.ts (DataStore): writes and transactions are serialized, so a transaction never interleaves with another write
  // or transaction and concurrent calls lose nothing. The port does not promise the order of the calls, so the case
  // asserts the set of records and their distinct stamps, never who ran first.
  {
    name: 'transaction: concurrent transactions and single writes run one at a time and lose nothing',
    covers: ['DataStore.transaction', 'Repository.create', 'Repository.list'],
    async run(ctx) {
      ctx.clock.set('2026-10-04T16:00:00.000Z');
      const created = await Promise.all([
        ctx.store.transaction((tx) => tx.loans.create(sampleLoan())),
        ctx.store.transaction((tx) => tx.loans.create({ ...sampleLoan(), name: 'Casa B' })),
        loansOf(ctx).create({ ...sampleLoan(), name: 'Casa C' }),
      ]);
      expect((await ctx.store.loans.list()).map((l) => l.id).sort()).toEqual(created.map((l) => l.id).sort());
      expect(new Set(created.map((l) => l.updatedAt)).size).toBe(3);
    },
  },
];

const subscribeCases: ContractCase[] = [
  {
    name: 'subscribe: listeners run asynchronously after the write and stop after unsubscribe',
    covers: ['DataStore.subscribe'],
    async run(ctx) {
      const events: ChangeEvent[] = [];
      const unsubscribe = ctx.store.subscribe(record(events));
      const write = loansOf(ctx).create(sampleLoan());
      expect(events).toEqual([]);
      await write;
      await vi.waitFor(() => {
        expect(events).toEqual([{ entities: ['loans'], origin: 'write' }]);
      });
      unsubscribe();
      await loansOf(ctx).create(sampleLoan());
      await ctx.settle();
      expect(events).toHaveLength(1);
    },
  },
];

const datasetCases: ContractCase[] = [
  {
    name: 'exportAll: returns every collection with tombstones and both settings records, ordered and valid',
    covers: ['DataStore.exportAll'],
    async run(ctx) {
      const loanId = await newLoanId(ctx);
      await ctx.store.events.create(sampleEvent(loanId));
      await ctx.store.reportedBalances.create(sampleReportedBalance(loanId));
      const payment = await ctx.store.payments.create(samplePayment(loanId));
      await ctx.store.scenarios.create(sampleScenario(loanId));
      await ctx.store.settings.saveSynced({ activeScenarioByLoan: {} });
      await ctx.store.settings.saveDevice({ theme: 'dark', driveSyncEnabled: false });
      await ctx.store.payments.delete(payment.id);
      const data = await ctx.store.exportAll();
      expect(backupDataSchema.safeParse(data).success).toBe(true);
      expect(Object.keys(data).sort()).toEqual([...ENTITY_KEYS].sort());
      expect(data.payments).toHaveLength(1);
      expect(data.payments[0]?.deletedAt).not.toBeNull();
      expect(data.settings.map((settings) => settings.scope).sort()).toEqual(['device', 'synced']);
      for (const key of ENTITY_KEYS) {
        expect(isOrdered(data[key])).toBe(true);
      }
    },
  },
  {
    name: 'replaceAll: replaces every record keeping stamps, keeps the local device settings and notifies once',
    covers: ['DataStore.replaceAll', 'DataStore.exportAll', 'DataStore.subscribe'],
    async run(ctx) {
      await newLoanId(ctx);
      const localDevice = await ctx.store.settings.saveDevice({ theme: 'dark', driveSyncEnabled: false });
      await ctx.settle();
      const events: ChangeEvent[] = [];
      ctx.store.subscribe(record(events));
      const incoming = foreignDataset();
      await ctx.store.replaceAll(incoming, { pending: 'keep', backedUpAt: 'keep' });
      const data = await ctx.store.exportAll();
      expect(data.loans).toEqual(incoming.loans);
      expect(data.events).toEqual(incoming.events);
      expect(data.settings).toEqual([incoming.settings[0], localDevice]);
      await vi.waitFor(() => {
        expect(events).toHaveLength(1);
      });
      expect(events[0]).toEqual({ entities: [...ENTITY_KEYS], origin: 'replaceAll' });
    },
  },
  // ports.ts (DataStore.replaceAll) and ADR-0007 decision 6: the incoming device settings are never imported, not
  // even into a store that has no device settings record yet (restoring onto a fresh install must not adopt another
  // device's theme).
  {
    name: 'replaceAll: incoming device settings are ignored even when the store has no device settings record',
    covers: ['DataStore.replaceAll', 'DataStore.exportAll', 'SettingsRepository.getDevice'],
    async run(ctx) {
      await ctx.store.replaceAll(foreignDataset(), { pending: 'keep', backedUpAt: 'keep' });
      expect(await ctx.store.settings.getDevice()).toBeUndefined();
      expect((await ctx.store.exportAll()).settings.map((settings) => settings.scope)).toEqual(['synced']);
    },
  },
  // ports.ts (Repository and DataStore.replaceAll): replaceAll keeps the records it is given, so it must copy them;
  // later edits of the caller's dataset, nested values included, never reach the store.
  {
    name: 'replaceAll: the imported dataset is copied, so later edits of the caller object never reach the store',
    covers: ['DataStore.replaceAll', 'DataStore.exportAll'],
    async run(ctx) {
      const incoming = foreignDataset();
      await ctx.store.replaceAll(incoming, { pending: 'keep', backedUpAt: 'keep' });
      const before = structuredClone(await ctx.store.exportAll());
      scribble(incoming);
      expect(await ctx.store.exportAll()).toEqual(before);
    },
  },
  {
    name: 'replaceAll: invalid data is rejected with RecordValidationError and nothing changes',
    covers: ['DataStore.replaceAll'],
    async run(ctx) {
      await newLoanId(ctx);
      const before = await ctx.store.exportAll();
      const incoming = foreignDataset();
      const broken = {
        ...incoming,
        loans: [{ ...(incoming.loans[0] as AnyRecord), principal: 500000 }],
      } as unknown as BackupData;
      await expectRejection(
        ctx.store.replaceAll(broken, { pending: 'all', backedUpAt: '2026-10-04T17:00:00.000Z' }),
        RecordValidationError,
        validationPayload('dataset'),
      );
      expect(await ctx.store.exportAll()).toEqual(before);
      expect((await ctx.store.getMeta()).lastBackupAt).toBeNull();
    },
  },
  {
    name: "replaceAll: pending 'all' and a backedUpAt instant set the import counters; lastSyncAt is unchanged",
    covers: ['DataStore.replaceAll', 'DataStore.pendingChanges', 'DataStore.changesSinceBackup', 'DataStore.getMeta'],
    async run(ctx) {
      await newLoanId(ctx);
      await ctx.store.markSynced('2026-10-01T10:00:00.000Z');
      await newLoanId(ctx);
      await ctx.store.replaceAll(foreignDataset(), { pending: 'all', backedUpAt: '2026-09-30T08:00:00.000Z' });
      expect(await ctx.store.pendingChanges()).toBe(4);
      expect(await ctx.store.changesSinceBackup()).toBe(0);
      const meta = await ctx.store.getMeta();
      expect(meta.lastBackupAt).toBe('2026-09-30T08:00:00.000Z');
      expect(meta.lastSyncAt).toBe('2026-10-01T10:00:00.000Z');
    },
  },
  {
    name: "replaceAll: 'keep' leaves pendingChanges, changesSinceBackup and lastBackupAt untouched",
    covers: ['DataStore.replaceAll', 'DataStore.markBackedUp'],
    async run(ctx) {
      await newLoanId(ctx);
      await newLoanId(ctx);
      await ctx.store.markBackedUp('2026-10-02T10:00:00.000Z');
      await newLoanId(ctx);
      await ctx.store.replaceAll(foreignDataset(), { pending: 'keep', backedUpAt: 'keep' });
      expect(await ctx.store.pendingChanges()).toBe(3);
      expect(await ctx.store.changesSinceBackup()).toBe(1);
      expect((await ctx.store.getMeta()).lastBackupAt).toBe('2026-10-02T10:00:00.000Z');
    },
  },
  // ports.ts (ReplaceAllOptions): the two options act independently, so each mixed combination is pinned on its own.
  {
    name: "replaceAll: pending 'all' with backedUpAt 'keep' marks every record pending and leaves the backup state alone",
    covers: [
      'DataStore.replaceAll',
      'DataStore.pendingChanges',
      'DataStore.changesSinceBackup',
      'DataStore.markBackedUp',
    ],
    async run(ctx) {
      await newLoanId(ctx);
      await ctx.store.markBackedUp('2026-10-02T10:00:00.000Z');
      await newLoanId(ctx);
      await ctx.store.replaceAll(foreignDataset(), { pending: 'all', backedUpAt: 'keep' });
      expect(await ctx.store.pendingChanges()).toBe(4);
      expect(await ctx.store.changesSinceBackup()).toBe(1);
      expect((await ctx.store.getMeta()).lastBackupAt).toBe('2026-10-02T10:00:00.000Z');
    },
  },
  {
    name: "replaceAll: pending 'keep' with a backedUpAt instant leaves the pending set alone and resets the backup state",
    covers: [
      'DataStore.replaceAll',
      'DataStore.pendingChanges',
      'DataStore.changesSinceBackup',
      'DataStore.markSynced',
    ],
    async run(ctx) {
      await newLoanId(ctx);
      await newLoanId(ctx);
      await ctx.store.markSynced('2026-10-01T10:00:00.000Z');
      await newLoanId(ctx);
      await ctx.store.replaceAll(foreignDataset(), { pending: 'keep', backedUpAt: '2026-09-30T08:00:00.000Z' });
      expect(await ctx.store.pendingChanges()).toBe(1);
      expect(await ctx.store.changesSinceBackup()).toBe(0);
      const meta = await ctx.store.getMeta();
      expect(meta.lastBackupAt).toBe('2026-09-30T08:00:00.000Z');
      expect(meta.lastSyncAt).toBe('2026-10-01T10:00:00.000Z');
    },
  },
];

const snapshotCases: ContractCase[] = [
  {
    name: 'snapshots: restore brings back records, counters, lastSyncAt and lastBackupAt exactly, then forgets the snapshot',
    covers: ['DataStore.createSnapshot', 'DataStore.restoreSnapshot', 'DataStore.subscribe'],
    async run(ctx) {
      const loanId = await newLoanId(ctx);
      await ctx.store.markSynced('2026-10-01T10:00:00.000Z');
      await ctx.store.payments.create(samplePayment(loanId));
      await ctx.store.markBackedUp('2026-10-02T10:00:00.000Z');
      await ctx.store.events.create(sampleEvent(loanId));
      await ctx.store.settings.saveDevice({ theme: 'dark', driveSyncEnabled: false });
      const before = {
        data: await ctx.store.exportAll(),
        pending: await ctx.store.pendingChanges(),
        sinceBackup: await ctx.store.changesSinceBackup(),
        meta: await ctx.store.getMeta(),
      };
      const snapshot = await ctx.store.createSnapshot();
      await ctx.store.replaceAll(foreignDataset(), { pending: 'all', backedUpAt: '2026-10-03T10:00:00.000Z' });
      await ctx.store.markSynced('2026-10-04T10:00:00.000Z');
      await ctx.settle();
      const events: ChangeEvent[] = [];
      ctx.store.subscribe(record(events));
      await ctx.store.restoreSnapshot(snapshot);
      expect({
        data: await ctx.store.exportAll(),
        pending: await ctx.store.pendingChanges(),
        sinceBackup: await ctx.store.changesSinceBackup(),
        meta: await ctx.store.getMeta(),
      }).toEqual(before);
      await vi.waitFor(() => {
        expect(events).toEqual([{ entities: [...ENTITY_KEYS], origin: 'restoreSnapshot' }]);
      });
      await expectRejection(ctx.store.restoreSnapshot(snapshot), SnapshotNotFoundError, snapshotPayload(snapshot));
    },
  },
  {
    name: 'snapshots: discard forgets a snapshot and ignores unknown ids',
    covers: ['DataStore.discardSnapshot', 'DataStore.restoreSnapshot'],
    async run(ctx) {
      const snapshot = await ctx.store.createSnapshot();
      await ctx.store.discardSnapshot(snapshot);
      await expectRejection(ctx.store.restoreSnapshot(snapshot), SnapshotNotFoundError, snapshotPayload(snapshot));
      await expect(ctx.store.discardSnapshot('unknown-snapshot')).resolves.toBeUndefined();
    },
  },
];

const counterCases: ContractCase[] = [
  {
    name: 'pendingChanges: counts distinct records written since markSynced, which resets it and sets lastSyncAt',
    covers: ['DataStore.pendingChanges', 'DataStore.markSynced', 'DataStore.getMeta'],
    async run(ctx) {
      const loan = await loansOf(ctx).create(sampleLoan());
      await loansOf(ctx).update({ ...sampleLoan(), id: loan.id, name: 'Casa B' });
      const event = await ctx.store.events.create(sampleEvent(loan.id));
      await ctx.store.events.delete(event.id);
      expect(await ctx.store.pendingChanges()).toBe(2);
      await ctx.store.markSynced('2026-10-04T18:00:00.000Z');
      expect(await ctx.store.pendingChanges()).toBe(0);
      expect((await ctx.store.getMeta()).lastSyncAt).toBe('2026-10-04T18:00:00.000Z');
      expect(await ctx.store.changesSinceBackup()).toBe(2);
    },
  },
  {
    name: 'changesSinceBackup: counts distinct records written since markBackedUp, which resets it and sets lastBackupAt',
    covers: ['DataStore.changesSinceBackup', 'DataStore.markBackedUp', 'DataStore.getMeta'],
    async run(ctx) {
      const loan = await loansOf(ctx).create(sampleLoan());
      await ctx.store.scenarios.create(sampleScenario(loan.id));
      expect(await ctx.store.changesSinceBackup()).toBe(2);
      await ctx.store.markBackedUp('2026-10-04T18:00:00.000Z');
      expect(await ctx.store.changesSinceBackup()).toBe(0);
      expect((await ctx.store.getMeta()).lastBackupAt).toBe('2026-10-04T18:00:00.000Z');
      expect(await ctx.store.pendingChanges()).toBe(2);
    },
  },
];

const lifecycleCases: ContractCase[] = [
  {
    name: 'getMeta: a fresh store has a stable uuid deviceId from IdGenerator.newId and null instants',
    covers: ['DataStore.getMeta', 'IdGenerator.newId'],
    async run(ctx) {
      // ports.ts (DataStoreMeta.deviceId): the device id is drawn exactly once, when the store is created and before
      // any other id.
      expect(ctx.ids.issued).toHaveLength(1);
      const meta = await ctx.store.getMeta();
      expect(uuidSchema.safeParse(meta.deviceId).success).toBe(true);
      expect(ctx.ids.issued).toEqual([meta.deviceId]);
      expect(meta.lastSyncAt).toBeNull();
      expect(meta.lastBackupAt).toBeNull();
      expect(await ctx.store.getMeta()).toEqual(meta);
    },
  },
  {
    name: "close: is idempotent and afterwards every call rejects with PersistenceError code 'CLOSED'",
    covers: ['DataStore.close'],
    async run(ctx) {
      await ctx.store.close();
      await ctx.store.close();
      const missingId = sequentialUuid(999);
      // ports.ts (DataStore.close): every call rejects, so every method is swept; only subscribe is left out, because
      // the port does not say whether it throws or rejects after close().
      const calls: [string, () => Promise<unknown>][] = [
        ['loans.get', () => ctx.store.loans.get(missingId)],
        ['loans.list', () => ctx.store.loans.list()],
        ['loans.create', () => loansOf(ctx).create(sampleLoan())],
        ['loans.update', () => loansOf(ctx).update({ ...sampleLoan(), id: missingId })],
        ['loans.delete', () => ctx.store.loans.delete(missingId)],
        ['events.listByLoan', () => ctx.store.events.listByLoan(missingId)],
        ['settings.getSynced', () => ctx.store.settings.getSynced()],
        ['settings.saveSynced', () => ctx.store.settings.saveSynced({ activeScenarioByLoan: {} })],
        ['settings.getDevice', () => ctx.store.settings.getDevice()],
        ['settings.saveDevice', () => ctx.store.settings.saveDevice({ theme: 'dark', driveSyncEnabled: false })],
        ['transaction', () => ctx.store.transaction(async () => undefined)],
        ['exportAll', () => ctx.store.exportAll()],
        ['replaceAll', () => ctx.store.replaceAll(foreignDataset(), { pending: 'keep', backedUpAt: 'keep' })],
        ['createSnapshot', () => ctx.store.createSnapshot()],
        ['restoreSnapshot', () => ctx.store.restoreSnapshot('snapshot-1')],
        ['discardSnapshot', () => ctx.store.discardSnapshot('snapshot-1')],
        ['pendingChanges', () => ctx.store.pendingChanges()],
        ['markSynced', () => ctx.store.markSynced('2026-10-04T18:00:00.000Z')],
        ['changesSinceBackup', () => ctx.store.changesSinceBackup()],
        ['markBackedUp', () => ctx.store.markBackedUp('2026-10-04T18:00:00.000Z')],
        ['getMeta', () => ctx.store.getMeta()],
      ];
      for (const [name, call] of calls) {
        await expect(call(), name).rejects.toMatchObject({ code: 'CLOSED' });
      }
    },
  },
];

/** A DataStore is the only DataStoreRepositories that can open a transaction. */
function isDataStore(repositories: DataStoreRepositories): repositories is DataStore {
  return 'transaction' in repositories;
}

/**
 * Descriptor whose repository makes every call through a one-call transaction:
 * `store.transaction((tx) => descriptor.repo(tx).<method>(...))`. The per-collection cases always hand the DataStore
 * itself to `descriptor.repo`, which is what lets this wrapper open the transactions.
 */
function viaTransaction(descriptor: EntityDescriptor): EntityDescriptor {
  return {
    ...descriptor,
    repo(repositories: DataStoreRepositories): UntypedRepository {
      if (!isDataStore(repositories)) {
        throw new Error('The transaction battery needs the DataStore itself to open its transactions');
      }
      const inTransaction = <R>(call: (repo: UntypedRepository) => Promise<R>): Promise<R> =>
        repositories.transaction((tx) => call(descriptor.repo(tx)));
      const proxy: UntypedRepository = {
        get: (id, options) => inTransaction((repo) => repo.get(id, options)),
        list: (options) => inTransaction((repo) => repo.list(options)),
        create: (input) => inTransaction((repo) => repo.create(input)),
        update: (input) => inTransaction((repo) => repo.update(input)),
        delete: (id) => inTransaction((repo) => repo.delete(id)),
      };
      if (descriptor.isLoanChild) {
        proxy.listByLoan = (loanId, options) =>
          inTransaction((repo) => {
            if (repo.listByLoan === undefined) {
              throw new Error('A loan child repository must have listByLoan');
            }
            return repo.listByLoan(loanId, options);
          });
      }
      return proxy;
    },
  };
}

/** A case of the transaction battery: the same body, named for how the repositories are reached. */
function throughTransaction(contractCase: ContractCase): ContractCase {
  return {
    ...contractCase,
    name: `through a transaction: ${contractCase.name}`,
    covers: [...contractCase.covers, 'DataStore.transaction'],
  };
}

/**
 * The transaction battery: the per-collection cases (`entityCases`, `childCases`) run a second time with every
 * repository call made through a one-call transaction.
 *
 * Why the same rules apply: ports.ts (DataStoreTransaction) types a transaction's repositories as
 * DataStoreRepositories, the same interfaces as the store's, and says in words that they follow every rule of the
 * store-level repositories (validation, stamps, tombstones, ordering, copies, settings) and see the transaction's own
 * writes.
 *
 * The subset, chosen by semantics: a case belongs to the battery when its outcome is identical however the
 * repository is reached. A one-call transaction behaves like a single write: it commits, counts and notifies once
 * after commit (ports.ts, DataStore.transaction). Notification delivery is the exception, because the port leaves open
 * what a read-only or one-call transaction delivers (ports.ts, DataStore, says listeners run "once per committed write
 * or transaction"), so the one case that listens for notifications drops that assertion here and keeps it at store
 * level. What is not per-collection repository behaviour is outside the battery: counters, snapshots, replaceAll and
 * settings have their own cases, and the hand-written `transaction` cases cover what one-call transactions cannot
 * (several writes in one transaction, records stamped by another device, read-your-writes, isolation and
 * serialization, notifications).
 */
const TRANSACTION_BATTERY: readonly ContractCase[] = [
  ...ENTITY_DESCRIPTORS.map(viaTransaction).flatMap((descriptor) => entityCases(descriptor, false)),
  ...ENTITY_DESCRIPTORS.filter((descriptor) => descriptor.isLoanChild)
    .map(viaTransaction)
    .flatMap(childCases),
].map(throughTransaction);

/** The frozen contract. Adapters run it through runDataStoreContract and never edit it. */
export const CONTRACT_CASES: readonly ContractCase[] = [
  ...ENTITY_DESCRIPTORS.flatMap((descriptor) => entityCases(descriptor, true)),
  ...ENTITY_DESCRIPTORS.filter((descriptor) => descriptor.isLoanChild).flatMap(childCases),
  ...settingsCases,
  ...stampCases,
  ...transactionCases,
  ...TRANSACTION_BATTERY,
  ...subscribeCases,
  ...datasetCases,
  ...snapshotCases,
  ...counterCases,
  ...lifecycleCases,
];
