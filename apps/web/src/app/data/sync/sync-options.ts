import { InjectionToken } from '@angular/core';
import type { GisOAuth2, LockManagerLike } from '@cuotascasa/sync';
import type * as DriveModule from '@cuotascasa/sync/google-drive';

/** The module `@cuotascasa/sync/google-drive`, loaded only by the dynamic import in sync-runtime.ts. */
export type DriveModuleShape = typeof DriveModule;

/**
 * Seams of the sync service. Production passes nothing: the build-time client ID, the real fetch, navigator.locks,
 * the global IndexedDB, 600 000 PBKDF2 iterations and the dynamic import of the Drive module. Tests (and only tests)
 * override them with the frozen Google fakes.
 */
export interface SyncOptions {
  /** Defaults to GOOGLE_OAUTH_CLIENT_ID (build-time define); '' means 'No configurado'. */
  readonly clientId?: string;
  /** Defaults to `import('@cuotascasa/sync/google-drive')`. */
  readonly loadDriveModule?: () => Promise<DriveModuleShape>;
  /** Defaults to the module's createGisLoader(); tests pass a loader backed by the GIS fake. */
  readonly loadGis?: () => Promise<GisOAuth2>;
  readonly fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  /** Millisecond clock of token expiry; defaults to Date.now. */
  readonly nowMs?: () => number;
  readonly locks?: LockManagerLike;
  /** IndexedDB factory of the key store; defaults to the global one. */
  readonly indexedDb?: IDBFactory;
  /** PBKDF2 iterations of a new key (default 600 000). Test seam: only tests pass less. */
  readonly iterations?: number;
  /** Lowest iteration count accepted from a remote envelope (default 600 000). Test seam. */
  readonly minIterations?: number;
  /** Written into the uploaded backup document. */
  readonly appVersion?: string;
}

export const SYNC_OPTIONS = new InjectionToken<SyncOptions>('SyncOptions');
