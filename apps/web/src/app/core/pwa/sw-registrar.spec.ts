import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import {
  SW_CONTAINER,
  SW_POLICY_NAME,
  SW_SCRIPT_URL,
  type ServiceWorkerContainerLike,
  SwRegistrar,
  TRUSTED_TYPES,
  type TrustedTypesLike,
} from './sw-registrar.ts';

function setup(trustedTypes: TrustedTypesLike | null) {
  const register = vi.fn<ServiceWorkerContainerLike['register']>(() => Promise.resolve({}));
  TestBed.configureTestingModule({
    providers: [
      { provide: SW_CONTAINER, useValue: { register } },
      { provide: TRUSTED_TYPES, useValue: trustedTypes },
    ],
  });
  return { register, registrar: TestBed.inject(SwRegistrar) };
}

function fakeTrustedTypes() {
  const createPolicy = vi.fn((name: string, rules: { createScriptURL: (input: string) => string }) => ({
    name,
    createScriptURL: (input: string) => ({ trusted: rules.createScriptURL(input) }),
  }));
  return { createPolicy };
}

describe('SwRegistrar', () => {
  it('registers /ngsw-worker.js with scope / through a cc-sw-loader policy', async () => {
    const trustedTypes = fakeTrustedTypes();
    const { register, registrar } = setup(trustedTypes);
    await registrar.register();
    expect(SW_POLICY_NAME).toBe('cc-sw-loader');
    expect(trustedTypes.createPolicy).toHaveBeenCalledTimes(1);
    expect(trustedTypes.createPolicy.mock.calls[0]?.[0]).toBe('cc-sw-loader');
    expect(register).toHaveBeenCalledWith({ trusted: SW_SCRIPT_URL }, { scope: '/' });
  });

  it('creates the policy once per document, however many times it registers', async () => {
    const trustedTypes = fakeTrustedTypes();
    const { registrar } = setup(trustedTypes);
    await registrar.register();
    await registrar.register();
    expect(trustedTypes.createPolicy).toHaveBeenCalledTimes(1);
  });

  it('the policy accepts only the worker script URL', async () => {
    const trustedTypes = fakeTrustedTypes();
    const { registrar } = setup(trustedTypes);
    await registrar.register();
    const rules = trustedTypes.createPolicy.mock.calls[0]?.[1];
    expect(rules?.createScriptURL(SW_SCRIPT_URL)).toBe(SW_SCRIPT_URL);
    expect(() => rules?.createScriptURL('/evil.js')).toThrow(TypeError);
    expect(() => rules?.createScriptURL('https://example.test/ngsw-worker.js')).toThrow(TypeError);
  });

  it('falls back to the plain string when the browser has no Trusted Types', async () => {
    const { register, registrar } = setup(null);
    await registrar.register();
    expect(register).toHaveBeenCalledWith(SW_SCRIPT_URL, { scope: '/' });
  });

  it('does nothing when the browser has no service workers', async () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: SW_CONTAINER, useValue: null },
        { provide: TRUSTED_TYPES, useValue: null },
      ],
    });
    await expect(TestBed.inject(SwRegistrar).register()).resolves.toBeUndefined();
  });
});
