import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { DataStore } from '@cuotascasa/persistence';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { DataError, type SyncService } from '../api.ts';
import { DATA_STORE } from '../data-layer.tokens.ts';
import { DEVICE_DATA_SERVICE, SYNC_SERVICE } from '../tokens.ts';
import { provideDeviceData } from './provide-device-data.ts';

type Status = ReturnType<SyncService['status']>;

const DATA_DB = 'cuotascasa';
const KEY_DB = 'cuotascasa-keys';

function create(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('rows');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function names(factory: IDBFactory): Promise<string[]> {
  return (await factory.databases()).map((info) => info.name ?? '').sort();
}

function setup(status: Status) {
  const factory = new IDBFactory();
  const calls: string[] = [];
  const sync = {
    status: signal(status),
    disconnect: vi.fn(() => {
      calls.push('disconnect');
      return Promise.resolve();
    }),
    sync: vi.fn(),
    connect: vi.fn(),
    prepare: vi.fn(),
    setPassphrase: vi.fn(),
    changePassphrase: vi.fn(),
  };
  const store = {
    close: vi.fn(() => {
      calls.push('close');
      return Promise.resolve();
    }),
  };
  TestBed.configureTestingModule({
    providers: [
      provideDeviceData({ indexedDb: factory }),
      { provide: SYNC_SERVICE, useValue: sync },
      { provide: DATA_STORE, useValue: Promise.resolve(store as unknown as DataStore) },
    ],
  });
  return { factory, sync, store, calls, device: TestBed.inject(DEVICE_DATA_SERVICE) };
}

describe('DeviceDataService.clearAll (W7-04)', () => {
  it('disconnects first, closes the store, then deletes exactly the two app databases', async () => {
    const { factory, calls, device, sync, store } = setup({ state: 'idle', pendingChanges: 0, lastSyncAt: null });
    const data = await create(factory, DATA_DB);
    const keys = await create(factory, KEY_DB);
    const other = await create(factory, 'otra-app');
    data.close();
    keys.close();
    other.close();
    await device.clearAll();
    expect(calls).toEqual(['disconnect', 'close']);
    expect(sync.disconnect).toHaveBeenCalledTimes(1);
    expect(store.close).toHaveBeenCalledTimes(1);
    expect(await names(factory)).toEqual(['otra-app']);
  });

  it.each<Status>([{ state: 'disconnected' }, { state: 'not-configured' }])(
    'does not disconnect when sync is %o',
    async (status) => {
      const { factory, device, sync } = setup(status);
      (await create(factory, DATA_DB)).close();
      await device.clearAll();
      expect(sync.disconnect).not.toHaveBeenCalled();
      expect(await names(factory)).toEqual([]);
    },
  );

  it('disconnects in every connected-ish state (needs-auth, offline, needs-passphrase)', async () => {
    for (const status of [
      { state: 'needs-auth' },
      { state: 'offline', pendingChanges: 2 },
      { state: 'needs-passphrase', reason: 'no-key' },
    ] as const) {
      TestBed.resetTestingModule();
      const { device, sync } = setup(status);
      await device.clearAll();
      expect(sync.disconnect).toHaveBeenCalledTimes(1);
    }
  });

  it('succeeds when neither database exists', async () => {
    const { device, factory } = setup({ state: 'disconnected' });
    await expect(device.clearAll()).resolves.toBeUndefined();
    expect(await names(factory)).toEqual([]);
  });

  it('rejects with DataError STORAGE when a deletion is blocked by another open connection', async () => {
    const { factory, device } = setup({ state: 'disconnected' });
    const held = await create(factory, KEY_DB); // never closes and ignores versionchange
    const outcome = device.clearAll();
    await expect(outcome).rejects.toBeInstanceOf(DataError);
    await expect(outcome).rejects.toMatchObject({ code: 'STORAGE' });
    held.close();
  });

  it('rejects with STORAGE when closing the store fails, and deletes nothing', async () => {
    const { factory, device, store } = setup({ state: 'disconnected' });
    (await create(factory, DATA_DB)).close();
    store.close.mockRejectedValueOnce(new Error('boom'));
    await expect(device.clearAll()).rejects.toMatchObject({ code: 'STORAGE' });
    expect(await names(factory)).toEqual([DATA_DB]);
  });

  it('rejects with STORAGE when the disconnect fails, and deletes nothing', async () => {
    const { factory, device, sync } = setup({ state: 'idle', pendingChanges: 0, lastSyncAt: null });
    (await create(factory, DATA_DB)).close();
    sync.disconnect.mockRejectedValueOnce(new Error('network'));
    await expect(device.clearAll()).rejects.toMatchObject({ code: 'STORAGE' });
    expect(await names(factory)).toEqual([DATA_DB]);
  });
});
