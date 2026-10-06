import { describe, expect, it } from 'vitest';
import * as testing from './index.ts';

describe('@cuotascasa/sync/testing entry point', () => {
  it('exposes both frozen Google fakes', () => {
    expect(testing).toHaveProperty('createDriveFake');
    expect(testing).toHaveProperty('createGisFake');
  });
});
