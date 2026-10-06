import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Inert W0-05 stub; W4-06 replaces it keeping data-testid='page-dashboard'. */
export const CC_STUB = 'CC_STUB:W4-06';

@Component({
  selector: 'cc-dashboard-page',
  template: '<h1>Mis préstamos</h1>',
  host: { 'data-testid': 'page-dashboard', 'data-cc-stub': CC_STUB },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPageComponent {}
