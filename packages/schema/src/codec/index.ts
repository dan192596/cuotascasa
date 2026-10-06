import type { BackupDocument, BackupError, ParsedBackup, Result } from '../backup/types.ts';
import { NotImplementedError } from '../errors.ts';

/** Stub owned by W1-03: parse, detect version, migrate to LATEST_VERSION and validate; never throws once implemented. */
export function parseBackup(input: unknown): Result<ParsedBackup, BackupError> {
  void input;
  throw new NotImplementedError('W1-03');
}

/** Stub owned by W1-03: canonical, stably ordered JSON without the synthetic flag. */
export function serializeBackup(document: BackupDocument): string {
  void document;
  throw new NotImplementedError('W1-03');
}
