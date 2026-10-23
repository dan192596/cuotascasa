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
      border-radius: var(--cc-radius-block);
      font-family: var(--cc-font-body);
    }
    /* Enters from below; reduced motion keeps it in place (the global kill switch also zeroes it). */
    @media (prefers-reduced-motion: no-preference) {
      .toast {
        animation: cc-toast-in var(--cc-duration-base) var(--cc-ease-out) both;
      }
    }
    @keyframes cc-toast-in {
      from {
        opacity: 0;
        transform: translateY(1.5rem);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
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
