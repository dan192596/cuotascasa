import { type EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { DataError, type DeviceDataService } from '../api.ts';
import { DEVICE_DATA_SERVICE } from '../tokens.ts';

/** Inert stub registered by Opus with W7-04; W7-04 replaces this file (same export) and deletes stub.spec.ts. */
export const CC_STUB = 'CC_STUB:W7-04';

class InertDeviceDataService implements DeviceDataService {
  readonly ccStub = CC_STUB;
  clearAll(): Promise<never> {
    return Promise.reject(new DataError('NOT_IMPLEMENTED', CC_STUB));
  }
}

/** W7-04: «Borrar datos de este dispositivo». The stub never deletes anything and never touches Drive. */
export function provideDeviceData(): EnvironmentProviders {
  const service: DeviceDataService = new InertDeviceDataService();
  return makeEnvironmentProviders([{ provide: DEVICE_DATA_SERVICE, useValue: service }]);
}
