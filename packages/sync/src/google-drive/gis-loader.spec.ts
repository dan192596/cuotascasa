import { describe, expect, it, vi } from 'vitest';
import { SyncError } from '../ports.ts';
import { createGisFake } from '../testing/index.ts';
import {
  GIS_LOADER_POLICY_NAME,
  GIS_SCRIPT_URL,
  createGisLoader,
  type GisLoaderDeps,
  type GisScriptElement,
  type TrustedTypesLike,
} from './gis-loader.ts';

function setup(options: { withTrustedTypes?: boolean; policyAlreadyCreated?: boolean } = {}) {
  const gis = createGisFake();
  const scripts: GisScriptElement[] = [];
  const target: { google?: unknown } = {};
  const policies: { name: string; createScriptURL: (input: string) => unknown }[] = [];
  const trustedTypes: TrustedTypesLike = {
    createPolicy: vi.fn((name: string, rules: { createScriptURL: (input: string) => unknown }) => {
      policies.push({ name, createScriptURL: rules.createScriptURL });
      return { createScriptURL: (input: string) => ({ trusted: rules.createScriptURL(input) }) };
    }),
  };
  const deps: GisLoaderDeps = {
    createScript: () => {
      const script: GisScriptElement = { async: false, src: '', onload: null, onerror: null, remove: vi.fn() };
      return script;
    },
    appendScript: (script) => {
      scripts.push(script);
    },
    getOAuth2: () => (target as { google?: { accounts: { oauth2: typeof gis.oauth2 } } }).google?.accounts.oauth2,
    trustedTypes: options.withTrustedTypes === false ? undefined : trustedTypes,
  };
  return { gis, scripts, target, policies, trustedTypes, deps };
}

describe('createGisLoader', () => {
  it('injects nothing until the loader is called', () => {
    const env = setup();
    createGisLoader(env.deps);
    expect(env.scripts).toHaveLength(0);
    expect(env.trustedTypes.createPolicy).not.toHaveBeenCalled();
  });

  it('adds one async script through the cc-gis-loader policy and resolves with oauth2', async () => {
    const env = setup();
    const load = createGisLoader(env.deps);
    const pending = load();
    expect(env.scripts).toHaveLength(1);
    const script = env.scripts[0] as GisScriptElement;
    expect(script.async).toBe(true);
    expect(script.src).toEqual({ trusted: GIS_SCRIPT_URL });
    expect(env.policies.map((policy) => policy.name)).toEqual([GIS_LOADER_POLICY_NAME]);
    env.gis.install(env.target);
    script.onload?.();
    await expect(pending).resolves.toBe(env.gis.oauth2);
  });

  it('GIS_LOADER_POLICY_NAME and the URL are the ADR-0021 values', () => {
    expect(GIS_LOADER_POLICY_NAME).toBe('cc-gis-loader');
    expect(GIS_SCRIPT_URL).toBe('https://accounts.google.com/gsi/client');
  });

  it('the policy accepts only the exact URL and throws TypeError otherwise', () => {
    const env = setup();
    void createGisLoader(env.deps)();
    const policy = env.policies[0];
    expect(policy?.createScriptURL(GIS_SCRIPT_URL)).toBe(GIS_SCRIPT_URL);
    for (const bad of [
      'https://accounts.google.com/gsi/client?x=1',
      'https://accounts.google.com/gsi/client/',
      'http://accounts.google.com/gsi/client',
      'https://evil.example/gsi/client',
      '',
    ]) {
      expect(() => policy?.createScriptURL(bad)).toThrow(TypeError);
    }
  });

  it('creates the policy once per document and reuses the loaded script', async () => {
    const env = setup();
    const load = createGisLoader(env.deps);
    const first = load();
    const second = load();
    env.gis.install(env.target);
    env.scripts[0]?.onload?.();
    await Promise.all([first, second]);
    await load();
    expect(env.scripts).toHaveLength(1);
    expect(env.trustedTypes.createPolicy).toHaveBeenCalledTimes(1);
  });

  it('two loaders on the same trustedTypes factory still create the policy once', () => {
    const env = setup();
    void createGisLoader(env.deps)();
    void createGisLoader(env.deps)();
    expect(env.trustedTypes.createPolicy).toHaveBeenCalledTimes(1);
  });

  it('falls back to the plain string without trustedTypes', () => {
    const env = setup({ withTrustedTypes: false });
    void createGisLoader(env.deps)();
    expect(env.scripts[0]?.src).toBe(GIS_SCRIPT_URL);
  });

  it('rejects with NetworkError when the script fails, removes it and allows a retry', async () => {
    const env = setup();
    const load = createGisLoader(env.deps);
    const failed = load();
    const script = env.scripts[0] as GisScriptElement;
    script.onerror?.();
    const error = await failed.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SyncError);
    expect((error as SyncError).code).toBe('NetworkError');
    expect(script.remove).toHaveBeenCalled();
    const retry = load();
    expect(env.scripts).toHaveLength(2);
    env.gis.install(env.target);
    env.scripts[1]?.onload?.();
    await expect(retry).resolves.toBe(env.gis.oauth2);
  });

  it('rejects with NetworkError when the script loads but google.accounts.oauth2 is missing', async () => {
    const env = setup();
    const load = createGisLoader(env.deps);
    const pending = load();
    env.scripts[0]?.onload?.();
    const error = await pending.catch((caught: unknown) => caught);
    expect((error as SyncError).code).toBe('NetworkError');
  });
});
