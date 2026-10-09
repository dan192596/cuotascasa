import {
  parseBackup,
  serializeBackup,
  type BackupData,
  type BackupDocument,
  type IsoInstant,
  type Loan,
  type Uuid,
} from '@cuotascasa/schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decrypt, deriveStoredKey, encrypt, parseEnvelope, serializeEnvelope } from '../crypto/index.ts';
import {
  REMOTE_FILE_NAME,
  REMOTE_PREV_FILE_NAME,
  SYNC_LOCK_NAME,
  type RemoteFileName,
  type StoredKey,
  type SyncStatus,
} from '../ports.ts';
import {
  createFakeClock,
  createFakeLocal,
  createFakeLocks,
  createFakeProvider,
  createMemoryKeyStore,
  type FakeLocal,
  type FakeProvider,
} from './testing/fakes.ts';

const order = vi.hoisted(() => ({ log: [] as string[] }));
vi.mock('../merge/index.ts', async (importOriginal) => {
  const original = await importOriginal<typeof import('../merge/index.ts')>();
  return {
    mergeDatasets: ((...args: Parameters<typeof original.mergeDatasets>) => {
      order.log.push('merge');
      return original.mergeDatasets(...args);
    }) as typeof original.mergeDatasets,
    purgeTombstones: ((...args: Parameters<typeof original.purgeTombstones>) => {
      order.log.push(`purge:${String(args[1])}`);
      return original.purgeTombstones(...args);
    }) as typeof original.purgeTombstones,
  };
});

const { createSyncSession } = await import('./index.ts');

const ITERATIONS = 10;
const DEVICE_A = 'a0000000-0000-4000-8000-00000000000a' as Uuid;
const DEVICE_B = 'b0000000-0000-4000-8000-00000000000b' as Uuid;
const NOW = '2026-10-05T12:00:00.000Z' as IsoInstant;
const LATER = '2026-10-05T13:00:00.000Z' as IsoInstant;
const PREV_SYNC = '2026-09-01T00:00:00.000Z' as IsoInstant;
const empty: BackupData = { loans: [], events: [], reportedBalances: [], payments: [], scenarios: [], settings: [] };

function loan(id: string, name: string, extra: Partial<Loan> = {}): Loan {
  return {
    id,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    updatedByDevice: DEVICE_A,
    deletedAt: null,
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
    ...extra,
  } as Loan;
}
const L1 = 'c0000000-0000-4000-8000-000000000001';
const L2 = 'c0000000-0000-4000-8000-000000000002';
const L3 = 'c0000000-0000-4000-8000-000000000003';
const withLoans = (...loans: Loan[]): BackupData => ({ ...empty, loans });

function document(data: BackupData): BackupDocument {
  return { format: 'cuotascasa', version: 1, exportedAt: NOW, deviceId: DEVICE_B, appVersion: 'remote-1', data };
}

let key: StoredKey;
let otherSaltKey: StoredKey;
let wrongPassphraseKey: StoredKey;
beforeEach(async () => {
  order.log.length = 0;
  key = await deriveStoredKey('frase de prueba', { iterations: ITERATIONS });
  otherSaltKey = await deriveStoredKey('frase de prueba', { iterations: ITERATIONS });
  wrongPassphraseKey = await deriveStoredKey('otra frase', { iterations: ITERATIONS, saltId: key.saltId });
});

interface Harness {
  readonly provider: FakeProvider;
  readonly local: FakeLocal;
  readonly locks: ReturnType<typeof createFakeLocks>;
  readonly clock: ReturnType<typeof createFakeClock>;
  readonly session: ReturnType<typeof createSyncSession>;
}

interface SetupOptions {
  readonly dataset?: BackupData;
  readonly pending?: number;
  readonly lastSyncAt?: IsoInstant | null;
  readonly key?: StoredKey | null;
  readonly authorized?: boolean;
  readonly locks?: ReturnType<typeof createFakeLocks>;
  readonly provider?: FakeProvider;
  readonly local?: FakeLocal;
}

function setup(options: SetupOptions = {}): Harness {
  const provider = options.provider ?? createFakeProvider({ authorized: options.authorized ?? true, log: order.log });
  const local =
    options.local ??
    createFakeLocal(
      options.dataset ?? withLoans(loan(L1, 'Local')),
      {
        deviceId: DEVICE_A,
        lastSyncAt: options.lastSyncAt === undefined ? PREV_SYNC : options.lastSyncAt,
        pendingChanges: options.pending ?? 2,
      },
      order.log,
    );
  const keys = createMemoryKeyStore(options.key === undefined ? key : options.key);
  const locks = options.locks ?? createFakeLocks();
  const clock = createFakeClock(NOW);
  const session = createSyncSession(
    { provider, local, keys, clock, locks },
    { appVersion: 'test-1.2.3', minIterations: ITERATIONS },
  );
  return { provider, local, locks, clock, session };
}

async function remoteText(data: BackupData, withKey: StoredKey = key): Promise<string> {
  return serializeEnvelope(await encrypt(withKey, serializeBackup(document(data))));
}

async function seedRemote(provider: FakeProvider, data: BackupData, withKey: StoredKey = key): Promise<void> {
  provider.writeRemote(REMOTE_FILE_NAME, await remoteText(data, withKey));
}

async function openRemote(provider: FakeProvider, name: RemoteFileName = REMOTE_FILE_NAME): Promise<BackupDocument> {
  const text = provider.content(name);
  expect(text).toBeDefined();
  const plain = await decrypt(key, parseEnvelope(text as string), { minIterations: ITERATIONS });
  const parsed = parseBackup(plain);
  if (!parsed.ok) {
    throw new Error('uploaded plaintext is not a backup');
  }
  return parsed.value.document;
}

const uploads = (provider: FakeProvider): string[] => provider.calls.filter((c) => /^(create|update|copy)File/.test(c));

describe('first sync without a remote file', () => {
  it('uploads cuotascasa.json as an envelope, never plaintext, and marks synced', async () => {
    const h = setup();
    const outcome = await h.session.sync();

    const text = h.provider.content(REMOTE_FILE_NAME) as string;
    expect(text).toBeDefined();
    expect(text).not.toContain('Local');
    expect(text).not.toContain('Banco Ficticio');
    expect(parseEnvelope(text).format).toBe('cuotascasa-enc');
    expect(h.provider.content(REMOTE_PREV_FILE_NAME)).toBeUndefined();
    expect(h.provider.calls).toContain('createFile:cuotascasa.json');

    const doc = await openRemote(h.provider);
    expect(doc.data.loans.map((l) => l.name)).toEqual(['Local']);
    expect(doc.appVersion).toBe('test-1.2.3');
    expect(doc.deviceId).toBe(DEVICE_A);
    expect(doc.exportedAt).toBe(NOW);
    expect(h.local.syncedAt).toEqual([NOW]);
    expect(outcome.status).toEqual({ state: 'idle', pendingChanges: 0, lastSyncAt: NOW });
    expect(outcome.stats).toEqual({ fromLocal: 1, fromRemote: 0, tombstones: 0 });
    expect(h.session.getStatus()).toEqual(outcome.status);
  });

  it('uploads serializeBackup of the merged dataset and never the device settings record', async () => {
    const deviceSettings = {
      id: 'd0000000-0000-4000-8000-000000000001',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      updatedByDevice: DEVICE_A,
      deletedAt: null,
      scope: 'device',
    };
    const h = setup({ dataset: { ...withLoans(loan(L1, 'Local')), settings: [deviceSettings as never] } });
    await h.session.sync();
    const doc = await openRemote(h.provider);
    expect(doc.data.settings).toEqual([]);
    const plain = await decrypt(key, parseEnvelope(h.provider.content(REMOTE_FILE_NAME) as string), {
      minIterations: ITERATIONS,
    });
    expect(plain).toBe(serializeBackup(doc));
  });
});

describe('full pipeline with a remote file', () => {
  it('merges, saves locally, keeps the previous remote as cuotascasa.prev.json and overwrites', async () => {
    const h = setup();
    await seedRemote(h.provider, withLoans(loan(L2, 'Remota')));
    const before = h.provider.content(REMOTE_FILE_NAME);
    const outcome = await h.session.sync();

    expect(h.provider.content(REMOTE_PREV_FILE_NAME)).toBe(before);
    expect(h.provider.content(REMOTE_FILE_NAME)).not.toBe(before);
    expect(h.local.dataset.loans.map((l) => l.name).sort()).toEqual(['Local', 'Remota']);
    const doc = await openRemote(h.provider);
    expect(doc.data.loans.map((l) => l.name).sort()).toEqual(['Local', 'Remota']);
    const calls = h.provider.calls;
    expect(calls.indexOf('copyFile:cuotascasa.prev.json')).toBeLessThan(calls.indexOf('updateFile:cuotascasa.json'));
    expect(outcome.stats).toEqual({ fromLocal: 1, fromRemote: 1, tombstones: 0 });
    expect(outcome.status.state).toBe('idle');
  });

  it('runs merge, purge with the previous lastSyncAt, save, upload and markSynced in that order', async () => {
    const h = setup();
    await seedRemote(h.provider, withLoans(loan(L2, 'Remota')));
    order.log.length = 0;
    await h.session.sync();
    const steps = order.log.filter((entry) =>
      /^(local\.read|merge|purge:|local\.save|updateFile|copyFile|local\.markSynced)/.test(entry),
    );
    expect(steps).toEqual([
      'local.read',
      'merge',
      `purge:${PREV_SYNC}`,
      'local.save',
      'copyFile:cuotascasa.prev.json',
      'updateFile:cuotascasa.json',
      'local.markSynced',
    ]);
  });

  it('purges an expired tombstone, saves without it and does not upload it', async () => {
    const dead = loan(L3, 'Borrada', { deletedAt: '2026-05-01T00:00:00.000Z', updatedAt: '2026-05-01T00:00:00.000Z' });
    const h = setup({ dataset: withLoans(loan(L1, 'Local'), dead) });
    await seedRemote(h.provider, withLoans(dead));
    const outcome = await h.session.sync();
    expect(outcome.purged).toBe(1);
    expect(h.local.dataset.loans.map((l) => l.id)).toEqual([L1]);
    const doc = await openRemote(h.provider);
    expect(doc.data.loans.map((l) => l.id)).toEqual([L1]);
  });

  it('keeps a tombstone on the first sync (lastSyncAt null)', async () => {
    const dead = loan(L3, 'Borrada', { deletedAt: '2026-05-01T00:00:00.000Z', updatedAt: '2026-05-01T00:00:00.000Z' });
    const h = setup({ dataset: withLoans(dead), lastSyncAt: null });
    const outcome = await h.session.sync();
    expect(outcome.purged).toBe(0);
    expect((await openRemote(h.provider)).data.loans).toHaveLength(1);
  });

  it('starts over from the download once when the remote version changed, then uploads', async () => {
    const h = setup();
    await seedRemote(h.provider, withLoans(loan(L2, 'Remota')));
    const bumped = await remoteText(withLoans(loan(L2, 'Remota'), loan(L3, 'Tercera')));
    let bumps = 0;
    h.provider.onDownload = () => {
      if (bumps === 0) {
        bumps += 1;
        h.provider.writeRemote(REMOTE_FILE_NAME, bumped);
      }
    };
    const outcome = await h.session.sync();
    expect(h.provider.calls.filter((c) => c === 'downloadFile:cuotascasa.json')).toHaveLength(2);
    expect(h.provider.calls.filter((c) => c === 'updateFile:cuotascasa.json')).toHaveLength(1);
    expect(h.local.reads).toBe(2);
    expect(h.local.dataset.loans.map((l) => l.name).sort()).toEqual(['Local', 'Remota', 'Tercera']);
    expect(outcome.status.state).toBe('idle');
  });

  it('uploads on the second pass even if the remote changed again', async () => {
    const h = setup();
    await seedRemote(h.provider, withLoans(loan(L2, 'Remota')));
    const bumped = await remoteText(withLoans(loan(L2, 'Remota')));
    h.provider.onDownload = () => h.provider.writeRemote(REMOTE_FILE_NAME, bumped);
    const outcome = await h.session.sync();
    expect(h.provider.calls.filter((c) => c === 'downloadFile:cuotascasa.json')).toHaveLength(2);
    expect(h.provider.calls.filter((c) => c === 'updateFile:cuotascasa.json')).toHaveLength(1);
    expect(outcome.status.state).toBe('idle');
  });

  it('starts over when a remote file appeared after finding none', async () => {
    const h = setup();
    const original = h.provider.findFile.bind(h.provider);
    let first = true;
    const appeared = await remoteText(withLoans(loan(L2, 'Remota')));
    h.provider.findFile = async (name) => {
      const result = await original(name);
      if (first && name === REMOTE_FILE_NAME) {
        first = false;
        h.provider.writeRemote(REMOTE_FILE_NAME, appeared);
      }
      return result;
    };
    await h.session.sync();
    expect(h.local.dataset.loans.map((l) => l.name).sort()).toEqual(['Local', 'Remota']);
    expect(h.provider.calls.filter((c) => c === 'createFile:cuotascasa.json')).toHaveLength(0);
    expect(h.provider.calls.filter((c) => c === 'updateFile:cuotascasa.json')).toHaveLength(1);
  });
});

describe('failure states', () => {
  for (const method of ['findFile', 'downloadFile', 'copyFile', 'updateFile'] as const) {
    it(`NetworkError in ${method} gives offline with pendingChanges kept and no markSynced`, async () => {
      const h = setup({ pending: 4 });
      await seedRemote(h.provider, withLoans(loan(L2, 'Remota')));
      h.provider.failNext(method, 'NetworkError');
      const outcome = await h.session.sync();
      expect(outcome.status).toEqual({ state: 'offline', pendingChanges: 4 });
      expect(outcome.stats).toBeNull();
      expect(h.local.syncedAt).toEqual([]);
      expect(h.local.meta.lastSyncAt).toBe(PREV_SYNC);
      expect(h.session.getStatus()).toEqual(outcome.status);
    });
  }

  it('NetworkError in createFile gives offline', async () => {
    const h = setup({ pending: 1 });
    h.provider.failNext('createFile', 'NetworkError');
    expect((await h.session.sync()).status).toEqual({ state: 'offline', pendingChanges: 1 });
    expect(h.local.syncedAt).toEqual([]);
  });

  it('AuthError gives needs-auth', async () => {
    const h = setup();
    h.provider.failNext('findFile', 'AuthError');
    expect((await h.session.sync()).status).toEqual({ state: 'needs-auth' });
    expect(h.local.saves).toBe(0);
  });

  it('re-authorizes inside the run when the token expired, and maps an authorize failure', async () => {
    const h = setup({ authorized: false });
    await h.session.sync();
    expect(h.provider.calls[0]).toBe('authorize');
    order.log.length = 0;
    const h2 = setup({ authorized: false });
    h2.provider.failNext('authorize', 'AuthError');
    expect((await h2.session.sync()).status).toEqual({ state: 'needs-auth' });
    expect(h2.provider.calls).toEqual(['authorize']);
  });

  it('a failed upload after the local save leaves lastSyncAt untouched and offline', async () => {
    const h = setup({ pending: 3 });
    await seedRemote(h.provider, withLoans(loan(L2, 'Remota')));
    h.provider.failNext('updateFile', 'NetworkError');
    const outcome = await h.session.sync();
    expect(outcome.status).toEqual({ state: 'offline', pendingChanges: 3 });
    expect(h.local.saves).toBe(1);
    expect(h.local.syncedAt).toEqual([]);
  });

  async function expectNeedsPassphrase(h: Harness, reason: string): Promise<void> {
    const before = h.local.dataset;
    const outcome = await h.session.sync();
    expect(outcome.status).toEqual({ state: 'needs-passphrase', reason });
    expect(h.local.saves).toBe(0);
    expect(h.local.dataset).toBe(before);
    expect(h.local.syncedAt).toEqual([]);
    expect(uploads(h.provider)).toEqual([]);
  }

  it('KeyMismatch (remote encrypted with another salt) gives needs-passphrase', async () => {
    const h = setup();
    await seedRemote(h.provider, withLoans(loan(L2, 'Remota')), otherSaltKey);
    await expectNeedsPassphrase(h, 'KeyMismatch');
  });

  it('WrongPassphraseOrTamper (same salt, other passphrase) gives needs-passphrase', async () => {
    const h = setup();
    await seedRemote(h.provider, withLoans(loan(L2, 'Remota')), wrongPassphraseKey);
    await expectNeedsPassphrase(h, 'WrongPassphraseOrTamper');
  });

  it('a tampered ciphertext gives needs-passphrase WrongPassphraseOrTamper', async () => {
    const h = setup();
    await seedRemote(h.provider, withLoans(loan(L2, 'Remota')));
    const envelope = parseEnvelope(h.provider.content(REMOTE_FILE_NAME) as string);
    const flipped = envelope.ct.startsWith('A') ? `B${envelope.ct.slice(1)}` : `A${envelope.ct.slice(1)}`;
    h.provider.writeRemote(REMOTE_FILE_NAME, serializeEnvelope({ ...envelope, ct: flipped }));
    await expectNeedsPassphrase(h, 'WrongPassphraseOrTamper');
  });

  it('no stored key gives needs-passphrase no-key without any network call', async () => {
    const h = setup({ key: null });
    await expectNeedsPassphrase(h, 'no-key');
    expect(h.provider.calls).toEqual([]);
  });

  async function expectError(h: Harness, code: string): Promise<void> {
    const before = h.local.dataset;
    const outcome = await h.session.sync();
    expect(outcome.status).toEqual({ state: 'error', code });
    expect(h.session.getStatus()).toEqual({ state: 'error', code });
    expect(h.local.saves).toBe(0);
    expect(h.local.dataset).toBe(before);
    expect(h.local.syncedAt).toEqual([]);
    expect(uploads(h.provider)).toEqual([]);
  }

  it('a FUTURE_VERSION backup gives UnsupportedVersion', async () => {
    const h = setup();
    const future = serializeBackup(document(withLoans(loan(L2, 'Remota')))).replace('"version": 1', '"version": 99');
    h.provider.writeRemote(REMOTE_FILE_NAME, serializeEnvelope(await encrypt(key, future)));
    await expectError(h, 'UnsupportedVersion');
  });

  it('a remote file that is not an envelope gives InvalidRemote', async () => {
    const h = setup();
    h.provider.writeRemote(REMOTE_FILE_NAME, 'not json at all');
    await expectError(h, 'InvalidRemote');
    const h2 = setup();
    h2.provider.writeRemote(REMOTE_FILE_NAME, serializeBackup(document(withLoans(loan(L2, 'Remota')))));
    await expectError(h2, 'InvalidRemote');
  });

  it('a decrypted payload that fails parseBackup gives InvalidRemote', async () => {
    const h = setup();
    h.provider.writeRemote(REMOTE_FILE_NAME, serializeEnvelope(await encrypt(key, '{"format":"cuotascasa"}')));
    await expectError(h, 'InvalidRemote');
    const h2 = setup();
    h2.provider.writeRemote(REMOTE_FILE_NAME, serializeEnvelope(await encrypt(key, 'plain words')));
    await expectError(h2, 'InvalidRemote');
  });

  it('an envelope with an unknown version gives UnsupportedVersion', async () => {
    const h = setup();
    const envelope = await encrypt(key, serializeBackup(document(empty)));
    h.provider.writeRemote(REMOTE_FILE_NAME, JSON.stringify({ ...envelope, v: 2 }));
    await expectError(h, 'UnsupportedVersion');
  });

  it('an envelope below the iteration floor gives WeakParams', async () => {
    const h = setup();
    const weak = await deriveStoredKey('frase de prueba', { iterations: 2, saltId: key.saltId });
    h.provider.writeRemote(REMOTE_FILE_NAME, serializeEnvelope(await encrypt(weak, serializeBackup(document(empty)))));
    await expectError(h, 'WeakParams');
  });

  it('an envelope above the iteration cap gives WeakParams without deriving', async () => {
    const h = setup();
    const envelope = await encrypt(key, serializeBackup(document(empty)));
    const hostile = { ...envelope, kdf: { ...envelope.kdf, iterations: 2_000_000_000 } };
    h.provider.writeRemote(REMOTE_FILE_NAME, JSON.stringify(hostile));
    await expectError(h, 'WeakParams');
  });

  it('rejects only on a programming error and restores the previous status', async () => {
    const h = setup();
    h.local.read = () => Promise.reject(new TypeError('boom'));
    const before = h.session.getStatus();
    await expect(h.session.sync()).rejects.toThrow(TypeError);
    expect(h.session.getStatus()).toEqual(before);
    // the single-flight guard is released
    await expect(h.session.sync()).rejects.toThrow(TypeError);
  });
});

describe('single flight and status', () => {
  it('coalesces concurrent calls in one tab into one run', async () => {
    const h = setup();
    const [a, b, c] = await Promise.all([h.session.sync(), h.session.sync(), h.session.sync()]);
    expect(b).toBe(a);
    expect(c).toBe(a);
    expect(h.provider.calls.filter((x) => x.startsWith('createFile'))).toHaveLength(1);
    expect(h.local.reads).toBe(1);
    expect(h.locks.requests).toEqual([SYNC_LOCK_NAME]);
  });

  it('runs a new sync after the previous one finished', async () => {
    const h = setup();
    await h.session.sync();
    h.clock.current = LATER;
    await h.session.sync();
    expect(h.local.reads).toBe(2);
  });

  it('coalesces across two tabs sharing the lock manager and the stores', async () => {
    const locks = createFakeLocks();
    const first = setup({ locks });
    const second = setup({ locks, provider: first.provider, local: first.local });
    const [a, b] = await Promise.all([first.session.sync(), second.session.sync()]);
    expect(uploads(first.provider)).toEqual(['createFile:cuotascasa.json']);
    expect(first.local.reads).toBe(1);
    expect(first.local.syncedAt).toHaveLength(1);
    expect(a.status.state).toBe('idle');
    expect(b.status).toEqual({ state: 'idle', pendingChanges: 0, lastSyncAt: NOW });
    expect(locks.requests).toEqual([SYNC_LOCK_NAME, SYNC_LOCK_NAME]);
  });

  it('a second tab still runs when the first one failed', async () => {
    const locks = createFakeLocks();
    const first = setup({ locks });
    const second = setup({ locks, provider: first.provider, local: first.local });
    first.provider.failNext('findFile', 'NetworkError');
    const [a, b] = await Promise.all([first.session.sync(), second.session.sync()]);
    expect(a.status.state).toBe('offline');
    expect(b.status.state).toBe('idle');
  });

  it('notifies subscribers with syncing and then the outcome, and stops after unsubscribe', async () => {
    const h = setup();
    const seen: SyncStatus[] = [];
    const unsubscribe = h.session.subscribe((status) => seen.push(status));
    await h.session.sync();
    expect(seen.map((s) => s.state)).toEqual(['syncing', 'idle']);
    unsubscribe();
    h.clock.current = LATER;
    await h.session.sync();
    expect(seen).toHaveLength(2);
  });

  it('a throwing listener does not break the run', async () => {
    const h = setup();
    h.session.subscribe(() => {
      throw new Error('listener');
    });
    expect((await h.session.sync()).status.state).toBe('idle');
  });
});
