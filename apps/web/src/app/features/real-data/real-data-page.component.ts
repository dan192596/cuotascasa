import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import type { Uuid } from '@cuotascasa/schema';
import { LOANS_STORE } from '../../data/tokens.ts';
import { RealDataTimelineComponent } from './timeline/real-data-timeline.component.ts';

/**
 * Page shell of /app/prestamos/:id/datos-reales (W0-05). The timeline (W5-03) composes cc-event-form.
 * W9-09: the h1, the back link and the tab title say which loan the page belongs to.
 */
@Component({
  selector: 'cc-real-data-page',
  imports: [RealDataTimelineComponent, RouterLink],
  template: `
    <h1>{{ heading() }}</h1>
    @if (alias() !== null) {
      <p>
        <a data-testid="back-to-loan" [routerLink]="'/app/prestamos/' + id()">← Volver al préstamo</a>
      </p>
    }
    <cc-real-data-timeline [loanId]="id()" />
  `,
  host: { 'data-testid': 'page-real-data' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RealDataPageComponent {
  /** Route parameter :id, inherited from 'prestamos/:id/datos-reales'. */
  readonly id = input.required<Uuid>();

  private readonly loans = inject(LOANS_STORE);
  private readonly title = inject(Title);

  protected readonly alias = computed(() => this.loans.loan(this.id())()?.name ?? null);
  protected readonly heading = computed(() => {
    const alias = this.alias();
    return alias === null ? 'Datos reales' : `Datos reales · ${alias}`;
  });

  constructor() {
    effect(() => {
      const alias = this.alias();
      if (alias !== null) this.title.setTitle(`Datos reales · ${alias} · CuotasCasa`);
    });
  }
}
