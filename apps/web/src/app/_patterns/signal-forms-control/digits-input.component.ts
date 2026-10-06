import {
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
  input,
  model,
  output,
  viewChild,
} from '@angular/core';
import { type FormValueControl, transformedValue, type ValidationError } from '@angular/forms/signals';

/**
 * GOLDEN PATTERN · Signal Forms custom control (docs/specs/angular-patterns.md §1).
 * The model is a canonical string (never a JS number); the raw text is parsed with transformedValue, whose parse
 * errors reach the bound field automatically. Errors are announced through aria-describedby.
 */
@Component({
  selector: 'cc-pattern-digits-input',
  template: `
    <input
      #control
      [id]="inputId()"
      inputmode="numeric"
      [value]="raw()"
      [attr.aria-required]="required() || null"
      [attr.aria-invalid]="touched() && shownErrors().length > 0"
      [attr.aria-describedby]="touched() && shownErrors().length > 0 ? inputId() + '-errors' : null"
      (input)="onInput($event)"
      (blur)="touch.emit()"
    />
    @if (touched() && shownErrors().length > 0) {
      <ul [id]="inputId() + '-errors'" class="errors">
        @for (error of shownErrors(); track $index) {
          <li>{{ error.message }}</li>
        }
      </ul>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DigitsInputComponent implements FormValueControl<string> {
  /** Canonical value: digits only, '' when empty. */
  readonly value = model.required<string>();
  readonly errors = input<readonly ValidationError.WithOptionalFieldTree[]>([]);
  readonly touched = input(false);
  readonly touch = output<void>();
  readonly inputId = input('cc-digits');
  /** Bound by [formField] from the field's required() rule; announced with aria-required, never native validation. */
  readonly required = input(false);

  protected readonly raw = transformedValue(this.value, {
    parse: (text: string) => {
      const compact = text.replaceAll(',', '').trim();
      return /^\d*$/.test(compact)
        ? { value: compact }
        : { error: { kind: 'digits', message: 'Escribe solo dígitos, sin letras ni signos.' } };
    },
    format: (value: string) => value,
  });
  /** While the text does not parse, only its parse error: the other rules judge the last valid model, not the text. */
  protected readonly shownErrors = computed(() =>
    this.raw.parseErrors().length > 0 ? this.raw.parseErrors() : this.errors(),
  );
  private readonly control = viewChild.required<ElementRef<HTMLInputElement>>('control');

  /** FormUiControl.focus(): focusBoundControl() and a form's onInvalid reach the inner <input>, not the host. */
  focus(options?: FocusOptions): void {
    this.control().nativeElement.focus(options);
  }

  protected onInput(event: Event): void {
    this.raw.set((event.target as HTMLInputElement).value);
  }
}
