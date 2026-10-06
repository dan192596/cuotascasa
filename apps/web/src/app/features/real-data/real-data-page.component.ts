import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { Uuid } from '@cuotascasa/schema';
import { RealDataTimelineComponent } from './timeline/real-data-timeline.component.ts';

/** Frozen page shell of /app/prestamos/:id/datos-reales (W0-05). The timeline (W5-03) composes cc-event-form. */
@Component({
  selector: 'cc-real-data-page',
  imports: [RealDataTimelineComponent],
  template: '<h1>Datos reales</h1><cc-real-data-timeline [loanId]="id()" />',
  host: { 'data-testid': 'page-real-data' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RealDataPageComponent {
  /** Route parameter :id, inherited from 'prestamos/:id/datos-reales'. */
  readonly id = input.required<Uuid>();
}
