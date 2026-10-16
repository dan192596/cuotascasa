import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { FieldTree } from '@angular/forms/signals';

/**
 * Error list of a native control, with the same contract as the ui/ controls: shown once the field is touched, with
 * id `<controlId>-errors` so the control can point at it with aria-describedby.
 */
@Component({
  selector: 'cc-field-errors',
  template: `
    @if (visible()) {
      <ul class="errors" [id]="controlId() + '-errors'">
        @for (error of errors(); track $index) {
          <li>{{ error.message }}</li>
        }
      </ul>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .errors {
      margin: 0.25rem 0 0;
      padding: 0;
      list-style: none;
      color: var(--cc-color-danger);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FieldErrorsComponent {
  readonly field = input.required<FieldTree<unknown>>();
  readonly controlId = input.required<string>();

  protected readonly errors = computed(() => this.field()().errors());
  protected readonly visible = computed(() => this.field()().touched() && this.errors().length > 0);
}
