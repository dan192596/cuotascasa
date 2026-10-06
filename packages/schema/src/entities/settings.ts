import { z } from 'zod';
import { baseRecordShape, uuidSchema } from '../common.ts';

/** Fixed ids: every device writes the same two settings records, so LWW merges them as one each. */
export const SYNCED_SETTINGS_ID = '00000000-0000-4000-8000-000000000001';
export const DEVICE_SETTINGS_ID = '00000000-0000-4000-8000-000000000002';

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export const themePreferenceSchema = z.enum(THEME_PREFERENCES);
export type ThemePreference = z.infer<typeof themePreferenceSchema>;

/**
 * Synced settings: merged by LWW like any record (ADR-0008) and imported from a backup.
 * activeScenarioByLoan maps a loan id to its active scenario id (one active scenario per loan, ADR-0005).
 */
export const syncedSettingsSchema = z.strictObject({
  ...baseRecordShape,
  id: z.literal(SYNCED_SETTINGS_ID),
  scope: z.literal('synced'),
  activeScenarioByLoan: z.record(uuidSchema, uuidSchema),
});
export type SyncedSettings = z.infer<typeof syncedSettingsSchema>;

/**
 * Device-local settings: never merged by sync (W1-06), never imported from a backup (ADR-0007 decision 6),
 * and never counted in pendingChanges or changesSinceBackup.
 */
export const deviceSettingsSchema = z.strictObject({
  ...baseRecordShape,
  id: z.literal(DEVICE_SETTINGS_ID),
  scope: z.literal('device'),
  theme: themePreferenceSchema,
  driveSyncEnabled: z.boolean(),
});
export type DeviceSettings = z.infer<typeof deviceSettingsSchema>;

export const settingsSchema = z.discriminatedUnion('scope', [syncedSettingsSchema, deviceSettingsSchema]);
export type Settings = z.infer<typeof settingsSchema>;

type SettingsStampField = 'id' | 'scope' | 'createdAt' | 'updatedAt' | 'updatedByDevice' | 'deletedAt';
export type SyncedSettingsValues = Omit<SyncedSettings, SettingsStampField>;
export type DeviceSettingsValues = Omit<DeviceSettings, SettingsStampField>;

export const DEFAULT_SYNCED_SETTINGS_VALUES: SyncedSettingsValues = { activeScenarioByLoan: {} };
export const DEFAULT_DEVICE_SETTINGS_VALUES: DeviceSettingsValues = { theme: 'system', driveSyncEnabled: false };
