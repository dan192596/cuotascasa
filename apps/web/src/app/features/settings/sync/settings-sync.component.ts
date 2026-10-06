import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Inert W0-05 stub; W5-08 replaces it keeping the frozen contract (settings-sync.contract.spec.ts). */
export const CC_STUB = 'CC_STUB:W5-08';

@Component({
  selector: 'cc-settings-sync',
  template: '',
  host: { 'data-cc-stub': CC_STUB },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsSyncComponent {}
