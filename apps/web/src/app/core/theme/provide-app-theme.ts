import { type EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { ThemeService } from './theme.service.ts';

/** Root ThemeService (system | light | dark). It does not see SETTINGS_STORE: cc-theme-toggle feeds it under /app. */
export function provideAppTheme(): EnvironmentProviders {
  return makeEnvironmentProviders([ThemeService]);
}
