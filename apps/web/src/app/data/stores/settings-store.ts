import { computed, type Signal } from '@angular/core';
import type { DeviceSettingsValues, ThemePreference } from '@cuotascasa/schema';
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

  setTheme(theme: ThemePreference): Promise<void> {
    return this.saveDevice({ ...this.runtime.device(), theme });
  }
}
