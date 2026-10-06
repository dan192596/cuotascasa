import { NotImplementedError } from '@cuotascasa/schema';
import { describe, expect, it } from 'vitest';
import type { EncryptedEnvelopeV1, StoredKey } from '../ports.ts';
import { createIndexedDbKeyStore, decrypt, deriveKey, encrypt } from './index.ts';

describe('crypto stub (owned by W1-07, deleted when implemented)', () => {
  const key = {} as StoredKey;
  const calls: [string, () => unknown][] = [
    ['deriveKey', () => deriveKey('frase de prueba', new Uint8Array(16))],
    ['encrypt', () => encrypt(key, 'texto')],
    ['decrypt', () => decrypt(key, {} as EncryptedEnvelopeV1)],
    ['createIndexedDbKeyStore', () => createIndexedDbKeyStore()],
  ];

  it.each(calls)('%s throws NotImplementedError naming W1-07', (_name, call) => {
    expect(call).toThrow(NotImplementedError);
    expect(call).toThrow(/W1-07/);
  });
});
