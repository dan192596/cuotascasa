import type { DeviceSettings, SyncedSettings } from '../entities/settings.ts';
import { EXAMPLE_LOAN_ID, EXAMPLE_STAMPS } from './stamps.example.ts';

export const syncedSettingsExample: SyncedSettings = {
  id: '00000000-0000-4000-8000-000000000001',
  ...EXAMPLE_STAMPS,
  scope: 'synced',
  activeScenarioByLoan: { [EXAMPLE_LOAN_ID]: 'f0000000-0000-4000-8000-000000000001' },
};

export const deviceSettingsExample: DeviceSettings = {
  id: '00000000-0000-4000-8000-000000000002',
  ...EXAMPLE_STAMPS,
  scope: 'device',
  theme: 'system',
  driveSyncEnabled: false,
};
