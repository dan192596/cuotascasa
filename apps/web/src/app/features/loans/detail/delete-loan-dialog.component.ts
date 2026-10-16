import { CdkTrapFocus } from '@angular/cdk/a11y';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';

let nextId = 0;

/**
 * Deletion confirmation that asks to type the loan alias (HU-08, R14). Modal: focus is trapped, starts on the alias
 * field (the destructive button stays disabled until it matches) and returns to the opener when it closes. The host
 * controls `open` and closes it after `confirmed` or `cancelled` (button, Escape or backdrop click).
 */
@Component({
  selector: 'cc-delete-loan-dialog',
  imports: [CdkTrapFocus],
  template: `
    @if (open()) {
      <div
        class="backdrop"
        role="presentation"
        data-testid="delete-backdrop"
        (mousedown)="pressTarget = $event.target"
        (click)="onBackdropClick($event)"
      >
        <div
          class="dialog"
          role="alertdialog"
          aria-modal="true"
          cdkTrapFocus
          [cdkTrapFocusAutoCapture]="true"
          [attr.aria-labelledby]="titleId"
          [attr.aria-describedby]="messageId"
        >
          <h2 class="title" [id]="titleId">Eliminar préstamo</h2>
          <p class="message" [id]="messageId">
            Vas a eliminar «{{ alias() }}» con todos sus eventos, saldos informados, pagos y escenarios. Esta acción no
            se puede deshacer.
          </p>
          <label [for]="fieldId">Para confirmar, escribe el alias exacto: {{ alias() }}</label>
          <input
            [id]="fieldId"
            type="text"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            data-testid="delete-alias"
            #aliasField
            [value]="typed()"
            (input)="onType($event)"
          />
          <div class="actions">
            <button type="button" class="button" data-testid="delete-cancel" (click)="cancelled.emit()">
              Cancelar
            </button>
            <button
              type="button"
              class="button destructive"
              data-testid="delete-confirm"
              [disabled]="!matches() || busy()"
              (click)="confirm()"
            >
              Eliminar préstamo
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 1000;
      display: grid;
      place-items: center;
      background: color-mix(in srgb, var(--cc-color-ink) 45%, transparent);
    }
    .dialog {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      width: min(28rem, calc(100vw - 2rem));
      padding: 1.25rem;
      border: 1px solid var(--cc-color-control-border);
      border-radius: 0.5rem;
      background: var(--cc-color-surface);
      color: var(--cc-color-ink);
      font-family: var(--cc-font-body);
    }
    .title {
      margin: 0;
      font-family: var(--cc-font-heading);
      font-size: 1.25rem;
    }
    .message {
      margin: 0 0 0.5rem;
      color: var(--cc-color-ink-muted);
    }
    label {
      font-weight: 600;
    }
    input {
      min-height: 2.5rem;
      padding: 0.375rem 0.5rem;
      border: 1px solid var(--cc-color-control-border);
      border-radius: 0.375rem;
      background: var(--cc-color-surface);
      color: var(--cc-color-ink);
      font: inherit;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
      margin-top: 0.5rem;
    }
    .button {
      min-height: 2.5rem;
      padding: 0.375rem 0.875rem;
      border: 1px solid var(--cc-color-control-border);
      border-radius: 0.25rem;
      background: var(--cc-color-surface);
      color: var(--cc-color-ink);
      font: inherit;
      cursor: pointer;
    }
    .destructive {
      border-color: var(--cc-color-danger);
      color: var(--cc-color-danger);
      font-weight: 600;
    }
    .button:disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }
    .button:focus-visible,
    input:focus-visible {
      outline: 2px solid var(--cc-color-control-border);
      outline-offset: 2px;
    }
  `,
  host: { '(document:keydown.escape)': 'onEscape()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeleteLoanDialogComponent {
  readonly open = input(false);
  /** The loan alias the user must type. */
  readonly alias = input.required<string>();
  /** True while the deletion runs: the button stays disabled. */
  readonly busy = input(false);

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  protected readonly typed = signal('');
  protected pressTarget: EventTarget | null = null;

  private readonly aliasField = viewChild<ElementRef<HTMLInputElement>>('aliasField');
  private readonly injector = inject(Injector);

  private readonly id = nextId++;
  protected readonly titleId = `cc-delete-title-${String(this.id)}`;
  protected readonly messageId = `cc-delete-message-${String(this.id)}`;
  protected readonly fieldId = `cc-delete-field-${String(this.id)}`;

  protected onType(event: Event): void {
    if (event.target instanceof HTMLInputElement) this.typed.set(event.target.value);
  }

  protected matches(): boolean {
    return this.typed().trim() === this.alias().trim() && this.alias().trim() !== '';
  }

  constructor() {
    // Reopening starts from an empty field, and focus lands on it once the dialog is in the DOM (the trap gives it
    // back to the opener on close).
    effect(() => {
      if (!this.open()) return;
      untracked(() => this.typed.set(''));
      afterNextRender(() => this.aliasField()?.nativeElement.focus(), { injector: this.injector });
    });
  }

  protected confirm(): void {
    if (this.matches() && !this.busy()) this.confirmed.emit();
  }

  protected onEscape(): void {
    if (this.open()) this.cancelled.emit();
  }

  protected onBackdropClick(event: MouseEvent): void {
    const startedOnBackdrop = this.pressTarget === event.currentTarget;
    this.pressTarget = null;
    if (event.target === event.currentTarget && startedOnBackdrop) this.cancelled.emit();
  }
}
