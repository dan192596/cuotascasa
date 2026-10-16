import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { FieldTree } from '@angular/forms/signals';

/** Whether a plain control shows its errors: only once touched, like the ui/ controls (angular-patterns.md §1). */
export function fieldInvalid(field: FieldTree<unknown>): boolean {
  const state = field();
  return state.touched() && state.invalid();
}

/**
 * Error list of a plain `<input>`/`<select>`. The host carries the id that the control's `aria-describedby` points
 * to; it is empty (and hidden) until the field is touched and invalid.
 */
@Component({
  selector: 'cc-wizard-errors',
  template: `
    @if (shown()) {
      <ul class="cc-wiz-errors">
        @for (error of field()().errors(); track $index) {
          <li>{{ error.message }}</li>
        }
      </ul>
    }
  `,
  host: { '[hidden]': '!shown()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FieldErrorsComponent {
  readonly field = input.required<FieldTree<unknown>>();

  protected shown(): boolean {
    return fieldInvalid(this.field());
  }
}
