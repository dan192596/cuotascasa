import { NotImplementedError } from '@cuotascasa/schema';
import type { GisOAuth2, SyncProvider } from '../ports.ts';

export interface GoogleDriveProviderOptions {
  /** Build-time OAuth client id (W3-17); empty means sync is not configured. */
  readonly clientId: string;
  /** Loads GIS on connect() only and returns google.accounts.oauth2 (ADR-0021 method). */
  readonly loadGis: () => Promise<GisOAuth2>;
  /** fetch implementation; tests pass driveFake.fetch. */
  readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  /** Millisecond clock for token expiry. */
  readonly now: () => number;
}

/** Stub owned by W2-09: Drive v3 appDataFolder provider on the GIS token model. */
export function createGoogleDriveProvider(options: GoogleDriveProviderOptions): SyncProvider {
  void options;
  throw new NotImplementedError('W2-09');
}
