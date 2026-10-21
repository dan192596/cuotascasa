import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { DataError } from '../api.ts';
import { DEVICE_DATA_SERVICE } from '../tokens.ts';
import { CC_STUB, provideDeviceData } from './provide-device-data.ts';

describe('provideDeviceData (inert stub, W7-04)', () => {
  it('provides DEVICE_DATA_SERVICE and rejects clearAll with NOT_IMPLEMENTED without deleting anything', async () => {
    TestBed.configureTestingModule({ providers: [provideDeviceData()] });
    const device = TestBed.inject(DEVICE_DATA_SERVICE);
    expect(CC_STUB).toBe('CC_STUB:W7-04');
    const outcome = device.clearAll();
    await expect(outcome).rejects.toBeInstanceOf(DataError);
    await expect(outcome).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
  });
});
