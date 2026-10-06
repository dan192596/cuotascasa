import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Inert W0-05 stub; W4-05 replaces it keeping data-testid='page-not-found'. */
export const CC_STUB = 'CC_STUB:W4-05';

@Component({
  selector: 'cc-not-found-page',
  template: '<h1>Página no encontrada</h1>',
  host: { 'data-testid': 'page-not-found', 'data-cc-stub': CC_STUB },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundPageComponent {}
