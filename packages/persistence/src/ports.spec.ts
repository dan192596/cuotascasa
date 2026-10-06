import { describe, expect, it } from 'vitest';
import { PersistenceError, RecordNotFoundError, RecordValidationError, SnapshotNotFoundError } from './ports.ts';

describe('persistence errors', () => {
  it('carry typed codes and never echo record values', () => {
    const notFound = new RecordNotFoundError('loans', '10000000-0000-4000-8000-000000000001');
    expect(notFound).toBeInstanceOf(PersistenceError);
    expect(notFound.code).toBe('NOT_FOUND');
    const invalid = new RecordValidationError('loans', [{ path: ['principal'], message: 'Expected string' }]);
    expect(invalid.code).toBe('VALIDATION');
    expect(invalid.message).toBe('Invalid loans: principal');
    expect(new SnapshotNotFoundError('snapshot-1').code).toBe('SNAPSHOT_NOT_FOUND');
    expect(new PersistenceError('CLOSED', 'DataStore is closed').code).toBe('CLOSED');
  });
});
