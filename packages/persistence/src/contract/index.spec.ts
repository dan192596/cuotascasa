import { describe, expect, it } from 'vitest';
import * as contract from './index.ts';
import * as persistence from '../ports.ts';

describe('@cuotascasa/persistence entry points', () => {
  it('the root entry (ports.ts) exposes the error classes', () => {
    for (const name of ['PersistenceError', 'RecordNotFoundError', 'RecordValidationError', 'SnapshotNotFoundError']) {
      expect(persistence, name).toHaveProperty(name);
    }
  });

  it('the contract entry exposes the suite, its registry, the fakes and the samples', () => {
    for (const name of [
      'runDataStoreContract',
      'CONTRACT_CASES',
      'PORT_METHODS',
      'PORT_METHOD_IDS',
      'createManualClock',
      'createSequentialIds',
      'sequentialUuid',
      'sampleLoan',
      'sampleEvent',
      'sampleReportedBalance',
      'samplePayment',
      'sampleScenario',
    ]) {
      expect(contract, name).toHaveProperty(name);
    }
  });
});
