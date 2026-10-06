import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { Uuid } from '@cuotascasa/schema';

/** Inert W0-05 stub; W5-04 replaces it keeping the frozen contract (scenario-editor.contract.spec.ts). */
export const CC_STUB = 'CC_STUB:W5-04';

@Component({
  selector: 'cc-scenario-editor',
  template: '',
  host: { 'data-cc-stub': CC_STUB },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScenarioEditorComponent {
  readonly loanId = input.required<Uuid>();
}
