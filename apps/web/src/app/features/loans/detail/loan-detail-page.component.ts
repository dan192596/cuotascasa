import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { Uuid } from '@cuotascasa/schema';

/** Inert W0-05 stub; W5-01 replaces it keeping data-testid='page-loan-detail' and the `id` route input. */
export const CC_STUB = 'CC_STUB:W5-01';

@Component({
  selector: 'cc-loan-detail-page',
  template: '<h1>Préstamo</h1>',
  host: { 'data-testid': 'page-loan-detail', 'data-cc-stub': CC_STUB },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoanDetailPageComponent {
  /** Route parameter :id (withComponentInputBinding). */
  readonly id = input.required<Uuid>();
}
