import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Inert W0-05 stub; W3-13 replaces it keeping the frozen contract (safari-banner.contract.spec.ts). */
export const CC_STUB = 'CC_STUB:W3-13';

@Component({
  selector: 'cc-safari-banner',
  template: '',
  host: { 'data-cc-stub': CC_STUB },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SafariBannerComponent {}
