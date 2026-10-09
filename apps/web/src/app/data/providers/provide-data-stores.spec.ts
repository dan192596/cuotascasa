import { spawnSync } from 'node:child_process';
import { TestBed } from '@angular/core/testing';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import { CLOCK, DATA_STORE, ID_GENERATOR } from '../data-layer.tokens.ts';
import { provideDataStores } from './provide-data-stores.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function databaseNames(factory: IDBFactory): Promise<string[]> {
  return (await factory.databases()).map((database) => database.name ?? '');
}

/** Starts an app injector over a shared IndexedDB factory, reads the DataStore and tears the injector down. */
async function deviceIdOf(options: Parameters<typeof provideDataStores>[0]): Promise<string> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideDataStores(options)] });
  const store = await TestBed.inject(DATA_STORE);
  const { deviceId } = await store.getMeta();
  TestBed.resetTestingModule();
  return deviceId;
}

describe('provideDataStores', () => {
  afterEach(() => TestBed.resetTestingModule());

  describe('adapter selection (isDevMode flag, D26)', () => {
    it('uses the in-memory adapter in development: no IndexedDB database is opened', async () => {
      const indexedDb = new IDBFactory();
      TestBed.configureTestingModule({ providers: [provideDataStores({ indexedDb })] });
      const store = await TestBed.inject(DATA_STORE);
      await store.settings.saveDevice({ theme: 'dark', driveSyncEnabled: false });
      expect(await databaseNames(indexedDb)).toEqual([]);
    });

    it('uses Dexie in production: the cuotascasa database exists and its data survives a new injector', async () => {
      const indexedDb = new IDBFactory();
      TestBed.configureTestingModule({ providers: [provideDataStores({ adapter: 'dexie', indexedDb })] });
      const store = await TestBed.inject(DATA_STORE);
      await store.settings.saveDevice({ theme: 'dark', driveSyncEnabled: false });
      expect(await databaseNames(indexedDb)).toEqual(['cuotascasa']);

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [provideDataStores({ adapter: 'dexie', indexedDb })] });
      const reopened = await TestBed.inject(DATA_STORE);
      expect((await reopened.settings.getDevice())?.theme).toBe('dark');
    });

    it('memory state is not shared between injectors', async () => {
      TestBed.configureTestingModule({ providers: [provideDataStores()] });
      await (await TestBed.inject(DATA_STORE)).settings.saveDevice({ theme: 'dark', driveSyncEnabled: false });
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [provideDataStores()] });
      expect(await (await TestBed.inject(DATA_STORE)).settings.getDevice()).toBeUndefined();
    });
  });

  describe('deviceId', () => {
    it('is generated once and stays stable across re-instantiation (Dexie)', async () => {
      const indexedDb = new IDBFactory();
      const first = await deviceIdOf({ adapter: 'dexie', indexedDb });
      const second = await deviceIdOf({ adapter: 'dexie', indexedDb });
      expect(first).toMatch(UUID);
      expect(second).toBe(first);
    });

    it('differs between two independent databases', async () => {
      const a = await deviceIdOf({ adapter: 'dexie', indexedDb: new IDBFactory() });
      const b = await deviceIdOf({ adapter: 'dexie', indexedDb: new IDBFactory() });
      expect(a).not.toBe(b);
    });
  });

  describe('Clock', () => {
    it('now() is a toISOString instant', () => {
      TestBed.configureTestingModule({ providers: [provideDataStores()] });
      const clock = TestBed.inject(CLOCK);
      const before = Date.now();
      const now = clock.now();
      expect(new Date(now).toISOString()).toBe(now);
      expect(Date.parse(now)).toBeGreaterThanOrEqual(before);
    });

    it('today() is the local calendar date', () => {
      TestBed.configureTestingModule({ providers: [provideDataStores()] });
      const date = new Date();
      const pad = (n: number): string => String(n).padStart(2, '0');
      const expected = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
      const today = TestBed.inject(CLOCK).today();
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // Equal unless the test straddles local midnight.
      expect(today === expected || Date.now() - date.getTime() < 1000).toBe(true);
    });
  });

  describe('IdGenerator', () => {
    it('newId() returns distinct RFC 4122 uuids', () => {
      TestBed.configureTestingModule({ providers: [provideDataStores()] });
      const ids = TestBed.inject(ID_GENERATOR);
      const a = ids.newId();
      const b = ids.newId();
      expect(a).toMatch(UUID);
      expect(a).not.toBe(b);
    });
  });

  describe('lifecycle', () => {
    it('closes the store when the injector is destroyed', async () => {
      TestBed.configureTestingModule({ providers: [provideDataStores()] });
      const store = await TestBed.inject(DATA_STORE);
      TestBed.resetTestingModule();
      await expect(store.getMeta()).rejects.toMatchObject({ code: 'CLOSED' });
    });
  });
});

describe('boundary: public/ cannot import data/providers', () => {
  it('fails with the boundary rule (the repo eslint config, linting a virtual public/ file)', () => {
    const code =
      "import { provideDataStores } from '../../data/providers/provide-data-stores.ts';\nexport const fixture = provideDataStores;\n";
    // cwd = repo root, as in data-boundary.spec.ts.
    const run = spawnSync(
      'pnpm',
      [
        'exec',
        'eslint',
        '--stdin',
        '--stdin-filename',
        'apps/web/src/app/public/landing/lint-fixture.ts',
        '--format',
        'json',
      ],
      { input: code, encoding: 'utf8', cwd: process.cwd() },
    );
    const [result] = JSON.parse(run.stdout) as { messages: { ruleId: string | null; line: number }[] }[];
    expect(result?.messages.map((message) => message.ruleId)).toEqual(['boundaries/dependencies']);
    expect(result?.messages[0]?.line).toBe(1);
  }, 120_000);
});
