import { CdkTrapFocus } from '@angular/cdk/a11y';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';

let nextId = 0;

/**
 * Modal confirmation. The host controls `open`; the dialog reports the user's decision through `confirmed` or
 * `cancelled` (button, Escape or backdrop click) and the host closes it. Focus is trapped while open, starts on the
 * safe action (cancel) and returns to the element that had it before opening.
 */
@Component({
  selector: 'cc-confirm-dialog',
  imports: [CdkTrapFocus],
  template: `
    @if (open()) {
      <div
        class="backdrop"
        role="presentation"
        data-testid="confirm-backdrop"
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
          (click)="$event.stopPropagation()"
        >
          <h2 class="title" [id]="titleId">{{ heading() }}</h2>
          <p class="message" [id]="messageId">{{ message() }}</p>
          <div class="actions">
            <button type="button" class="button" data-testid="confirm-cancel" #cancelButton (click)="cancelled.emit()">
              {{ cancelLabel() }}
            </button>
            <button
              type="button"
              class="button primary"
              data-testid="confirm-ok"
              [class.destructive]="destructive()"
              (click)="confirmed.emit()"
            >
              {{ confirmLabel() }}
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
      width: min(26rem, calc(100vw - 2rem));
      padding: 1.25rem;
      border: 1px solid var(--cc-color-control-border);
      border-radius: 0.5rem;
      background: var(--cc-color-surface);
      color: var(--cc-color-ink);
      font-family: var(--cc-font-body);
    }
    .title {
      margin: 0 0 0.5rem;
      font-family: var(--cc-font-heading);
      font-size: 1.25rem;
    }
    .message {
      margin: 0 0 1rem;
      color: var(--cc-color-ink-muted);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
    }
    .button {
      padding: 0.375rem 0.875rem;
      border: 1px solid var(--cc-color-control-border);
      border-radius: 0.25rem;
      background: var(--cc-color-surface);
      color: var(--cc-color-ink);
      font: inherit;
      cursor: pointer;
    }
    .primary {
      border-color: var(--cc-color-accent);
      background: var(--cc-color-accent);
      color: var(--cc-color-paper);
    }
    .destructive {
      border-color: var(--cc-color-danger);
      background: var(--cc-color-surface);
      color: var(--cc-color-danger);
    }
    .button:focus-visible {
      outline: 2px solid var(--cc-color-control-border);
      outline-offset: 2px;
    }
  `,
  host: { '(document:keydown.escape)': 'onEscape()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialogComponent {
  readonly open = input(false);
  readonly heading = input.required<string>();
  readonly message = input.required<string>();
  readonly confirmLabel = input('Confirmar');
  readonly cancelLabel = input('Cancelar');
  /** Paints the confirm button with danger text and border on the surface. */
  readonly destructive = input(false);

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  private readonly cancelButton = viewChild<ElementRef<HTMLButtonElement>>('cancelButton');
  private readonly injector = inject(Injector);
  private readonly id = nextId++;
  protected readonly titleId = `cc-confirm-title-${this.id}`;
  protected readonly messageId = `cc-confirm-message-${this.id}`;

  /** Where the current mouse press started; a drag from inside the dialog must not close it. */
  protected pressTarget: EventTarget | null = null;

  protected onEscape(): void {
    if (this.open()) this.cancelled.emit();
  }

  protected onBackdropClick(event: MouseEvent): void {
    const startedOnBackdrop = this.pressTarget === event.currentTarget;
    this.pressTarget = null;
    if (event.target === event.currentTarget && startedOnBackdrop) this.cancelled.emit();
  }

  constructor() {
    // Start on the safe action once the dialog is in the DOM (the trap restores focus to the opener on close).
    effect(() => {
      if (this.open()) afterNextRender(() => this.cancelButton()?.nativeElement.focus(), { injector: this.injector });
    });
  }
}
