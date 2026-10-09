import { describe, expect, it } from 'vitest';
import { isAppUrl } from './app-url.ts';

describe('isAppUrl (ADR-0023 decision 2)', () => {
  it.each(['/app', '/app/', '/app/ajustes', '/app?x=1', '/app#top', '/app/prestamos/nuevo?x=1'])(
    '%s is inside /app',
    (url) => {
      expect(isAppUrl(url)).toBe(true);
    },
  );

  it.each(['/', '/privacidad', '/application', '/apps', '/no-existe', '/privacidad/app', ''])('%s is not', (url) => {
    expect(isAppUrl(url)).toBe(false);
  });
});
