import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * First-use / no-results placeholder. Project the explanation as content and the calls to action with the
 * `ccEmptyActions` attribute (for example `<button ccEmptyActions>`). With `layout="mosaic"` the first action is the primary one.
 */
@Component({
  selector: 'cc-empty-state',
  template: `
    <section class="empty" data-testid="empty-state">
      <h2 class="heading">{{ heading() }}</h2>
      <p class="description"><ng-content /></p>
      <div class="actions" data-testid="empty-actions" [attr.data-layout]="layout()">
        <ng-content select="[ccEmptyActions]" />
      </div>
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
    .actions[data-layout='mosaic'] {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
      width: 100%;
      max-width: 36rem;
      gap: 0.75rem;
    }
    .actions[data-layout='mosaic'] ::ng-deep > * {
      min-height: 4rem;
      padding: 0.75rem 1rem;
      border: 0;
      border-radius: var(--cc-radius-block);
      background: var(--cc-color-soft);
      color: var(--cc-color-ink);
      font-family: var(--cc-font-heading);
      font-weight: 600;
      cursor: pointer;
    }
    .actions[data-layout='mosaic'] ::ng-deep > :first-child {
      background: var(--cc-color-accent);
      color: var(--cc-color-paper);
    }
    .actions[data-layout='mosaic'] ::ng-deep > :nth-child(3n) {
      background: var(--cc-color-highlight);
      color: var(--cc-color-on-color);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyStateComponent {
  readonly heading = input.required<string>();
  /** `mosaic` lays the actions out as colour blocks: primary in accent, the others in soft and highlight. */
  readonly layout = input<'plain' | 'mosaic'>('plain');
}
