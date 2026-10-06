import { ChangeDetectionStrategy, Component } from '@angular/core';
import { QuickSimulatorComponent } from '../simulator/quick-simulator.component.ts';

/** Inert W0-05 stub; W4-04 replaces it keeping data-testid='page-landing' and the <cc-quick-simulator> host. */
export const CC_STUB = 'CC_STUB:W4-04';

@Component({
  selector: 'cc-landing-page',
  imports: [QuickSimulatorComponent],
  template: '<h1>CuotasCasa</h1><cc-quick-simulator />',
  host: { 'data-testid': 'page-landing', 'data-cc-stub': CC_STUB },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingPageComponent {}
