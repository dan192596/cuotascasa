import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { Uuid } from '@cuotascasa/schema';

/** Inert W0-05 stub; W5-02 replaces it keeping data-testid='page-schedule' and the `id` route input. */
export const CC_STUB = 'CC_STUB:W5-02';

@Component({
  selector: 'cc-schedule-page',
  template: '<h1>Tabla de amortización</h1>',
  host: { 'data-testid': 'page-schedule', 'data-cc-stub': CC_STUB },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SchedulePageComponent {
  /** Route parameter :id, inherited from 'prestamos/:id/tabla'. */
  readonly id = input.required<Uuid>();
}
