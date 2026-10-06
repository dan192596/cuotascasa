import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Inert W0-05 stub; W4-03 replaces it keeping the frozen contract (quick-simulator.contract.spec.ts). */
export const CC_STUB = 'CC_STUB:W4-03';

@Component({
  selector: 'cc-quick-simulator',
  template: '',
  host: { 'data-cc-stub': CC_STUB },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuickSimulatorComponent {}
