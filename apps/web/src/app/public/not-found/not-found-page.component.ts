import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Static 404 page in libreta style (ADR-0022): served with status 404 by the edge; no scripts, storage or network. */
@Component({
  selector: 'cc-not-found-page',
  template: `
    <main class="page">
      <p class="brand">CuotasCasa</p>
      <h1>Página no encontrada</h1>
      <p class="lead">La dirección que abriste no existe o ya cambió de lugar.</p>
      <p class="actions">
        <a href="/">Ir al inicio</a>
        <a href="/app">Abrir la aplicación</a>
      </p>
    </main>
  `,
  styles: `
    :host {
      display: block;
      background: var(--cc-color-paper);
      color: var(--cc-color-ink);
    }
    .page {
      box-sizing: border-box;
      max-width: 32rem;
      margin: 3rem auto;
      padding: 1.5rem;
      border: 1px solid var(--cc-color-rule);
      border-left: 4px solid var(--cc-color-accent);
      border-radius: 0.25rem;
      background: var(--cc-color-surface);
      font-family: var(--cc-font-body);
      line-height: 1.6;
    }
    .brand {
      margin: 0;
      font-family: var(--cc-font-heading);
      font-weight: 600;
      color: var(--cc-color-ink-muted);
    }
    h1 {
      margin: 0.25rem 0 0.5rem;
      font-size: 2rem;
      line-height: 1.2;
    }
    .lead {
      margin: 0 0 1rem;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      margin: 0;
    }
  `,
  host: { 'data-testid': 'page-not-found' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundPageComponent {}
