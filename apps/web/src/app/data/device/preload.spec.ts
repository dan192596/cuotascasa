import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { DataStore } from '@cuotascasa/persistence';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { DATA_STORE } from '../data-layer.tokens.ts';
import { DEVICE_DATA_SERVICE, SYNC_SERVICE } from '../tokens.ts';
import { DEVICE_NOTHING_CHANGED, provideDeviceData } from './provide-device-data.ts';

describe('clearAll preload (W7-04)', () => {
  it('aborts with STORAGE «nothing changed» and no side effects when a module cannot be loaded', async () => {
    const factory = new IDBFactory();
    await new Promise<void>((resolve) => {
      const open = factory.open('cuotascasa', 1);
      open.onsuccess = () => {
        open.result.close();
        resolve();
      };
    });
    const disconnect = vi.fn(() => Promise.resolve());
    const close = vi.fn(() => Promise.resolve());
    const post = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideDeviceData({
          indexedDb: factory,
          loadNames: () => Promise.reject(new Error('chunk failed to load')),
          locks: null,
          channel: () => ({ postMessage: post, onmessage: null, close }),
        }),
        {
          provide: SYNC_SERVICE,
          useValue: { status: signal({ state: 'idle', pendingChanges: 0, lastSyncAt: null }), disconnect },
        },
        { provide: DATA_STORE, useValue: Promise.resolve({ close } as unknown as DataStore) },
      ],
    });
    const outcome = TestBed.inject(DEVICE_DATA_SERVICE).clearAll();
    await expect(outcome).rejects.toMatchObject({ code: 'STORAGE', message: DEVICE_NOTHING_CHANGED });
    expect(disconnect).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
    expect((await factory.databases()).map((db) => db.name)).toEqual(['cuotascasa']);
  });
});
