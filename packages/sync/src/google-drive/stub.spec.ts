import { NotImplementedError } from '@cuotascasa/schema';
import { describe, expect, it } from 'vitest';
import { createDriveFake } from '../testing/drive-fake.ts';
import { createGisFake } from '../testing/gis-fake.ts';
import { createGoogleDriveProvider } from './index.ts';

describe('google-drive stub (owned by W2-09, deleted when implemented)', () => {
  it('createGoogleDriveProvider throws NotImplementedError naming W2-09', () => {
    const gis = createGisFake();
    const drive = createDriveFake();
    const options = {
      clientId: 'cliente-sintetico',
      loadGis: () => Promise.resolve(gis.oauth2),
      fetch: drive.fetch,
      now: () => 0,
    };
    expect(() => createGoogleDriveProvider(options)).toThrow(NotImplementedError);
    expect(() => createGoogleDriveProvider(options)).toThrow(/W2-09/);
  });
});
