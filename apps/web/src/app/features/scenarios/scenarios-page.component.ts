import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { Uuid } from '@cuotascasa/schema';
import { ScenarioCompareComponent } from './compare/scenario-compare.component.ts';
import { ScenarioEditorComponent } from './editor/scenario-editor.component.ts';

/** Frozen page shell of /app/prestamos/:id/proyecciones (W0-05): editor (W5-04) and comparison (W5-05). */
@Component({
  selector: 'cc-scenarios-page',
  imports: [ScenarioEditorComponent, ScenarioCompareComponent],
  template: `
    <h1>Proyecciones</h1>
    <cc-scenario-editor [loanId]="id()" />
    <cc-scenario-compare [loanId]="id()" />
  `,
  host: { 'data-testid': 'page-scenarios' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScenariosPageComponent {
  /** Route parameter :id, inherited from 'prestamos/:id/proyecciones'. */
  readonly id = input.required<Uuid>();
}
