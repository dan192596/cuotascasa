/**
 * Frozen composition of the data layer (W0-05). app-area.routes.ts installs it as a route provider of /app, so
 * Dexie, sync and export code never enter the graph of '/' (ADR-0011 decision 5).
 */
import { type EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { provideBackup } from './backup/provide-backup.ts';
import { provideEngineFacade } from './engine/provide-engine-facade.ts';
import { provideDataStores } from './providers/provide-data-stores.ts';
import { provideStores } from './stores/provide-stores.ts';
import { provideSync } from './sync/provide-sync.ts';

export function provideAppData(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideDataStores(),
    provideStores(),
    provideEngineFacade(),
    provideBackup(),
    provideSync(),
  ]);
}
