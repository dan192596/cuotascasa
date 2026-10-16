import { TestBed } from '@angular/core/testing';
import type { DataStore } from '@cuotascasa/persistence';
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
import { provideBackup, UNDO_WINDOW_MS } from './provide-backup.ts';

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

const file = (text: string): Blob => new Blob([text], { type: 'application/json' });

afterEach(() => {
  vi.useRealTimers();
});

describe('exportJson', () => {
  it('names the file by date, marks the backup and resets the counter', async () => {
    const { store, backup, clock } = await world();
    await seed(store);
    await vi.waitFor(() => expect(backup.changesSinceBackup()).toBeGreaterThan(0));
    const result = await backup.exportJson();
    expect(result.fileName).toBe('cuotascasa-respaldo-2026-10-04.json');
    expect(result.encrypted).toBe(false);
    const parsed = JSON.parse(await result.blob.text()) as { format: string; exportedAt: string };
    expect(parsed.format).toBe('cuotascasa');
    expect(backup.lastBackupAt()).toBe(parsed.exportedAt);
    expect(parsed.exportedAt).toBe(clock.now());
    expect(backup.changesSinceBackup()).toBe(0);
    expect((await store.getMeta()).lastBackupAt).toBe(parsed.exportedAt);
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
    vi.useRealTimers();
    await expect(b.backup.undoImport('wrong')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await vi.advanceTimersByTimeAsync(2);
    await expect(b.backup.undoImport(receipt.undoToken)).rejects.toMatchObject({ code: 'NOT_FOUND' });
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

  it('never derives with iterations above the cap or below the floor', async () => {
    const { text } = await encrypted();
    const b = await world();
    for (const iterations of [10_000_001, 2 ** 40, ITERATIONS - 1, 0, -5, 1.5]) {
      const envelope = JSON.parse(text) as { kdf: { iterations: number } };
      envelope.kdf.iterations = iterations;
      const started = Date.now();
      const error = failure(await b.backup.previewImport(file(JSON.stringify(envelope)), { passphrase: PASSPHRASE }));
      expect(Date.now() - started).toBeLessThan(2000);
      expect(['VALIDATION', 'WRONG_PASSPHRASE']).toContain(error.code);
    }
  });

  it('maps an unknown envelope version to UNSUPPORTED_VERSION', async () => {
    const { text } = await encrypted();
    const envelope = { ...(JSON.parse(text) as object), v: 2 };
    const b = await world();
    const error = failure(await b.backup.previewImport(file(JSON.stringify(envelope)), { passphrase: PASSPHRASE }));
    expect(error.code).toBe('UNSUPPORTED_VERSION');
  });
});

describe('reminderDue through the service', () => {
  it('is due above 20 changes since the backup and clears after exporting', async () => {
    const { store, backup } = await world();
    await backup.exportJson();
    for (let index = 0; index < 20; index += 1) {
      await store.loans.create(sampleLoan());
    }
    await vi.waitFor(() => expect(backup.changesSinceBackup()).toBe(20));
    expect(backup.reminderDue()).toBe(false);
    await store.loans.create(sampleLoan());
    await vi.waitFor(() => expect(backup.reminderDue()).toBe(true));
    await backup.exportJson();
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
