import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { STORAGE_HEALTH } from '../../data/tokens.ts';
import { SafariBannerState } from './safari-banner-state.ts';

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
          aria-controls="safari-banner-body"
          (click)="state.toggle()"
        >
          {{ state.collapsed() ? 'Mostrar aviso de Safari' : 'Ocultar aviso' }}
        </button>
        @if (!state.collapsed()) {
          <p id="safari-banner-body" data-testid="safari-banner-body" role="status">
            Safari puede borrar los datos de este sitio si no lo abres durante unos días. Instala la app, haz un
            respaldo o conecta Google Drive.
            <a routerLink="/app/ajustes">Ver opciones en Ajustes</a>
          </p>
        }
      </section>
    }
  `,
  styles: `
    .cc-safari-banner {
      padding: 0.5rem 1rem;
      border-bottom: 1px solid currentColor;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SafariBannerComponent {
  protected readonly health = inject(STORAGE_HEALTH);
  protected readonly state = inject(SafariBannerState);
}
