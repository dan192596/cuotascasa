import { NotImplementedError } from '@cuotascasa/schema';
import type { SyncSession, SyncSessionDeps } from '../ports.ts';

/** Stub owned by W2-08: the sync session orchestrator over the frozen ports. */
export function createSyncSession(deps: SyncSessionDeps): SyncSession {
  void deps;
  throw new NotImplementedError('W2-08');
}
