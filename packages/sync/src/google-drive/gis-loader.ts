import { SyncError, type GisOAuth2 } from '../ports.ts';

/**
 * Lazy loader of the Google Identity Services script (ADR-0021 decision 3). The script is added only when the loader
 * runs (the user connects Drive), with a `src` that comes from the Trusted Types policy `cc-gis-loader`, which accepts
 * the exact GIS URL and nothing else. No `default` policy, no static script tag.
 */
export const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
export const GIS_LOADER_POLICY_NAME = 'cc-gis-loader';

/** Minimal Trusted Types surface (no dependency on lib typings). */
export interface TrustedTypesLike {
  createPolicy(
    name: string,
    rules: { createScriptURL: (input: string) => string },
  ): { createScriptURL(input: string): unknown };
}

/** The subset of HTMLScriptElement the loader drives. `src` takes a string or a TrustedScriptURL. */
export interface GisScriptElement {
  async: boolean;
  src: unknown;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  remove(): void;
}

export interface GisLoaderDeps {
  createScript(): GisScriptElement;
  appendScript(script: GisScriptElement): void;
  /** window.google?.accounts?.oauth2 */
  getOAuth2(): GisOAuth2 | undefined;
  /** window.trustedTypes; undefined when the browser has none. */
  trustedTypes: TrustedTypesLike | undefined;
}

type ScriptUrlPolicy = { createScriptURL(input: string): unknown };

/** One policy per document (per factory): creating the same name twice throws without 'allow-duplicates'. */
const policies = new WeakMap<TrustedTypesLike, ScriptUrlPolicy>();

function gisPolicy(trustedTypes: TrustedTypesLike): ScriptUrlPolicy {
  const existing = policies.get(trustedTypes);
  if (existing !== undefined) {
    return existing;
  }
  const created = trustedTypes.createPolicy(GIS_LOADER_POLICY_NAME, {
    createScriptURL: (input: string): string => {
      if (input !== GIS_SCRIPT_URL) {
        throw new TypeError(`${GIS_LOADER_POLICY_NAME} only allows ${GIS_SCRIPT_URL}`);
      }
      return input;
    },
  });
  policies.set(trustedTypes, created);
  return created;
}

function browserDeps(): GisLoaderDeps {
  const scope = globalThis as unknown as {
    google?: { accounts?: { oauth2?: GisOAuth2 } };
    trustedTypes?: TrustedTypesLike;
  };
  return {
    createScript: () => document.createElement('script') as unknown as GisScriptElement,
    appendScript: (script) => {
      document.head.appendChild(script as unknown as HTMLScriptElement);
    },
    getOAuth2: () => scope.google?.accounts?.oauth2,
    trustedTypes: scope.trustedTypes,
  };
}

export function createGisLoader(deps?: GisLoaderDeps): () => Promise<GisOAuth2> {
  let loaded: Promise<GisOAuth2> | null = null;

  function inject(resolvedDeps: GisLoaderDeps): Promise<GisOAuth2> {
    return new Promise<GisOAuth2>((resolve, reject) => {
      const script = resolvedDeps.createScript();
      script.async = true;
      script.src =
        resolvedDeps.trustedTypes === undefined
          ? GIS_SCRIPT_URL
          : gisPolicy(resolvedDeps.trustedTypes).createScriptURL(GIS_SCRIPT_URL);
      script.onload = () => {
        const oauth2 = resolvedDeps.getOAuth2();
        if (oauth2 === undefined) {
          script.remove();
          reject(new SyncError('NetworkError'));
          return;
        }
        resolve(oauth2);
      };
      script.onerror = () => {
        script.remove();
        reject(new SyncError('NetworkError'));
      };
      resolvedDeps.appendScript(script);
    });
  }

  return () => {
    if (loaded === null) {
      const attempt = inject(deps ?? browserDeps());
      loaded = attempt;
      attempt.catch(() => {
        if (loaded === attempt) {
          loaded = null;
        }
      });
    }
    return loaded;
  };
}
