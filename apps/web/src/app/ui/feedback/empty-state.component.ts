import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * First-use / no-results placeholder. Project the explanation as content and the calls to action with the
 * `ccEmptyActions` attribute (for example `<button ccEmptyActions>`).
 */
@Component({
  selector: 'cc-empty-state',
  template: `
    <section class="empty" data-testid="empty-state">
      <h2 class="heading">{{ heading() }}</h2>
      <p class="description"><ng-content /></p>
      <div class="actions" data-testid="empty-actions"><ng-content select="[ccEmptyActions]" /></div>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.75rem;
      padding: 2rem 1rem;
      border: 1px dashed var(--cc-color-control-border);
      border-radius: 0.5rem;
      background: var(--cc-color-surface);
      text-align: center;
    }
    .heading {
      margin: 0;
      font-family: var(--cc-font-heading);
      font-size: 1.25rem;
      color: var(--cc-color-ink);
    }
    .description {
      margin: 0;
      max-width: 40ch;
      font-family: var(--cc-font-body);
      color: var(--cc-color-ink-muted);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 0.5rem;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyStateComponent {
  readonly heading = input.required<string>();
}
