import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Inert W0-05 stub; W5-07 replaces it keeping the frozen contract (settings-backup.contract.spec.ts). */
export const CC_STUB = 'CC_STUB:W5-07';

@Component({
  selector: 'cc-settings-backup',
  template: '',
  host: { 'data-cc-stub': CC_STUB },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsBackupComponent {}
