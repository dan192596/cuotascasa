import { EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SwUpdate } from '@angular/service-worker';
import { describe, expect, it } from 'vitest';
import { loadSwUpdate } from './pwa-runtime.ts';

describe('pwa-runtime (lazy chunk, ADR-0023)', () => {
  it('provides SwUpdate from a child injector, once per root injector', async () => {
    const parent = TestBed.inject(EnvironmentInjector);
    const first = await loadSwUpdate(parent, true);
    expect(first).toBeInstanceOf(SwUpdate);
    expect(await loadSwUpdate(parent, true)).toBe(first);
  });

  it('is null when the service worker is disabled', async () => {
    expect(await loadSwUpdate(TestBed.inject(EnvironmentInjector), false)).toBeNull();
  });
});
