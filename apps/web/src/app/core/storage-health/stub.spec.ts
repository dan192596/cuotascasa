import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { STORAGE_HEALTH } from '../../data/tokens.ts';
import { CC_STUB, provideStorageHealth } from './provide-storage-health.ts';

describe('provideStorageHealth (inert W0-05 stub, W3-13)', () => {
  it('knows nothing and never asks navigator.storage to persist', async () => {
    TestBed.configureTestingModule({ providers: [provideStorageHealth()] });
    const health = TestBed.inject(STORAGE_HEALTH);
    expect(CC_STUB).toBe('CC_STUB:W3-13');
    expect(health.persisted()).toBeNull();
    expect(health.estimate()).toBeNull();
    expect(health.safariNonStandalone()).toBe(false);
    await expect(health.requestPersist()).resolves.toBe(false);
  });
});
