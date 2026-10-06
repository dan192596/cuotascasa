import type { BaseRecord } from '@cuotascasa/schema';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  PBKDF2_ITERATIONS,
  SYNC_ERROR_CODES,
  SyncError,
  TOMBSTONE_RETENTION_MS,
  canonicalJson,
  compareRecordOrder,
  recordOrderKey,
  type SyncStatus,
} from './ports.ts';

const DEVICE_A = 'd0000000-0000-4000-8000-00000000000a';
const DEVICE_B = 'd0000000-0000-4000-8000-00000000000b';

function version(updatedAt: string, device: string, deletedAt: string | null = null, extra: object = {}): BaseRecord {
  return {
    id: 'a0000000-0000-4000-8000-000000000001',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt,
    updatedByDevice: device,
    deletedAt,
    ...extra,
  } as BaseRecord;
}

describe('RecordOrderKey and compareRecordOrder (ADR-0024)', () => {
  it('extracts (updatedAt, updatedByDevice, isTombstone)', () => {
    expect(recordOrderKey(version('2026-10-04T15:00:00.000Z', DEVICE_A, '2026-10-04T15:00:00.000Z'))).toEqual({
      updatedAt: '2026-10-04T15:00:00.000Z',
      updatedByDevice: DEVICE_A,
      isTombstone: true,
    });
  });

  it('a later updatedAt wins, whatever the device or tombstone', () => {
    const older = version('2026-10-04T15:00:00.000Z', DEVICE_B, '2026-10-04T15:00:00.000Z');
    const newer = version('2026-10-04T15:00:00.001Z', DEVICE_A);
    expect(compareRecordOrder(newer, older)).toBeGreaterThan(0);
    expect(compareRecordOrder(older, newer)).toBeLessThan(0);
  });

  it('equal updatedAt: the greater updatedByDevice wins', () => {
    const a = version('2026-10-04T15:00:00.000Z', DEVICE_A);
    const b = version('2026-10-04T15:00:00.000Z', DEVICE_B);
    expect(compareRecordOrder(b, a)).toBeGreaterThan(0);
    expect(compareRecordOrder(a, b)).toBeLessThan(0);
  });

  it('full tie on (updatedAt, updatedByDevice): the tombstone wins', () => {
    const live = version('2026-10-04T15:00:00.000Z', DEVICE_A);
    const tombstone = version('2026-10-04T15:00:00.000Z', DEVICE_A, '2026-10-04T15:00:00.000Z');
    expect(compareRecordOrder(tombstone, live)).toBeGreaterThan(0);
    expect(compareRecordOrder(live, tombstone)).toBeLessThan(0);
  });

  it('still tied: the greater canonical JSON wins; identical versions compare 0', () => {
    const first = version('2026-10-04T15:00:00.000Z', DEVICE_A, null, { name: 'Casa A' });
    const second = version('2026-10-04T15:00:00.000Z', DEVICE_A, null, { name: 'Casa B' });
    expect(compareRecordOrder(second, first)).toBeGreaterThan(0);
    expect(compareRecordOrder(first, second)).toBeLessThan(0);
    expect(compareRecordOrder(first, { ...first })).toBe(0);
  });
});

describe('canonicalJson', () => {
  it('sorts keys recursively, keeps array order and drops undefined members', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: true, y: null }], c: 'x' }, u: undefined })).toBe(
      '{"a":{"c":"x","d":[3,{"y":null,"z":true}]},"b":1}',
    );
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
  });
});

describe('sync constants and errors', () => {
  it('pins the purge window, the KDF count and the error codes', () => {
    expect(TOMBSTONE_RETENTION_MS).toBe(7_776_000_000);
    expect(PBKDF2_ITERATIONS).toBe(600_000);
    expect(SYNC_ERROR_CODES).toEqual([
      'NetworkError',
      'AuthError',
      'KeyMismatch',
      'WrongPassphraseOrTamper',
      'UnsupportedVersion',
      'WeakParams',
      'InvalidRemote',
    ]);
  });

  it('the error status carries one of the three failure codes of a session run', () => {
    type ErrorStatus = Extract<SyncStatus, { readonly state: 'error' }>;
    expectTypeOf<ErrorStatus['code']>().toEqualTypeOf<'UnsupportedVersion' | 'WeakParams' | 'InvalidRemote'>();
    const status: SyncStatus = { state: 'error', code: 'InvalidRemote' };
    expect(status).toEqual({ state: 'error', code: 'InvalidRemote' });
  });

  it('SyncError carries its code and defaults its message to the code', () => {
    const error = new SyncError('KeyMismatch');
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('KeyMismatch');
    expect(error.message).toBe('KeyMismatch');
    expect(new SyncError('NetworkError', 'Drive request failed').message).toBe('Drive request failed');
  });
});
