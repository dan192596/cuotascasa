import { TestBed } from '@angular/core/testing';
import { type DataStore, SnapshotNotFoundError } from '@cuotascasa/persistence';
import {
  createManualClock,
  createSequentialIds,
  type ManualClock,
  sampleEvent,
  sampleLoan,
  samplePayment,
  sampleReportedBalance,
  sampleScenario,
} from '@cuotascasa/persistence/contract';
import { createInMemoryDataStore } from '@cuotascasa/persistence/memory';
import type { BackupData } from '@cuotascasa/schema';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BackupImportError, BackupService, PendingImport, StorageHealth } from '../api.ts';
import { CLOCK, DATA_STORE, ID_GENERATOR } from '../data-layer.tokens.ts';
import { provideStores } from '../stores/provide-stores.ts';
import { BACKUP_SERVICE, LOANS_STORE, STORAGE_HEALTH } from '../tokens.ts';
import { PENDING_WINDOW_MS, provideBackup, UNDO_WINDOW_MS } from './provide-backup.ts';

const ITERATIONS = 1000;
const PASSPHRASE = 'frase de prueba ñandú';
const HEALTH: StorageHealth = {
  persisted: (() => null) as unknown as StorageHealth['persisted'],
  estimate: (() => null) as unknown as StorageHealth['estimate'],
  safariNonStandalone: (() => false) as unknown as StorageHealth['safariNonStandalone'],
  requestPersist: () => Promise.resolve(true),
};

interface World {
  readonly store: DataStore;
  readonly clock: ManualClock;
  readonly backup: BackupService;
}

async function world(deviceId?: string): Promise<World> {
  const clock = createManualClock();
  const ids = createSequentialIds();
  if (deviceId !== undefined) {
    ids.script([deviceId]);
  }
  const store = await createInMemoryDataStore({ clock, ids });
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: DATA_STORE, useValue: Promise.resolve(store) },
      { provide: CLOCK, useValue: clock },
      { provide: ID_GENERATOR, useValue: ids },
      { provide: STORAGE_HEALTH, useValue: HEALTH },
      provideStores(),
      provideBackup({ kdfIterations: ITERATIONS, minIterations: ITERATIONS }),
    ],
  });
  const backup = TestBed.inject(BACKUP_SERVICE);
  await vi.waitFor(() => expect(backup.changesSinceBackup()).toBe(0));
  return { store, clock, backup };
}

/** A loan with one record in every child collection, one tombstone and both settings scopes. */
async function seed(store: DataStore, theme: 'light' | 'dark' = 'light'): Promise<void> {
  const loan = await store.loans.create(sampleLoan());
  const event = await store.events.create(sampleEvent(loan.id));
  await store.reportedBalances.create(sampleReportedBalance(loan.id));
  await store.payments.create(samplePayment(loan.id));
  await store.scenarios.create(sampleScenario(loan.id));
  await store.events.delete(event.id);
  await store.settings.saveSynced({ activeScenarioByLoan: {} });
  await store.settings.saveDevice({ theme, driveSyncEnabled: true });
}

function withoutDeviceSettings(data: BackupData): BackupData {
  return { ...data, settings: data.settings.filter((record) => record.scope !== 'device') };
}

function must<T>(
  result: { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: unknown },
): T {
  if (!result.ok) {
    throw new Error('Expected a successful result');
  }
  return result.value;
}

function failure(
  result: { readonly ok: true } | { readonly ok: false; readonly error: BackupImportError },
): BackupImportError {
  if (result.ok) {
    throw new Error('Expected a failure');
  }
  return result.error;
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 15));
const file = (text: string): Blob => new Blob([text], { type: 'application/json' });

afterEach(() => {
  vi.useRealTimers();
});

describe('exportJson', () => {
  it('names the file by date and leaves lastBackupAt and changesSinceBackup unchanged (W9-01)', async () => {
    const { store, backup, clock } = await world();
    await seed(store);
    await vi.waitFor(() => expect(backup.changesSinceBackup()).toBeGreaterThan(0));
    const changes = backup.changesSinceBackup();
    const result = await backup.exportJson();
    expect(result.fileName).toBe('cuotascasa-respaldo-2026-10-04.json');
    expect(result.encrypted).toBe(false);
    const parsed = JSON.parse(await result.blob.text()) as { format: string; exportedAt: string };
    expect(parsed.format).toBe('cuotascasa');
    expect(parsed.exportedAt).toBe(clock.now());
    await settle();
    expect(backup.lastBackupAt()).toBeNull();
    expect(backup.changesSinceBackup()).toBe(changes);
    expect((await store.getMeta()).lastBackupAt).toBeNull();
    expect(await store.changesSinceBackup()).toBe(changes);
  });

  it('leaves an earlier backup mark in place when exporting again', async () => {
    const { store, backup, clock } = await world();
    await backup.markExported(await backup.exportJson());
    const first = backup.lastBackupAt();
    expect(first).not.toBeNull();
    await store.loans.create(sampleLoan());
    await vi.waitFor(() => expect(backup.changesSinceBackup()).toBe(1));
    clock.advance(60_000);
    await backup.exportJson({ passphrase: PASSPHRASE });
    await settle();
    expect(backup.lastBackupAt()).toBe(first);
    expect(backup.changesSinceBackup()).toBe(1);
  });

  it('rejects an empty passphrase instead of exporting in the clear', async () => {
    const { backup } = await world();
    await expect(backup.exportJson({ passphrase: '' })).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});

describe('round trip', () => {
  it('imports into an empty store with an identical exportAll (ignoring device settings)', async () => {
    const a = await world();
    await seed(a.store);
    const exported = await a.backup.exportJson();
    const b = await world();
    const pending = must(await b.backup.previewImport(exported.blob));
    expect(pending.encrypted).toBe(false);
    expect(pending.preview.counts.events).toEqual({ active: 0, tombstoned: 1 });
    expect(pending.preview.counts.loans).toEqual({ active: 1, tombstoned: 0 });
    await b.backup.confirmImport(pending.id);
    expect(withoutDeviceSettings(await b.store.exportAll())).toEqual(withoutDeviceSettings(await a.store.exportAll()));
  });

  it('refreshes the signal stores through the DataStore notification', async () => {
    const a = await world();
    await seed(a.store);
    const exported = await a.backup.exportJson();
    const b = await world();
    const loans = TestBed.inject(LOANS_STORE);
    await vi.waitFor(() => expect(loans.ready()).toBe(true));
    expect(loans.loans()).toHaveLength(0);
    await b.backup.confirmImport(must(await b.backup.previewImport(exported.blob)).id);
    await vi.waitFor(() => expect(loans.loans()).toHaveLength(1));
  });

  it('keeps every stamp and never imports the device settings or the deviceId', async () => {
    const a = await world();
    await seed(a.store, 'light');
    const source = await a.store.exportAll();
    const exported = await a.backup.exportJson();
    const b = await world('d0000000-0000-4000-8000-0000000000b2');
    await b.store.settings.saveDevice({ theme: 'dark', driveSyncEnabled: false });
    const deviceBefore = (await b.store.getMeta()).deviceId;
    const deviceSettingsBefore = await b.store.settings.getDevice();
    await b.backup.confirmImport(must(await b.backup.previewImport(exported.blob)).id);
    const after = await b.store.exportAll();
    for (const key of ['loans', 'events', 'reportedBalances', 'payments', 'scenarios'] as const) {
      expect(after[key]).toEqual(source[key]);
    }
    expect(after.settings.find((record) => record.scope === 'synced')).toEqual(
      source.settings.find((record) => record.scope === 'synced'),
    );
    expect(await b.store.settings.getDevice()).toEqual(deviceSettingsBefore);
    expect((await b.store.getMeta()).deviceId).toBe(deviceBefore);
    expect(deviceBefore).not.toBe((await a.store.getMeta()).deviceId);
  });
});

describe('invalid files', () => {
  const bad: readonly (readonly [string, string, string])[] = [
    ['not JSON', 'SENTINEL-77 {oops', 'INVALID_JSON'],
    ['another format', JSON.stringify({ format: 'SENTINEL-77' }), 'FOREIGN_FORMAT'],
    ['a future version', JSON.stringify({ format: 'cuotascasa', version: 99 }), 'FUTURE_VERSION'],
    ['an unregistered version', JSON.stringify({ format: 'cuotascasa', version: 0 }), 'UNSUPPORTED_VERSION'],
    ['an invalid structure', JSON.stringify({ format: 'cuotascasa', version: 1, SENTINEL: 77 }), 'VALIDATION'],
  ];

  it.each(bad)('%s gives a typed Spanish error and leaves the store untouched', async (_name, text, code) => {
    const { store, backup } = await world();
    await seed(store);
    const before = await store.exportAll();
    const pendingBefore = await store.pendingChanges();
    const error = failure(await backup.previewImport(file(text)));
    expect(error.code).toBe(code);
    expect(error.message).toMatch(/[a-záéíóú]/i);
    expect(error.message).not.toContain('SENTINEL');
    expect(error.message).not.toContain('oops');
    expect(await store.exportAll()).toEqual(before);
    expect(await store.pendingChanges()).toBe(pendingBefore);
  });

  it('gives a distinct message for every code', async () => {
    const { backup } = await world();
    const messages = new Set<string>();
    for (const [, text] of bad) {
      messages.add(failure(await backup.previewImport(file(text))).message);
    }
    expect(messages.size).toBe(bad.length);
  });

  it('confirming an unknown or cancelled import is a typed NOT_FOUND', async () => {
    const a = await world();
    const exported = await a.backup.exportJson();
    const pending = must(await a.backup.previewImport(exported.blob));
    a.backup.cancelImport(pending.id);
    await expect(a.backup.confirmImport(pending.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(a.backup.confirmImport('nope')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('counters and undo', () => {
  async function prepared() {
    const a = await world();
    await seed(a.store);
    const exported = await a.backup.exportJson({});
    const b = await world();
    await b.store.loans.create(sampleLoan());
    await b.store.markSynced('2026-10-01T00:00:00.000Z');
    await b.store.markBackedUp('2026-09-01T00:00:00.000Z');
    b.clock.advance(1000);
    await b.store.loans.create({ ...sampleLoan(), name: 'Casa B' });
    const source = await a.store.exportAll();
    const total = (['loans', 'events', 'reportedBalances', 'payments', 'scenarios'] as const).reduce(
      (sum, key) => sum + source[key].length,
      1,
    );
    const document = JSON.parse(await exported.blob.text()) as { exportedAt: string };
    await settle();
    return { b, exported, total, exportedAt: document.exportedAt };
  }

  it('follows ADR-0007 decision 6 after importing', async () => {
    const { b, exported, total, exportedAt } = await prepared();
    const lastSyncAt = (await b.store.getMeta()).lastSyncAt;
    await b.backup.confirmImport(must(await b.backup.previewImport(exported.blob)).id);
    expect(await b.store.pendingChanges()).toBe(total);
    expect(await b.store.changesSinceBackup()).toBe(0);
    expect((await b.store.getMeta()).lastBackupAt).toBe(exportedAt);
    expect((await b.store.getMeta()).lastSyncAt).toBe(lastSyncAt);
    expect(b.backup.lastBackupAt()).toBe(exportedAt);
    expect(b.backup.changesSinceBackup()).toBe(0);
  });

  it('undo restores the exact state, pendingChanges, changesSinceBackup and lastBackupAt', async () => {
    const { b, exported } = await prepared();
    const state = async () => ({
      data: await b.store.exportAll(),
      pending: await b.store.pendingChanges(),
      since: await b.store.changesSinceBackup(),
      meta: await b.store.getMeta(),
    });
    const before = await state();
    expect(before.since).toBeGreaterThan(0);
    const receipt = await b.backup.confirmImport(must(await b.backup.previewImport(exported.blob)).id);
    expect(await state()).not.toEqual(before);
    await b.backup.undoImport(receipt.undoToken);
    expect(await state()).toEqual(before);
    await vi.waitFor(() => expect(b.backup.changesSinceBackup()).toBe(before.since));
    expect(b.backup.lastBackupAt()).toBe(before.meta.lastBackupAt);
    await expect(b.backup.undoImport(receipt.undoToken)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('discards the snapshot after the next write', async () => {
    const { b, exported } = await prepared();
    const receipt = await b.backup.confirmImport(must(await b.backup.previewImport(exported.blob)).id);
    await b.store.loans.create(sampleLoan());
    await vi.waitFor(async () => {
      await expect(b.backup.undoImport(receipt.undoToken)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  it('keeps the snapshot until the own notification only (no write)', async () => {
    const { b, exported } = await prepared();
    const receipt = await b.backup.confirmImport(must(await b.backup.previewImport(exported.blob)).id);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await expect(b.backup.undoImport(receipt.undoToken)).resolves.toBeUndefined();
  });

  it('discards the snapshot after 10 minutes', async () => {
    const { b, exported } = await prepared();
    const pending = must(await b.backup.previewImport(exported.blob));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const receipt = await b.backup.confirmImport(pending.id);
    await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS - 1);
    // Still inside the window: the token is alive (not consumed here, so check with a wrong token only).
    await expect(b.backup.undoImport('wrong')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await vi.advanceTimersByTimeAsync(2);
    await expect(b.backup.undoImport(receipt.undoToken)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('a sync-style replaceAll after the import invalidates the undo', async () => {
    const { b, exported } = await prepared();
    const receipt = await b.backup.confirmImport(must(await b.backup.previewImport(exported.blob)).id);
    await settle();
    await b.store.replaceAll(await b.store.exportAll(), { pending: 'keep', backedUpAt: 'keep' });
    await settle();
    await expect(b.backup.undoImport(receipt.undoToken)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('a markSynced after the import blocks an immediate undo (fingerprint)', async () => {
    const { b, exported } = await prepared();
    const receipt = await b.backup.confirmImport(must(await b.backup.previewImport(exported.blob)).id);
    await b.store.markSynced('2026-10-05T00:00:00.000Z');
    await expect(b.backup.undoImport(receipt.undoToken)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('a write followed by an immediate undo is NOT_FOUND', async () => {
    const { b, exported } = await prepared();
    const receipt = await b.backup.confirmImport(must(await b.backup.previewImport(exported.blob)).id);
    await settle();
    await b.store.loans.create(sampleLoan());
    await expect(b.backup.undoImport(receipt.undoToken)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('another import or undo arriving as replaceAll/restoreSnapshot invalidates the undo', async () => {
    const { b, exported } = await prepared();
    const receipt = await b.backup.confirmImport(must(await b.backup.previewImport(exported.blob)).id);
    await settle();
    const snapshot = await b.store.createSnapshot();
    await b.store.restoreSnapshot(snapshot);
    await settle();
    await expect(b.backup.undoImport(receipt.undoToken)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('a keep/keep replaceAll followed by an immediate undo is NOT_FOUND (content digest)', async () => {
    const { b, exported } = await prepared();
    const receipt = await b.backup.confirmImport(must(await b.backup.previewImport(exported.blob)).id);
    const data = await b.store.exportAll();
    const renamed = { ...data, loans: data.loans.map((loan) => ({ ...loan, name: 'Otro nombre' })) };
    await b.store.replaceAll(renamed, { pending: 'keep', backedUpAt: 'keep' });
    await expect(b.backup.undoImport(receipt.undoToken)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await b.store.exportAll()).loans.every((loan) => loan.name === 'Otro nombre')).toBe(true);
  });

  it('a saveDevice followed by an immediate undo is NOT_FOUND (content digest)', async () => {
    const { b, exported } = await prepared();
    const receipt = await b.backup.confirmImport(must(await b.backup.previewImport(exported.blob)).id);
    await b.store.settings.saveDevice({ theme: 'dark', driveSyncEnabled: true });
    await expect(b.backup.undoImport(receipt.undoToken)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await b.store.settings.getDevice())?.theme).toBe('dark');
  });

  it('SNAPSHOT_NOT_FOUND on restore drops the undo and is NOT_FOUND', async () => {
    const { b, exported } = await prepared();
    const receipt = await b.backup.confirmImport(must(await b.backup.previewImport(exported.blob)).id);
    await settle();
    vi.spyOn(b.store, 'restoreSnapshot').mockRejectedValueOnce(new SnapshotNotFoundError('gone'));
    await expect(b.backup.undoImport(receipt.undoToken)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(b.backup.undoImport(receipt.undoToken)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('queues concurrent confirms and leaves at most one live snapshot', async () => {
    const { b, exported } = await prepared();
    const created = vi.spyOn(b.store, 'createSnapshot');
    const discarded = vi.spyOn(b.store, 'discardSnapshot');
    const first = must(await b.backup.previewImport(exported.blob));
    const firstConfirm = b.backup.confirmImport(first.id);
    const second = must(await b.backup.previewImport(exported.blob));
    const secondConfirm = b.backup.confirmImport(second.id);
    const [one, two] = await Promise.all([firstConfirm, secondConfirm]);
    await settle();
    expect(created).toHaveBeenCalledTimes(2);
    expect(discarded).toHaveBeenCalledTimes(1);
    await expect(b.backup.undoImport(one.undoToken)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(b.backup.undoImport(two.undoToken)).resolves.toBeUndefined();
    const again = must(await b.backup.previewImport(exported.blob));
    const dupConfirm = b.backup.confirmImport(again.id);
    await expect(b.backup.confirmImport(again.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(dupConfirm).resolves.toBeDefined();
  });

  it('a write between the snapshot and replaceAll discards the snapshot', async () => {
    const { b, exported } = await prepared();
    const original = b.store.createSnapshot.bind(b.store);
    vi.spyOn(b.store, 'createSnapshot').mockImplementationOnce(async () => {
      const id = await original();
      await b.store.loans.create(sampleLoan());
      await settle();
      return id;
    });
    const discarded = vi.spyOn(b.store, 'discardSnapshot');
    const receipt = await b.backup.confirmImport(must(await b.backup.previewImport(exported.blob)).id);
    expect(discarded).toHaveBeenCalledTimes(1);
    await expect(b.backup.undoImport(receipt.undoToken)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('keeps the undo token when the restore fails, so it can be retried', async () => {
    const { b, exported } = await prepared();
    const receipt = await b.backup.confirmImport(must(await b.backup.previewImport(exported.blob)).id);
    await settle();
    vi.spyOn(b.store, 'restoreSnapshot').mockRejectedValueOnce(new Error('boom'));
    await expect(b.backup.undoImport(receipt.undoToken)).rejects.toMatchObject({ code: 'STORAGE' });
    await expect(b.backup.undoImport(receipt.undoToken)).resolves.toBeUndefined();
  });

  it('keeps one pending import: a new preview replaces the previous one', async () => {
    const { b, exported } = await prepared();
    const first = must(await b.backup.previewImport(exported.blob));
    const second = must(await b.backup.previewImport(exported.blob));
    await expect(b.backup.confirmImport(first.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(b.backup.confirmImport(second.id)).resolves.toBeDefined();
  });

  it('forgets the pending import after 10 minutes', async () => {
    const { b, exported } = await prepared();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const pending = must(await b.backup.previewImport(exported.blob));
    await vi.advanceTimersByTimeAsync(PENDING_WINDOW_MS + 1);
    await expect(b.backup.confirmImport(pending.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('a second import replaces the undo entry of the first', async () => {
    const { b, exported } = await prepared();
    const first = await b.backup.confirmImport(must(await b.backup.previewImport(exported.blob)).id);
    const second = await b.backup.confirmImport(must(await b.backup.previewImport(exported.blob)).id);
    await expect(b.backup.undoImport(first.undoToken)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(b.backup.undoImport(second.undoToken)).resolves.toBeUndefined();
  });
});

describe('encryption', () => {
  async function encrypted() {
    const a = await world();
    await seed(a.store);
    const exported = await a.backup.exportJson({ passphrase: PASSPHRASE });
    return { a, exported, text: await exported.blob.text() };
  }

  it('round-trips and leaves no plaintext in the Blob', async () => {
    const { a, exported, text } = await encrypted();
    expect(exported.encrypted).toBe(true);
    expect(text).not.toContain('Casa A');
    expect(text).not.toContain('Banco Ficticio');
    expect(JSON.parse(text)).toMatchObject({ format: 'cuotascasa-enc', v: 1 });
    const b = await world();
    const pending: PendingImport = must(await b.backup.previewImport(exported.blob, { passphrase: PASSPHRASE }));
    expect(pending.encrypted).toBe(true);
    await b.backup.confirmImport(pending.id);
    expect(withoutDeviceSettings(await b.store.exportAll())).toEqual(withoutDeviceSettings(await a.store.exportAll()));
  });

  it('asks for the passphrase and rejects a wrong one with typed errors', async () => {
    const { exported } = await encrypted();
    const b = await world();
    expect(failure(await b.backup.previewImport(exported.blob)).code).toBe('PASSPHRASE_REQUIRED');
    expect(failure(await b.backup.previewImport(exported.blob, { passphrase: '' })).code).toBe('PASSPHRASE_REQUIRED');
    const wrong = failure(await b.backup.previewImport(exported.blob, { passphrase: 'otra frase' }));
    expect(wrong.code).toBe('WRONG_PASSPHRASE');
    expect(wrong.message).not.toContain('otra frase');
    expect(await b.store.pendingChanges()).toBe(0);
  });

  it('treats a tampered ciphertext as a wrong passphrase', async () => {
    const { text } = await encrypted();
    const envelope = JSON.parse(text) as { ct: string };
    envelope.ct = `${envelope.ct.startsWith('A') ? 'B' : 'A'}${envelope.ct.slice(1)}`;
    const b = await world();
    const error = failure(await b.backup.previewImport(file(JSON.stringify(envelope)), { passphrase: PASSPHRASE }));
    expect(error.code).toBe('WRONG_PASSPHRASE');
  });

  it.each([
    [10_000_001, 'VALIDATION'],
    [2 ** 40, 'VALIDATION'],
    [ITERATIONS - 1, 'VALIDATION'],
    [0, 'VALIDATION'],
    [-5, 'VALIDATION'],
    [1.5, 'WRONG_PASSPHRASE'],
  ])('never derives with iterations %s (%s)', async (iterations, code) => {
    const { text } = await encrypted();
    const b = await world();
    const envelope = JSON.parse(text) as { kdf: { iterations: number } };
    envelope.kdf.iterations = iterations;
    const started = Date.now();
    const error = failure(await b.backup.previewImport(file(JSON.stringify(envelope)), { passphrase: PASSPHRASE }));
    expect(Date.now() - started).toBeLessThan(2000);
    expect(error.code).toBe(code);
  });

  it('decrypts a file that starts with a BOM', async () => {
    const { text } = await encrypted();
    const b = await world();
    const result = await b.backup.previewImport(file(`\uFEFF${text}`), { passphrase: PASSPHRASE });
    expect(must(result).encrypted).toBe(true);
  });

  it('maps an unknown envelope version to UNSUPPORTED_VERSION', async () => {
    const { text } = await encrypted();
    const envelope = { ...(JSON.parse(text) as object), v: 2 };
    const b = await world();
    const error = failure(await b.backup.previewImport(file(JSON.stringify(envelope)), { passphrase: PASSPHRASE }));
    expect(error.code).toBe('UNSUPPORTED_VERSION');
  });
});

describe('markExported (W9-01)', () => {
  it("marks the backup at the file's exportedAt and resets the counter", async () => {
    const { store, backup, clock } = await world();
    await seed(store);
    await vi.waitFor(() => expect(backup.changesSinceBackup()).toBeGreaterThan(0));
    const exported = await backup.exportJson();
    const parsed = JSON.parse(await exported.blob.text()) as { exportedAt: string };
    clock.advance(40_000);
    await backup.markExported(exported);
    expect(backup.lastBackupAt()).toBe(parsed.exportedAt);
    expect(backup.changesSinceBackup()).toBe(0);
    expect((await store.getMeta()).lastBackupAt).toBe(parsed.exportedAt);
    expect(await store.changesSinceBackup()).toBe(0);
  });

  it('marks an encrypted export the same way', async () => {
    const { store, backup } = await world();
    await seed(store);
    await vi.waitFor(() => expect(backup.changesSinceBackup()).toBeGreaterThan(0));
    await settle();
    const exported = await backup.exportJson({ passphrase: PASSPHRASE });
    await backup.markExported(exported);
    expect(backup.changesSinceBackup()).toBe(0);
    expect(backup.lastBackupAt()).not.toBeNull();
  });

  it('does not mark when a write was notified after exportAll, even after the export returned', async () => {
    const { store, backup } = await world();
    await seed(store);
    const exported = await backup.exportJson();
    await store.loans.create(sampleLoan());
    await vi.waitFor(async () => expect(await store.changesSinceBackup()).toBeGreaterThan(0));
    await settle();
    const changes = await store.changesSinceBackup();
    await backup.markExported(exported);
    expect((await store.getMeta()).lastBackupAt).toBeNull();
    expect(backup.lastBackupAt()).toBeNull();
    expect(await store.changesSinceBackup()).toBe(changes);
  });

  it('does not mark when a write lands during the export', async () => {
    const { store, backup } = await world();
    await seed(store);
    const original = store.exportAll.bind(store);
    vi.spyOn(store, 'exportAll').mockImplementationOnce(async () => {
      const data = await original();
      await store.loans.create(sampleLoan());
      await settle();
      return data;
    });
    const exported = await backup.exportJson();
    await backup.markExported(exported);
    expect((await store.getMeta()).lastBackupAt).toBeNull();
    expect(backup.lastBackupAt()).toBeNull();
  });

  it('marks a file once: a second call, a stale file or a file it did not build changes nothing', async () => {
    const { store, backup, clock } = await world();
    const older = await backup.exportJson();
    clock.advance(60_000);
    const newer = await backup.exportJson();
    await backup.markExported(newer);
    const marked = backup.lastBackupAt();
    clock.advance(60_000);
    await backup.markExported(newer);
    await backup.markExported(older);
    await backup.markExported({ fileName: 'otro.json', blob: new Blob(['{}']), encrypted: false });
    expect(backup.lastBackupAt()).toBe(marked);
    expect((await store.getMeta()).lastBackupAt).toBe(marked);
  });

  it('wraps a storage failure in a DataError', async () => {
    const { store, backup } = await world();
    const exported = await backup.exportJson();
    vi.spyOn(store, 'markBackedUp').mockRejectedValueOnce(new Error('disk'));
    await expect(backup.markExported(exported)).rejects.toMatchObject({ code: 'STORAGE' });
  });
});

describe('reminderDue through the service', () => {
  it('is due above 20 changes since the backup and clears after a marked export', async () => {
    const { store, backup } = await world();
    await backup.markExported(await backup.exportJson());
    for (let index = 0; index < 20; index += 1) {
      await store.loans.create(sampleLoan());
    }
    await vi.waitFor(() => expect(backup.changesSinceBackup()).toBe(20));
    expect(backup.reminderDue()).toBe(false);
    await store.loans.create(sampleLoan());
    await vi.waitFor(() => expect(backup.reminderDue()).toBe(true));
    await backup.exportJson();
    await settle();
    expect(backup.reminderDue()).toBe(true);
    await backup.markExported(await backup.exportJson());
    expect(backup.reminderDue()).toBe(false);
  });

  it('without a backup, uses the oldest active record when older than 30 days', async () => {
    const { store, backup, clock } = await world();
    await store.loans.create(sampleLoan());
    await vi.waitFor(() => expect(backup.changesSinceBackup()).toBe(1));
    expect(backup.reminderDue()).toBe(false);
    clock.advance(31 * 24 * 60 * 60 * 1000);
    await store.settings.saveDevice({ theme: 'dark', driveSyncEnabled: false });
    await vi.waitFor(() => expect(backup.reminderDue()).toBe(true));
  });
});

describe('export and reminder races', () => {
  it('re-evaluates reminderDue when the page becomes visible again', async () => {
    const { store, backup, clock } = await world();
    await store.loans.create(sampleLoan());
    await vi.waitFor(() => expect(backup.changesSinceBackup()).toBe(1));
    expect(backup.reminderDue()).toBe(false);
    clock.advance(31 * 24 * 60 * 60 * 1000);
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(backup.reminderDue()).toBe(true));
  });
});
