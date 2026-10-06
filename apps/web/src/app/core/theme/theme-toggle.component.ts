import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Inert W0-05 stub; W3-05 replaces it keeping the frozen contract (theme-toggle.contract.spec.ts). */
export const CC_STUB = 'CC_STUB:W3-05';

@Component({
  selector: 'cc-theme-toggle',
  template: '',
  host: { 'data-cc-stub': CC_STUB },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemeToggleComponent {}
