import { EnvironmentInjector, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { DataStore } from '@cuotascasa/persistence';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { DataError, type SyncService } from '../api.ts';
import { DATA_STORE } from '../data-layer.tokens.ts';
import { DEVICE_DATA_SERVICE, SYNC_SERVICE } from '../tokens.ts';
import {
  DEVICE_PARTIAL,
  provideDeviceData,
  type DeviceChannel,
  type DeviceDataOptions,
} from './provide-device-data.ts';

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

class FakeChannel implements DeviceChannel {
  onmessage: ((event: { readonly data: unknown }) => void) | null = null;
  readonly posted: unknown[] = [];
  closed = false;
  private readonly log: string[] | undefined;
  constructor(log?: string[]) {
    this.log = log;
  }
  postMessage(message: unknown): void {
    this.posted.push(message);
    this.log?.push(`post:${String(message)}`);
  }
  close(): void {
    this.closed = true;
  }
}

function setup(status: Status, extra: DeviceDataOptions = {}, storePromise?: Promise<DataStore>) {
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
      provideDeviceData({ indexedDb: factory, locks: null, channel: () => null, blockedTimeoutMs: 50, ...extra }),
      { provide: SYNC_SERVICE, useValue: sync },
      { provide: DATA_STORE, useValue: storePromise ?? Promise.resolve(store as unknown as DataStore) },
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
      { state: 'syncing' },
      { state: 'error', code: 'InvalidRemote' },
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

  it('a blocked deletion waits and completes once the blocking connection is released', async () => {
    const { factory, device } = setup({ state: 'disconnected' }, { blockedTimeoutMs: 2000 });
    const held = await create(factory, KEY_DB);
    held.onversionchange = null; // keeps blocking
    const outcome = device.clearAll();
    await new Promise((resolve) => setTimeout(resolve, 30));
    held.close();
    await expect(outcome).resolves.toBeUndefined();
    expect(await names(factory)).toEqual([]);
  });

  it('a blocked deletion that never gets released rejects with STORAGE after the timeout', async () => {
    const { factory, device } = setup({ state: 'disconnected' });
    const held = await create(factory, KEY_DB);
    const outcome = device.clearAll();
    await expect(outcome).rejects.toBeInstanceOf(DataError);
    await expect(outcome).rejects.toMatchObject({ code: 'STORAGE', message: DEVICE_PARTIAL });
    held.close();
  });

  it('deletes the key store first and the data store second', async () => {
    const calls: string[] = [];
    const real = new IDBFactory();
    const factory = {
      deleteDatabase: (name: string) => {
        calls.push(name);
        return real.deleteDatabase(name);
      },
    } as unknown as IDBFactory;
    const { device } = setup({ state: 'disconnected' }, { indexedDb: factory });
    await device.clearAll();
    expect(calls).toEqual([KEY_DB, DATA_DB]);
  });

  it('skips close() and still deletes when the store promise rejected (never opened)', async () => {
    const rejected = Promise.reject(new Error('corrupt'));
    rejected.catch(() => undefined);
    const { factory, device } = setup({ state: 'disconnected' }, {}, rejected as Promise<DataStore>);
    (await create(factory, DATA_DB)).close();
    await expect(device.clearAll()).resolves.toBeUndefined();
    expect(await names(factory)).toEqual([]);
  });

  it('posts «cleared» to other tabs after closing and before deleting, and deletes inside the sync lock', async () => {
    const log: string[] = [];
    const channel = new FakeChannel(log);
    const real = new IDBFactory();
    const factory = {
      deleteDatabase: (name: string) => {
        log.push(`delete:${name}`);
        return real.deleteDatabase(name);
      },
    } as unknown as IDBFactory;
    const locks = {
      request: <T>(name: string, callback: () => Promise<T>): Promise<T> => {
        log.push(`lock:${name}`);
        return callback();
      },
    };
    const { device, store } = setup({ state: 'disconnected' }, { indexedDb: factory, channel: () => channel, locks });
    store.close.mockImplementation(() => {
      log.push('close');
      return Promise.resolve();
    });
    await device.clearAll();
    expect(log).toEqual(['close', 'post:cleared', 'lock:cuotascasa-sync', `delete:${KEY_DB}`, `delete:${DATA_DB}`]);
  });

  it('another tab that hears «cleared» loads /app again; the listener is released on destroy', () => {
    const channel = new FakeChannel();
    const reload = vi.fn();
    setup({ state: 'disconnected' }, { channel: () => channel, reload });
    TestBed.inject(EnvironmentInjector);
    expect(channel.onmessage).not.toBeNull();
    channel.onmessage?.({ data: 'other' });
    expect(reload).not.toHaveBeenCalled();
    channel.onmessage?.({ data: 'cleared' });
    expect(reload).toHaveBeenCalledTimes(1);
    TestBed.resetTestingModule();
    expect(channel.closed).toBe(true);
  });

  it('degrades without BroadcastChannel and without locks', async () => {
    const { device, factory } = setup({ state: 'disconnected' }, { channel: () => null, locks: null });
    (await create(factory, KEY_DB)).close();
    await expect(device.clearAll()).resolves.toBeUndefined();
  });

  it('rejects with STORAGE when closing the store fails, and deletes nothing', async () => {
    const { factory, device, store } = setup({ state: 'disconnected' });
    (await create(factory, DATA_DB)).close();
    store.close.mockRejectedValueOnce(new Error('boom'));
    await expect(device.clearAll()).rejects.toMatchObject({ code: 'STORAGE', message: DEVICE_PARTIAL });
    expect(await names(factory)).toEqual([DATA_DB]);
  });

  it('rejects with STORAGE when the disconnect fails, and deletes nothing', async () => {
    const { factory, device, sync } = setup({ state: 'idle', pendingChanges: 0, lastSyncAt: null });
    (await create(factory, DATA_DB)).close();
    sync.disconnect.mockRejectedValueOnce(new Error('network'));
    await expect(device.clearAll()).rejects.toMatchObject({ code: 'STORAGE', message: DEVICE_PARTIAL });
    expect(await names(factory)).toEqual([DATA_DB]);
  });
});
