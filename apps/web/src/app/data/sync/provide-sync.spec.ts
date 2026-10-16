import { TestBed } from '@angular/core/testing';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { provideDataStores } from '../providers/provide-data-stores.ts';
import { SYNC_SERVICE } from '../tokens.ts';
import { provideSync } from './provide-sync.ts';

describe('provideSync()', () => {
  afterEach(() => TestBed.resetTestingModule());

  it("provides SYNC_SERVICE; the test build has no client ID, so it reads 'No configurado'", () => {
    TestBed.configureTestingModule({ providers: [provideDataStores(), provideSync()] });
    const sync = TestBed.inject(SYNC_SERVICE);
    expect(sync.configured()).toBe(false);
    expect(sync.status()).toEqual({ state: 'not-configured' });
    expect(sync.statusText()).toBe('No configurado');
  });

  it('wires the DataStore and the clock: a configured service stays disconnected and loads no Google code', async () => {
    const loadDriveModule = vi.fn(() => import('@cuotascasa/sync/google-drive'));
    TestBed.configureTestingModule({
      providers: [
        provideDataStores(),
        provideSync({ clientId: 'cuotascasa-test-client', loadDriveModule, indexedDb: new IDBFactory() }),
      ],
    });
    const sync = TestBed.inject(SYNC_SERVICE);
    expect(sync.configured()).toBe(true);
    expect(sync.statusText()).toBe('Drive desconectado');
    await sync.disconnect();
    expect(loadDriveModule).not.toHaveBeenCalled();
  });
});
