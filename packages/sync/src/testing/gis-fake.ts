import type { GisOAuth2, GisOverridableConfig, GisTokenClient, GisTokenClientConfig } from '../ports.ts';

/**
 * Frozen fake of google.accounts.oauth2 (token model, docs/specs/drive-api-subset.md). Popups are simulated:
 * the next user action decides whether the callback gets a token, an OAuth error, or error_callback runs.
 */
export type GisUserAction = 'approve' | 'deny' | 'close-popup' | 'block-popup';

export interface GisTokenRequestLog {
  readonly clientId: string;
  readonly scope: string;
  /** Effective prompt: the override if given, else the client config value (undefined when neither). */
  readonly prompt: string | undefined;
  /** True when the consent screen would show: no consent granted yet, or prompt 'consent'. */
  readonly consentScreen: boolean;
  readonly action: GisUserAction;
}

export interface GisFakeOptions {
  /** Millisecond clock used for token expiry; default Date.now. */
  readonly now?: () => number;
  /** Token lifetime in seconds; default 3599 like Google. */
  readonly tokenLifetimeSeconds?: number;
}

export interface GisFake {
  readonly oauth2: GisOAuth2;
  /** Sets target.google = { accounts: { oauth2 } }, as the GIS script does on window. */
  install(target: object): void;
  /** Queues the user's answer to the next popups, in order; when empty the user approves. */
  queueUserActions(...actions: GisUserAction[]): void;
  isTokenValid(token: string): boolean;
  readonly requests: readonly GisTokenRequestLog[];
  readonly issuedTokens: readonly string[];
  readonly revokedTokens: readonly string[];
  reset(): void;
}

interface IssuedToken {
  readonly value: string;
  readonly expiresAt: number;
}

export function createGisFake(options: GisFakeOptions = {}): GisFake {
  const now = options.now ?? (() => Date.now());
  const lifetime = options.tokenLifetimeSeconds ?? 3599;
  let actions: GisUserAction[] = [];
  let requests: GisTokenRequestLog[] = [];
  let issued: IssuedToken[] = [];
  let revoked: string[] = [];
  let consentGranted = false;
  let counter = 0;

  function popup(config: GisTokenClientConfig, overrides: GisOverridableConfig | undefined): void {
    const action = actions.shift() ?? 'approve';
    const prompt = overrides?.prompt ?? config.prompt;
    const scope = overrides?.scope ?? config.scope;
    requests = [
      ...requests,
      { clientId: config.client_id, scope, prompt, consentScreen: !consentGranted || prompt === 'consent', action },
    ];
    setTimeout(() => {
      switch (action) {
        case 'approve': {
          counter += 1;
          const value = `gis-fake-token-${String(counter)}`;
          issued = [...issued, { value, expiresAt: now() + lifetime * 1000 }];
          consentGranted = true;
          config.callback({ access_token: value, expires_in: lifetime, scope, token_type: 'Bearer' });
          return;
        }
        case 'deny':
          config.callback({ error: 'access_denied', error_description: 'The user denied the request' });
          return;
        case 'close-popup':
          config.error_callback?.({ type: 'popup_closed', message: 'Popup window closed' });
          return;
        case 'block-popup':
          config.error_callback?.({ type: 'popup_failed_to_open', message: 'Failed to open popup window' });
          return;
      }
    }, 0);
  }

  const oauth2: GisOAuth2 = {
    initTokenClient(config: GisTokenClientConfig): GisTokenClient {
      return {
        requestAccessToken(overrides?: GisOverridableConfig): void {
          popup(config, overrides);
        },
      };
    },
    revoke(accessToken: string, done?: () => void): void {
      if (issued.some((token) => token.value === accessToken) && !revoked.includes(accessToken)) {
        revoked = [...revoked, accessToken];
        consentGranted = false;
      }
      setTimeout(() => done?.(), 0);
    },
  };

  return {
    oauth2,
    install(target) {
      (target as { google?: unknown }).google = { accounts: { oauth2 } };
    },
    queueUserActions(...next) {
      actions = [...actions, ...next];
    },
    isTokenValid(token) {
      const found = issued.find((candidate) => candidate.value === token);
      return found !== undefined && !revoked.includes(token) && now() < found.expiresAt;
    },
    get requests() {
      return requests;
    },
    get issuedTokens() {
      return issued.map((token) => token.value);
    },
    get revokedTokens() {
      return revoked;
    },
    reset() {
      actions = [];
      requests = [];
      issued = [];
      revoked = [];
      consentGranted = false;
      counter = 0;
    },
  };
}
