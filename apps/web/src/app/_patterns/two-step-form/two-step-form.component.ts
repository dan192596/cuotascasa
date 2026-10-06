import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  inject,
  Injector,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { form, FormField, FormRoot, required, validate } from '@angular/forms/signals';

/** Value of the pattern form. Amounts and counts stay strings until the domain parses them. */
export interface TwoStepValue {
  readonly alias: string;
  readonly months: string;
}

/**
 * GOLDEN PATTERN · two-step form with Spanish messages (docs/specs/angular-patterns.md §2).
 * One signal model and one form() for every step. Each step is its own <form novalidate>, so Enter in a field runs
 * that step's submit button: «Siguiente» validates only the step's fields; «Guardar» submits through [formRoot], whose
 * submission marks every field as touched and runs the action only when the whole form is valid. «Atrás» keeps what
 * was typed. After a step change, focus goes to the step heading and a polite live region announces the step; after a
 * failed attempt, focus goes to the first invalid field.
 */
@Component({
  selector: 'cc-pattern-two-step-form',
  imports: [FormField, FormRoot],
  template: `
    <h2 #stepHeading id="pattern-title" tabindex="-1">Paso {{ step() }} de 2</h2>
    <p class="sr-only" aria-live="polite">{{ announcement() }}</p>
    @if (step() === 1) {
      <form novalidate aria-labelledby="pattern-title" (submit)="next($event)">
        <label for="alias">Alias</label>
        <input
          id="alias"
          [formField]="form.alias"
          [attr.aria-invalid]="showErrors('alias')"
          [attr.aria-describedby]="showErrors('alias') ? 'alias-errors' : null"
        />
        @if (showErrors('alias')) {
          <p id="alias-errors">{{ form.alias().errors()[0]?.message }}</p>
        }
        <button type="submit">Siguiente</button>
      </form>
    } @else {
      <form [formRoot]="form" aria-labelledby="pattern-title">
        <label for="months">Plazo en meses</label>
        <input
          id="months"
          inputmode="numeric"
          [formField]="form.months"
          [attr.aria-invalid]="showErrors('months')"
          [attr.aria-describedby]="showErrors('months') ? 'months-errors' : null"
        />
        @if (showErrors('months')) {
          <p id="months-errors">{{ form.months().errors()[0]?.message }}</p>
        }
        <button type="button" (click)="back()">Atrás</button>
        <button type="submit">Guardar</button>
      </form>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TwoStepFormComponent {
  readonly saved = output<TwoStepValue>();
  protected readonly step = signal<1 | 2>(1);
  /** Empty until the first step change: nothing is announced on load. */
  protected readonly announcement = signal('');
  protected readonly model = signal<TwoStepValue>({ alias: '', months: '' });
  protected readonly form = form(
    this.model,
    (path) => {
      required(path.alias, { message: 'Escribe un alias para identificar el préstamo.' });
      required(path.months, { message: 'El plazo es obligatorio.' });
      validate(path.months, ({ value }) =>
        /^[1-9]\d*$/.test(value()) || value() === ''
          ? undefined
          : { kind: 'months', message: 'El plazo debe ser un número entero de meses mayor que 0.' },
      );
    },
    {
      submission: {
        action: async () => {
          this.saved.emit(this.model());
          return undefined;
        },
        onInvalid: (field) => this.afterRender(() => field().errorSummary()[0]?.fieldTree().focusBoundControl()),
      },
    },
  );
  private readonly injector = inject(Injector);
  private readonly stepHeading = viewChild.required<ElementRef<HTMLHeadingElement>>('stepHeading');

  protected showErrors(field: 'alias' | 'months'): boolean {
    const state = this.form[field]();
    return state.touched() && state.invalid();
  }

  /** «Siguiente» and Enter on step 1: validates only the step's fields. */
  protected next(event: SubmitEvent): void {
    event.preventDefault();
    const alias = this.form.alias();
    alias.markAsTouched();
    if (alias.valid()) {
      this.goTo(2);
    } else {
      this.afterRender(() => alias.focusBoundControl());
    }
  }

  protected back(): void {
    this.goTo(1);
  }

  private goTo(step: 1 | 2): void {
    this.step.set(step);
    this.announcement.set(`Paso ${step} de 2`);
    this.afterRender(() => this.stepHeading().nativeElement.focus());
  }

  /** Focus moves after the view shows the new step or the error, so a screen reader reads the updated state. */
  private afterRender(action: () => void): void {
    afterNextRender(action, { injector: this.injector });
  }
}
