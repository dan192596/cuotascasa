import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Inert W0-05 stub; W4-07 replaces it keeping data-testid='page-loan-new'. */
export const CC_STUB = 'CC_STUB:W4-07';

@Component({
  selector: 'cc-loan-wizard-page',
  template: '<h1>Nuevo préstamo</h1>',
  host: { 'data-testid': 'page-loan-new', 'data-cc-stub': CC_STUB },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoanWizardPageComponent {}
