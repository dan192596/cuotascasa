import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { Uuid } from '@cuotascasa/schema';

/** Inert W0-05 stub; W5-03 replaces it keeping the frozen contract (real-data-timeline.contract.spec.ts). */
export const CC_STUB = 'CC_STUB:W5-03';

@Component({
  selector: 'cc-real-data-timeline',
  template: '',
  host: { 'data-cc-stub': CC_STUB },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RealDataTimelineComponent {
  readonly loanId = input.required<Uuid>();
}
