import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { STORAGE_HEALTH } from '../../data/tokens.ts';
import { provideStorageHealth } from './provide-storage-health.ts';
import { STORAGE_HEALTH_ENV, type StorageHealthEnv } from './storage-health-env.ts';

const SAFARI_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

function setup(env: Partial<StorageHealthEnv>) {
  const full: StorageHealthEnv = {
    browser: { userAgent: 'x', displayModeStandalone: false, navigatorStandalone: undefined },
    storage: undefined,
    ...env,
  };
  TestBed.configureTestingModule({
    providers: [provideStorageHealth(), { provide: STORAGE_HEALTH_ENV, useValue: full }],
  });
  return TestBed.inject(STORAGE_HEALTH);
}

describe('StorageHealthService', () => {
  it('reflects mocked persisted() and estimate()', async () => {
    const health = setup({
      storage: {
        persisted: vi.fn().mockResolvedValue(true),
        persist: vi.fn(),
        estimate: vi.fn().mockResolvedValue({ usage: 1024, quota: 4096 }),
      },
    });
    await vi.waitFor(() => expect(health.persisted()).toBe(true));
    await vi.waitFor(() => expect(health.estimate()).toEqual({ usageBytes: 1024, quotaBytes: 4096 }));
  });

  it('stays unknown when navigator.storage is missing', async () => {
    const health = setup({ storage: undefined });
    expect(health.persisted()).toBeNull();
    expect(health.estimate()).toBeNull();
    await expect(health.requestPersist()).resolves.toBe(false);
  });

  it('treats an estimate without usage or quota as unknown', async () => {
    const health = setup({
      storage: {
        persisted: vi.fn().mockResolvedValue(false),
        persist: vi.fn(),
        estimate: vi.fn().mockResolvedValue({}),
      },
    });
    await vi.waitFor(() => expect(health.persisted()).toBe(false));
    expect(health.estimate()).toBeNull();
  });

  it('survives rejecting storage calls', async () => {
    const health = setup({
      storage: {
        persisted: vi.fn().mockRejectedValue(new Error('x')),
        persist: vi.fn().mockRejectedValue(new Error('x')),
        estimate: vi.fn().mockRejectedValue(new Error('x')),
      },
    });
    await expect(health.requestPersist()).resolves.toBe(false);
    expect(health.persisted()).toBeNull();
    expect(health.estimate()).toBeNull();
  });

  it('calls persist() at most once per session and updates persisted', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    const health = setup({
      storage: { persisted: vi.fn().mockResolvedValue(false), persist, estimate: vi.fn().mockResolvedValue({}) },
    });
    const [a, b] = await Promise.all([health.requestPersist(), health.requestPersist()]);
    const c = await health.requestPersist();
    expect([a, b, c]).toEqual([true, true, true]);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(health.persisted()).toBe(true);
  });

  it('exposes safariNonStandalone from the injected probe', () => {
    const health = setup({
      browser: { userAgent: SAFARI_MAC, displayModeStandalone: false, navigatorStandalone: undefined },
    });
    expect(health.safariNonStandalone()).toBe(true);
  });

  it('a slow persisted() resolving after persist() does not overwrite true', async () => {
    let release: (v: boolean) => void = () => undefined;
    const slow = new Promise<boolean>((resolve) => (release = resolve));
    const health = setup({
      storage: {
        persisted: vi.fn().mockReturnValue(slow),
        persist: vi.fn().mockResolvedValue(true),
        estimate: vi.fn().mockResolvedValue({}),
      },
    });
    await health.requestPersist();
    expect(health.persisted()).toBe(true);
    release(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(health.persisted()).toBe(true);
  });
});
