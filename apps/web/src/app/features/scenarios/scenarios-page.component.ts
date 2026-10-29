import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import type { Uuid } from '@cuotascasa/schema';
import { LOANS_STORE } from '../../data/tokens.ts';
import { ScenarioCompareComponent } from './compare/scenario-compare.component.ts';
import { ScenarioEditorComponent } from './editor/scenario-editor.component.ts';

/**
 * Page shell of /app/prestamos/:id/proyecciones (W0-05): editor (W5-04) and comparison (W5-05).
 * W9-09: the h1, the back link and the tab title say which loan the page belongs to.
 */
@Component({
  selector: 'cc-scenarios-page',
  imports: [ScenarioEditorComponent, ScenarioCompareComponent, RouterLink],
  template: `
    <h1>{{ heading() }}</h1>
    @if (alias() !== null) {
      <p>
        <a data-testid="back-to-loan" [routerLink]="'/app/prestamos/' + id()">← Volver al préstamo</a>
      </p>
    }
    <cc-scenario-editor [loanId]="id()" />
    <cc-scenario-compare [loanId]="id()" />
  `,
  host: { 'data-testid': 'page-scenarios' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScenariosPageComponent {
  /** Route parameter :id, inherited from 'prestamos/:id/proyecciones'. */
  readonly id = input.required<Uuid>();

  private readonly loans = inject(LOANS_STORE);
  private readonly title = inject(Title);

  protected readonly alias = computed(() => this.loans.loan(this.id())()?.name ?? null);
  protected readonly heading = computed(() => {
    const alias = this.alias();
    return alias === null ? 'Proyecciones' : `Proyecciones · ${alias}`;
  });

  constructor() {
    effect(() => {
      const alias = this.alias();
      if (alias !== null) this.title.setTitle(`Proyecciones · ${alias} · CuotasCasa`);
    });
  }
}
