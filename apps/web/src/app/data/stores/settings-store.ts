import { computed, type Signal } from '@angular/core';
import { DEFAULT_DEVICE_SETTINGS_VALUES, type DeviceSettingsValues, type ThemePreference } from '@cuotascasa/schema';
import type { SettingsStore } from '../api.ts';
import type { StoresRuntime } from './store-runtime.ts';

export class SettingsStoreImpl implements SettingsStore {
  readonly ready: Signal<boolean>;
  readonly device: Signal<DeviceSettingsValues>;
  readonly theme: Signal<ThemePreference>;

  private readonly runtime: StoresRuntime;

  constructor(runtime: StoresRuntime) {
    this.runtime = runtime;
    this.ready = runtime.ready;
    this.device = runtime.device;
    this.theme = computed(() => runtime.device().theme);
  }

  async saveDevice(values: DeviceSettingsValues): Promise<void> {
    await this.runtime.write(['settings'], (store) => store.settings.saveDevice(values));
  }

  /** Reads the current device settings inside the queued write, so a concurrent saveDevice is never overwritten. */
  async setTheme(theme: ThemePreference): Promise<void> {
    await this.runtime.write(['settings'], (store) =>
      store.transaction(async (tx) => {
        const current = await tx.settings.getDevice();
        const values: DeviceSettingsValues = current
          ? { theme: current.theme, driveSyncEnabled: current.driveSyncEnabled }
          : DEFAULT_DEVICE_SETTINGS_VALUES;
        await tx.settings.saveDevice({ ...values, theme });
      }),
    );
  }
}
