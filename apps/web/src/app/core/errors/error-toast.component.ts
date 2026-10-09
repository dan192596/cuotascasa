import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AppToastService } from './app-toast.service.ts';

/** Renders the global error toast; the shell hosts it once. role="alert" announces it to screen readers. */
@Component({
  selector: 'cc-error-toast',
  template: `
    @if (toast.message(); as message) {
      <div class="toast" role="alert" data-testid="error-toast">
        <p>{{ message }}</p>
        <button type="button" (click)="toast.dismiss()">Cerrar aviso</button>
      </div>
    }
  `,
  styles: `
    .toast {
      position: fixed;
      inset-inline: 1rem;
      bottom: 1rem;
      z-index: 1000;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      max-width: 40rem;
      margin-inline: auto;
      padding: 0.75rem 1rem;
      color: var(--cc-color-ink);
      background: var(--cc-color-surface);
      border: 2px solid var(--cc-color-danger);
      font-family: var(--cc-font-body);
    }
    p {
      margin: 0;
    }
    button {
      min-height: 2.75rem;
      padding: 0 1rem;
      color: var(--cc-color-ink);
      background: transparent;
      border: 1px solid var(--cc-color-control-border);
      font: inherit;
      cursor: pointer;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorToastComponent {
  protected readonly toast = inject(AppToastService);
}
