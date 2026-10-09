import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { STORAGE_HEALTH } from '../../data/tokens.ts';
import { SafariBannerState } from './safari-banner-state.ts';

let nextBannerId = 0;

/** Persistent notice for Safari in a tab (ADR-0017, decision 6). Hosted by the app shell and the dashboard. */
@Component({
  selector: 'cc-safari-banner',
  imports: [RouterLink],
  template: `
    @if (health.safariNonStandalone()) {
      <section class="cc-safari-banner" data-testid="safari-banner" aria-label="Aviso de almacenamiento en Safari">
        <button
          type="button"
          data-testid="safari-banner-toggle"
          [attr.aria-expanded]="!state.collapsed()"
          [attr.aria-controls]="bodyId"
          (click)="state.toggle()"
        >
          {{ state.collapsed() ? 'Mostrar aviso de Safari' : 'Ocultar aviso' }}
        </button>
        <p [id]="bodyId" data-testid="safari-banner-body" [hidden]="state.collapsed()">
          Safari puede borrar los datos de este sitio si no lo abres durante 7 días. Instala la app, haz un respaldo o
          conecta Google Drive.
          <a routerLink="/app/ajustes">Ver opciones en Ajustes</a>
        </p>
      </section>
    }
  `,
  styles: `
    .cc-safari-banner {
      padding: 0.5rem 1rem;
      background: var(--cc-color-surface);
      color: var(--cc-color-ink);
      border-bottom: 1px solid var(--cc-color-warning);
      border-left: 4px solid var(--cc-color-warning);
    }
    .cc-safari-banner p {
      margin: 0.5rem 0 0;
    }
    .cc-safari-banner a {
      color: var(--cc-color-ink);
      text-decoration: underline;
    }
    .cc-safari-banner button {
      color: var(--cc-color-ink);
      background: transparent;
      border: 1px solid var(--cc-color-control-border);
      border-radius: 4px;
      padding: 0.25rem 0.75rem;
      cursor: pointer;
    }
    .cc-safari-banner button:focus-visible {
      outline: 3px solid var(--cc-color-control-border);
      outline-offset: 2px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SafariBannerComponent {
  protected readonly health = inject(STORAGE_HEALTH);
  protected readonly state = inject(SafariBannerState);
  protected readonly bodyId = `cc-safari-body-${nextBannerId++}`;
}
