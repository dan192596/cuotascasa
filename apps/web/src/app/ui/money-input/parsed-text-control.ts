import { computed, Directive, type ElementRef, input, model, output, viewChild } from '@angular/core';
import { type FormValueControl, type TransformedValueSignal, type ValidationError } from '@angular/forms/signals';

/**
 * Shared template of the text controls (golden pattern, docs/specs/angular-patterns.md §1). The host writes the
 * `<label for="<inputId>">`; errors are announced through aria-describedby="<inputId>-errors" once touched.
 */
export const PARSED_TEXT_TEMPLATE = `
  <span class="field">
    @if (prefix()) {
      <span class="affix" aria-hidden="true">{{ prefix() }}</span>
    }
    <input
      #control
      type="text"
      autocomplete="off"
      spellcheck="false"
      [id]="inputId()"
      [attr.inputmode]="inputMode"
      [attr.placeholder]="placeholder() || null"
      [value]="raw()"
      [disabled]="disabled()"
      [readOnly]="readonly()"
      [attr.aria-required]="required() || null"
      [attr.aria-invalid]="touched() && shownErrors().length > 0"
      [attr.aria-describedby]="touched() && shownErrors().length > 0 ? inputId() + '-errors' : null"
      (input)="onInput($event)"
      (blur)="touch.emit()"
    />
    @if (suffix()) {
      <span class="affix" aria-hidden="true">{{ suffix() }}</span>
    }
  </span>
  @if (touched() && shownErrors().length > 0) {
    <ul [id]="inputId() + '-errors'" class="errors" role="alert">
      @for (error of shownErrors(); track $index) {
        <li>{{ error.message }}</li>
      }
    </ul>
  }
`;

export const PARSED_TEXT_STYLES = `
  :host { display: block; }
  .field { display: inline-flex; align-items: center; gap: 0.25rem; }
  .affix { font-family: var(--cc-font-numeric); color: var(--cc-color-ink-muted); }
  input { font-family: var(--cc-font-numeric); font-variant-numeric: tabular-nums; }
  .errors { margin: 0.25rem 0 0; padding: 0; list-style: none; color: var(--cc-color-danger); }
`;

/**
 * Base of MoneyInput, DateInput and RateInput: a `FormValueControl<string>` whose canonical model is a decimal or
 * LocalDate string (never a number or `Date`). Subclasses declare `raw` with `transformedValue(this.value, …)`.
 */
@Directive()
export abstract class ParsedTextControl implements FormValueControl<string> {
  /** Canonical value ('' when empty). */
  readonly value = model.required<string>();
  readonly errors = input<readonly ValidationError.WithOptionalFieldTree[]>([]);
  readonly touched = input(false);
  readonly touch = output<void>();
  readonly inputId = input.required<string>();
  readonly placeholder = input('');
  /** Bound by [formField] from the field's required() rule; announced with aria-required, never native validation. */
  readonly required = input(false);
  readonly disabled = input(false);
  readonly readonly = input(false);

  /** Text shown in the <input>; its parse errors reach the bound field. */
  protected abstract readonly raw: TransformedValueSignal<string>;
  protected abstract readonly inputMode: 'decimal' | 'numeric';

  /** While the text does not parse, only its parse error: the other rules judge the last valid model, not the text. */
  protected readonly shownErrors = computed(() =>
    this.raw.parseErrors().length > 0 ? this.raw.parseErrors() : this.errors(),
  );
  private readonly control = viewChild.required<ElementRef<HTMLInputElement>>('control');

  protected prefix(): string {
    return '';
  }

  protected suffix(): string {
    return '';
  }

  /** FormUiControl.focus(): focusBoundControl() and a form's onInvalid reach the inner <input>, not the host. */
  focus(options?: FocusOptions): void {
    this.control().nativeElement.focus(options);
  }

  protected onInput(event: Event): void {
    this.raw.set((event.target as HTMLInputElement).value);
  }
}
