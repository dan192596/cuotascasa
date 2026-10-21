import { TestBed } from '@angular/core/testing';
import type { DataStore } from '@cuotascasa/persistence';
import { createManualClock, createSequentialIds, sampleLoan } from '@cuotascasa/persistence/contract';
import { createInMemoryDataStore } from '@cuotascasa/persistence/memory';
import {
  type ActualPayment,
  type BackupData,
  type BackupDocument,
  type IsoInstant,
  LATEST_VERSION,
  type Loan,
  type LoanEvent,
  type ReportedBalance,
  type Scenario,
  serializeBackup,
  type Uuid,
} from '@cuotascasa/schema';
import { deriveStoredKey, encrypt, serializeEnvelope } from '@cuotascasa/sync/crypto';
import { describe, expect, it, vi } from 'vitest';
import type { BackupService, StorageHealth } from '../api.ts';
import { CLOCK, DATA_STORE, ID_GENERATOR } from '../data-layer.tokens.ts';
import { provideStores } from '../stores/provide-stores.ts';
import { BACKUP_SERVICE, STORAGE_HEALTH } from '../tokens.ts';
import { MAX_DATA_FILE_BYTES } from './backup-limits.ts';
import { provideBackup } from './provide-backup.ts';

const ITERATIONS = 1000;
const PASSPHRASE = 'frase de prueba ñandú';
const STAMP = '2026-10-04T15:00:00.000Z' as IsoInstant;
const DEVICE = 'd0000000-0000-4000-8000-000000000001' as Uuid;
const HEALTH: StorageHealth = {
  persisted: (() => null) as unknown as StorageHealth['persisted'],
  estimate: (() => null) as unknown as StorageHealth['estimate'],
  safariNonStandalone: (() => false) as unknown as StorageHealth['safariNonStandalone'],
  requestPersist: () => Promise.resolve(true),
};

async function world(): Promise<{ readonly store: DataStore; readonly backup: BackupService }> {
  const clock = createManualClock();
  const ids = createSequentialIds();
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
  return { store, backup };
}

/** A blob that claims `size` bytes and records every attempt to read it. */
class SizedBlob extends Blob {
  readonly reads = { text: vi.fn(), arrayBuffer: vi.fn(), stream: vi.fn() };
  private readonly claimed: number;

  constructor(claimed: number) {
    super(['{}'], { type: 'application/json' });
    this.claimed = claimed;
  }

  override get size(): number {
    return this.claimed;
  }

  override text(): Promise<string> {
    this.reads.text();
    return super.text();
  }

  override arrayBuffer(): Promise<ArrayBuffer> {
    this.reads.arrayBuffer();
    return super.arrayBuffer();
  }

  override stream(): ReadableStream<Uint8Array<ArrayBuffer>> {
    this.reads.stream();
    return super.stream();
  }
}

function oversize(size: number) {
  const blob = new SizedBlob(size);
  return { blob, reads: blob.reads };
}

function id(kind: number, n: number): Uuid {
  return `${kind.toString(16).padStart(8, '0')}-0000-4000-8000-${n.toString(16).padStart(12, '0')}` as Uuid;
}

const base = (kind: number, n: number, deleted: boolean) => ({
  id: id(kind, n),
  createdAt: STAMP,
  updatedAt: STAMP,
  updatedByDevice: DEVICE,
  deletedAt: deleted ? STAMP : null,
});

/**
 * Household at the high end: 10 loans, each with 360 payments (with breakdown), 360 reported balances, 100 events,
 * 20 scenarios of 50 events, and every 10th record a tombstone. Synthetic only.
 */
function largeHousehold(): BackupData {
  const loans: Loan[] = [];
  const events: LoanEvent[] = [];
  const reportedBalances: ReportedBalance[] = [];
  const payments: ActualPayment[] = [];
  const scenarios: Scenario[] = [];
  let n = 0;
  const next = (): number => (n += 1);
  for (let l = 0; l < 10; l += 1) {
    const loan = { ...base(1, next(), false), ...sampleLoan(), name: `Casa sintetica ${String(l)}` } as Loan;
    loans.push(loan);
    for (let k = 1; k <= 360; k += 1) {
      const month = String(((k - 1) % 12) + 1).padStart(2, '0');
      const date = `${String(2025 + Math.floor((k - 1) / 12))}-${month}-28`;
      payments.push({
        ...base(2, next(), k % 10 === 0),
        loanId: loan.id,
        paidDate: date,
        installmentNumber: k,
        total: '4658.47',
        breakdown: { capital: '1234.56', interest: '2916.67', insurance: '412.50', fixedCharges: '395.00' },
        note: 'Pago sintetico de prueba',
      } as ActualPayment);
      reportedBalances.push({
        ...base(3, next(), k % 10 === 0),
        loanId: loan.id,
        date,
        installmentNumber: k,
        balance: '499178.20',
        source: 'BANK_EMAIL',
      } as ReportedBalance);
    }
    for (let e = 0; e < 100; e += 1) {
      events.push({
        ...base(4, next(), e % 10 === 0),
        loanId: loan.id,
        type: 'Prepayment',
        date: '2026-01-15',
        amount: '20000.00',
        mode: 'REDUCE_TERM',
      } as LoanEvent);
    }
    for (let s = 0; s < 20; s += 1) {
      scenarios.push({
        ...base(5, next(), s % 10 === 0),
        loanId: loan.id,
        name: `Escenario sintetico ${String(s)}`,
        events: Array.from({ length: 50 }, (_, i) => ({
          id: id(6, next()),
          date: '2027-03-15',
          deletedAt: null,
          type: 'Prepayment',
          amount: '15000.00',
          mode: i % 2 === 0 ? 'REDUCE_TERM' : 'REDUCE_INSTALLMENT',
        })),
      } as Scenario);
    }
  }
  return { loans, events, reportedBalances, payments, scenarios, settings: [] };
}

describe('file-size cap on backup import (W7-03)', () => {
  it('rejects a file over the cap with INVALID_JSON, never reads it and writes nothing', async () => {
    const { store, backup } = await world();
    const { blob, reads } = oversize(MAX_DATA_FILE_BYTES + 1);
    const before = await store.exportAll();
    const result = await backup.previewImport(blob);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_JSON');
      expect(result.error.message).toBe('El archivo no es un respaldo válido: no se pudo leer su contenido.');
    }
    expect(reads.text).not.toHaveBeenCalled();
    expect(reads.arrayBuffer).not.toHaveBeenCalled();
    expect(reads.stream).not.toHaveBeenCalled();
    expect(await store.exportAll()).toEqual(before);
    expect(backup.changesSinceBackup()).toBe(0);
  });

  it('also refuses an encrypted-looking file over the cap even with a passphrase', async () => {
    const { backup } = await world();
    const { blob, reads } = oversize(MAX_DATA_FILE_BYTES * 2);
    const result = await backup.previewImport(blob, { passphrase: PASSPHRASE });
    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_JSON' } });
    expect(reads.text).not.toHaveBeenCalled();
  });

  it('a file of exactly the cap is read (the check is strictly "over")', async () => {
    const { backup } = await world();
    const { blob, reads } = oversize(MAX_DATA_FILE_BYTES);
    const result = await backup.previewImport(blob);
    expect(reads.text).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
  });
});

describe('sizing of a high-end household (W7-03)', () => {
  it('keeps at least 2x headroom under the cap and still previews and imports', async () => {
    const data = largeHousehold();
    const document: BackupDocument = {
      format: 'cuotascasa',
      version: LATEST_VERSION,
      exportedAt: STAMP,
      deviceId: DEVICE,
      appVersion: '1.0.0',
      data,
    };
    const plain = serializeBackup(document);
    const key = await deriveStoredKey(PASSPHRASE, { iterations: ITERATIONS });
    const envelope = serializeEnvelope(await encrypt(key, plain));
    const plainBytes = new TextEncoder().encode(plain).byteLength;
    const envelopeBytes = new TextEncoder().encode(envelope).byteLength;
    // Measured when this card landed (serializeBackup of the household above):
    //   plain JSON : 6952288 bytes (about 6.6 MiB)
    //   envelope   : 9269917 bytes (about 8.8 MiB; base64 of the ciphertext, 4/3 of the plain size)
    // The cap is MAX_DATA_FILE_BYTES = 20 MiB (20971520 bytes): 2.26x the envelope and 3.02x the plain file.
    expect(MAX_DATA_FILE_BYTES).toBe(20 * 1024 * 1024);
    expect(envelopeBytes).toBeGreaterThan(plainBytes);
    expect(MAX_DATA_FILE_BYTES / envelopeBytes).toBeGreaterThanOrEqual(2);
    expect(MAX_DATA_FILE_BYTES / plainBytes).toBeGreaterThanOrEqual(2);

    const { backup, store } = await world();
    const plainPreview = await backup.previewImport(new Blob([plain]));
    expect(plainPreview.ok).toBe(true);
    const encryptedPreview = await backup.previewImport(new Blob([envelope]), { passphrase: PASSPHRASE });
    expect(encryptedPreview.ok).toBe(true);
    if (encryptedPreview.ok) {
      await backup.confirmImport(encryptedPreview.value.id);
      expect((await store.exportAll()).payments).toHaveLength(data.payments.length);
    }
  }, 120_000);
});
