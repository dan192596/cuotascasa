import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { Uuid } from '@cuotascasa/schema';

/** Inert W0-05 stub; W5-05 replaces it keeping the frozen contract (scenario-compare.contract.spec.ts). */
export const CC_STUB = 'CC_STUB:W5-05';

@Component({
  selector: 'cc-scenario-compare',
  template: '',
  host: { 'data-cc-stub': CC_STUB },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScenarioCompareComponent {
  readonly loanId = input.required<Uuid>();
}
