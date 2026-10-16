import type { SyncStatus } from '@cuotascasa/sync';
import { describe, expect, it } from 'vitest';
import { syncStatusText } from './sync-status-text.ts';

describe('syncStatusText (Spanish, es-GT; W5-08 asserts these strings literally)', () => {
  const cases: readonly [SyncStatus, string][] = [
    [{ state: 'not-configured' }, 'No configurado'],
    [{ state: 'disconnected' }, 'Drive desconectado'],
    [{ state: 'idle', pendingChanges: 3, lastSyncAt: null }, 'Cambios sin sincronizar (3)'],
    [{ state: 'idle', pendingChanges: 0, lastSyncAt: '2026-01-01T00:00:00.000Z' }, 'Sincronizado'],
    [{ state: 'idle', pendingChanges: 0, lastSyncAt: null }, 'Listo para sincronizar'],
    [{ state: 'syncing' }, 'Sincronizando…'],
    [{ state: 'offline', pendingChanges: 2 }, 'Cambios sin sincronizar (2)'],
    [{ state: 'offline', pendingChanges: 0 }, 'Sin conexión con Drive'],
    [{ state: 'needs-auth' }, 'Falta autorizar Drive'],
    [{ state: 'needs-passphrase', reason: 'no-key' }, 'Falta la frase de cifrado'],
    [{ state: 'needs-passphrase', reason: 'KeyMismatch' }, 'La frase cambió en otro dispositivo: ingrésala de nuevo'],
    [
      { state: 'needs-passphrase', reason: 'WrongPassphraseOrTamper' },
      'La frase no coincide con la copia de Drive: revísala e inténtalo de nuevo',
    ],
    [{ state: 'error', code: 'InvalidRemote' }, 'No se puede leer la copia de Drive. Tus datos locales no cambiaron.'],
    [
      { state: 'error', code: 'UnsupportedVersion' },
      'La copia de Drive es de una versión más nueva de la app. Actualiza la app. Tus datos locales no cambiaron.',
    ],
    [
      { state: 'error', code: 'WeakParams' },
      'La copia de Drive usa un cifrado más débil de lo permitido y no se leyó. Tus datos locales no cambiaron.',
    ],
  ];

  it.each(cases)('%j -> %s', (status, text) => {
    expect(syncStatusText(status)).toBe(text);
  });
});
