import { describe, expect, it } from 'vitest';
import { GOOGLE_OAUTH_CLIENT_ID, ISSUES_URL } from './build-constants.ts';

describe('build-constants.ts', () => {
  it('reads the angular.json defines, empty outside the deploy (ADR-0015: no committed client ID)', () => {
    expect(GOOGLE_OAUTH_CLIENT_ID).toBe('');
    expect(ISSUES_URL).toBe('');
  });
});
