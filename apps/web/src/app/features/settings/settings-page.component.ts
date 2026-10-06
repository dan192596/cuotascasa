import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SettingsBackupComponent } from './backup/settings-backup.component.ts';
import { SettingsSyncComponent } from './sync/settings-sync.component.ts';

/** Frozen page shell of /app/ajustes (W0-05): backup (W5-07) and Drive sync (W5-08). */
@Component({
  selector: 'cc-settings-page',
  imports: [SettingsBackupComponent, SettingsSyncComponent],
  template: `
    <h1>Ajustes</h1>
    <cc-settings-backup />
    <cc-settings-sync />
  `,
  host: { 'data-testid': 'page-settings' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPageComponent {}
