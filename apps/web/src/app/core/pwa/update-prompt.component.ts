import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PwaUpdateService } from './pwa-update.service.ts';

/**
 * Spanish update prompt (R20). Hosted once in the app shell (docs/specs/component-contracts.md). A small live region
 * instead of MatSnackBar: Material's snack bar, overlay and button cost about 23 kB gzip in the /app bundle.
 */
@Component({
  selector: 'cc-update-prompt',
  template: `
    @if (updates.updateReady()) {
      <div class="prompt" role="status">
        <span>Hay una versión nueva de CuotasCasa.</span>
        <button type="button" (click)="accept()">Actualizar</button>
      </div>
    }
  `,
  styles: `
    .prompt {
      position: fixed;
      inset-block-end: 1rem;
      inset-inline: 1rem;
      margin-inline: auto;
      max-inline-size: 32rem;
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.75rem 1rem;
      background: var(--cc-color-surface);
      color: var(--cc-color-ink);
      border: 1px solid var(--cc-color-control-border);
      border-radius: 0.5rem;
      font-family: var(--cc-font-body);
    }
    button {
      min-block-size: 2.75rem;
      padding-inline: 1rem;
      background: transparent;
      color: var(--cc-color-accent);
      border: 1px solid var(--cc-color-accent);
      border-radius: 0.375rem;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
    button:focus-visible {
      outline: 3px solid var(--cc-color-accent);
      outline-offset: 2px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpdatePromptComponent {
  protected readonly updates = inject(PwaUpdateService);

  protected accept(): void {
    void this.updates.activateAndReload();
  }
}
