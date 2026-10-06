import { describe, expect, it } from 'vitest';
import { deviceSettingsExample, syncedSettingsExample } from '../__examples__/settings.example.ts';
import { withField } from '../test-support/with-field.ts';
import {
  DEFAULT_DEVICE_SETTINGS_VALUES,
  DEFAULT_SYNCED_SETTINGS_VALUES,
  DEVICE_SETTINGS_ID,
  SYNCED_SETTINGS_ID,
  deviceSettingsSchema,
  settingsSchema,
  syncedSettingsSchema,
} from './settings.ts';

describe('settingsSchema', () => {
  it('parses its synthetic examples, one per scope', () => {
    expect(settingsSchema.parse(syncedSettingsExample)).toEqual(syncedSettingsExample);
    expect(settingsSchema.parse(deviceSettingsExample)).toEqual(deviceSettingsExample);
  });

  it('has no money or business-date field and rejects a Date-typed instant field', () => {
    expect(
      settingsSchema.safeParse(withField(syncedSettingsExample, ['updatedAt'], new Date('2026-10-04T15:00:00.000Z')))
        .success,
    ).toBe(false);
    expect(
      settingsSchema.safeParse(withField(deviceSettingsExample, ['createdAt'], new Date('2026-10-04T15:00:00.000Z')))
        .success,
    ).toBe(false);
  });

  it('pins each scope to its fixed id', () => {
    expect(syncedSettingsExample.id).toBe(SYNCED_SETTINGS_ID);
    expect(deviceSettingsExample.id).toBe(DEVICE_SETTINGS_ID);
    expect(syncedSettingsSchema.safeParse(withField(syncedSettingsExample, ['id'], DEVICE_SETTINGS_ID)).success).toBe(
      false,
    );
    expect(deviceSettingsSchema.safeParse(withField(deviceSettingsExample, ['id'], SYNCED_SETTINGS_ID)).success).toBe(
      false,
    );
  });

  it('keeps synced and device-local fields apart', () => {
    expect(syncedSettingsSchema.safeParse(withField(syncedSettingsExample, ['theme'], 'dark')).success).toBe(false);
    expect(deviceSettingsSchema.safeParse(withField(deviceSettingsExample, ['activeScenarioByLoan'], {})).success).toBe(
      false,
    );
    expect(settingsSchema.safeParse(withField(deviceSettingsExample, ['theme'], 'sepia')).success).toBe(false);
    expect(
      settingsSchema.safeParse(withField(syncedSettingsExample, ['activeScenarioByLoan'], { 'loan-1': 'x' })).success,
    ).toBe(false);
  });

  it('exposes defaults for both scopes', () => {
    expect(DEFAULT_SYNCED_SETTINGS_VALUES).toEqual({ activeScenarioByLoan: {} });
    expect(DEFAULT_DEVICE_SETTINGS_VALUES).toEqual({ theme: 'system', driveSyncEnabled: false });
  });
});
