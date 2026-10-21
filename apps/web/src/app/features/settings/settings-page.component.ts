import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SettingsBackupComponent } from './backup/settings-backup.component.ts';
import { SettingsDeviceComponent } from './device/settings-device.component.ts';
import { SettingsSyncComponent } from './sync/settings-sync.component.ts';

/** Frozen page shell of /app/ajustes (W0-05): backup (W5-07), Drive sync (W5-08) and device data (W7-04). */
@Component({
  selector: 'cc-settings-page',
  imports: [SettingsBackupComponent, SettingsSyncComponent, SettingsDeviceComponent],
  template: `
    <h1>Ajustes</h1>
    <cc-settings-backup />
    <cc-settings-sync />
    <cc-settings-device />
  `,
  host: { 'data-testid': 'page-settings' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPageComponent {}
