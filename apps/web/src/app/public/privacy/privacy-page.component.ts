import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Inert W0-05 stub; W4-05 replaces it keeping data-testid='page-privacy' and the issuesUrl input. */
export const CC_STUB = 'CC_STUB:W4-05';

@Component({
  selector: 'cc-privacy-page',
  template: '<h1>Privacidad</h1>',
  host: { 'data-testid': 'page-privacy', 'data-cc-stub': CC_STUB },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivacyPageComponent {
  /** Route data from app.routes.ts (ISSUES_URL): the public Issues URL, '' until the deploy injects it. */
  readonly issuesUrl = input('');
}
