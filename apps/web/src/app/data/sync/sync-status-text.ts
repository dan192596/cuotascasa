import type { SyncStatus } from '@cuotascasa/sync';

/**
 * Spanish (es-GT) text of every SyncStatus (ADR-0008 decision 6). W5-08's e2e asserts these strings literally, so
 * they are the single definition. Texts never carry data from the remote file or the backup.
 */
const LOCAL_UNCHANGED = 'Tus datos locales no cambiaron.';

function pendingText(pendingChanges: number, whenNone: string): string {
  return pendingChanges > 0 ? `Cambios sin sincronizar (${String(pendingChanges)})` : whenNone;
}

export function syncStatusText(status: SyncStatus): string {
  switch (status.state) {
    case 'not-configured':
      return 'No configurado';
    case 'disconnected':
      return 'Drive desconectado';
    case 'idle':
      return pendingText(status.pendingChanges, status.lastSyncAt === null ? 'Listo para sincronizar' : 'Sincronizado');
    case 'syncing':
      return 'Sincronizando…';
    case 'offline':
      return pendingText(status.pendingChanges, 'Sin conexión con Drive');
    case 'needs-auth':
      return 'Falta autorizar Drive';
    case 'needs-passphrase':
      switch (status.reason) {
        case 'no-key':
          return 'Falta la frase de cifrado';
        case 'KeyMismatch':
          return 'La frase cambió en otro dispositivo: ingrésala de nuevo';
        case 'WrongPassphraseOrTamper':
          return 'La frase no coincide con la copia de Drive: revísala e inténtalo de nuevo';
      }
      break;
    case 'error':
      switch (status.code) {
        case 'InvalidRemote':
          return `No se puede leer la copia de Drive. ${LOCAL_UNCHANGED}`;
        case 'UnsupportedVersion':
          return `La copia de Drive es de una versión más nueva de la app. Actualiza la app. ${LOCAL_UNCHANGED}`;
        case 'WeakParams':
          return `La copia de Drive usa un cifrado más débil de lo permitido y no se leyó. ${LOCAL_UNCHANGED}`;
      }
      break;
  }
  return 'Estado de Drive desconocido';
}
