import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { QuickSimulatorComponent } from '../simulator/quick-simulator.component.ts';

/**
 * Landing `/` (HU-01, R1): prerendered hero "tu casa se va llenando" (ADR-0012 decision 2), value propositions, the
 * embedded quick simulator and the footer. The hero is static markup and CSS: no JS-driven animation, no storage and
 * no network. The house is decorative (aria-hidden); its caption says it is illustrative so it is not read as data.
 */
@Component({
  selector: 'cc-landing-page',
  imports: [RouterLink, QuickSimulatorComponent],
  template: `
    <header class="bar">
      <a class="brand" routerLink="/">CuotasCasa</a>
      <nav aria-label="Principal">
        <a routerLink="/privacidad">Privacidad</a>
        <a routerLink="/app">Abrir la app →</a>
      </nav>
    </header>
    <main>
      <section class="hero">
        <div class="hero-copy">
          <h1>Tu casa se va llenando, cuota a cuota.</h1>
          <p class="lead">Modela tu préstamo FHA, prueba abonos a capital y compara con lo que dice tu banco.</p>
          <p class="privacy-cta"><strong>Tus datos se quedan en tu navegador.</strong> Sin cuenta.</p>
          <p class="actions">
            <a class="button" routerLink="/app">Empezar en la app</a>
            <a routerLink="/privacidad">Cómo cuidamos tus datos</a>
          </p>
        </div>
        <figure class="house-figure">
          <svg class="house" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
            <defs>
              <clipPath id="cc-hero-house-clip">
                <polygon points="50,6 94,44 84,44 84,94 16,94 16,44 6,44" />
              </clipPath>
            </defs>
            <g clip-path="url(#cc-hero-house-clip)">
              <rect class="fill" x="0" y="0" width="100" height="100" />
            </g>
            <polygon class="outline" points="50,6 94,44 84,44 84,94 16,94 16,44 6,44" />
            <line class="floor" x1="12" y1="96" x2="88" y2="96" />
          </svg>
          <figcaption class="house-caption">capital pagado (ilustrativo)</figcaption>
        </figure>
      </section>

      <section class="values">
        <h2>Qué puedes hacer</h2>
        <ul>
          <li>
            <h3>Entender tu cuota</h3>
            Calcula tu cuota y su reparto entre interés, seguro y capital.
          </li>
          <li>
            <h3>Probar abonos a capital</h3>
            Mira cuánto interés y cuántos meses te ahorras.
          </li>
          <li>
            <h3>Comparar con tu banco</h3>
            Anota lo que dice tu banco y verifica si coincide.
          </li>
        </ul>
      </section>

      <section class="simulator">
        <h2>Simulador rápido</h2>
        <cc-quick-simulator />
      </section>
    </main>
    <footer>
      <p>
        Código abierto
        @if (repoUrl(); as url) {
          · <a [href]="url" rel="noopener noreferrer">Repositorio</a>
        }
        · Sin analítica ni cookies de rastreo
      </p>
      <p>Cifras estimadas; el banco tiene la última palabra. No es asesoría financiera.</p>
    </footer>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100dvh;
      color: var(--cc-color-ink);
      background: var(--cc-color-paper);
      font-family: var(--cc-font-body);
    }
    a {
      color: var(--cc-color-accent);
    }
    .bar,
    main,
    footer {
      box-sizing: border-box;
      max-width: 80rem;
      margin-inline: auto;
      padding: 0.5rem 1rem;
    }
    .bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--cc-color-rule);
    }
    .brand {
      font-family: var(--cc-font-heading);
      font-size: 1.25rem;
      color: var(--cc-color-ink);
      text-decoration: none;
    }
    nav a,
    .button {
      display: inline-flex;
      align-items: center;
      min-height: 2.75rem;
      padding: 0 0.75rem;
    }
    main {
      flex: 1;
      display: grid;
      gap: 2.5rem;
    }
    h1,
    h2,
    h3 {
      font-family: var(--cc-font-heading);
    }
    h1,
    h2,
    h3,
    p {
      margin: 0;
    }
    h1 {
      font-size: clamp(2rem, 6vw, 3rem);
      line-height: 1.15;
    }
    h2 {
      font-size: 1.5rem;
      margin-block-end: 1rem;
    }
    .hero {
      display: grid;
      gap: 2rem;
      align-items: center;
    }
    .hero-copy {
      display: grid;
      gap: 1rem;
      justify-items: start;
    }
    .lead {
      font-size: 1.125rem;
      color: var(--cc-color-ink-muted);
      max-width: 36rem;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem 1.5rem;
    }
    .button {
      color: var(--cc-color-paper);
      background: var(--cc-color-accent);
      border-radius: 0.25rem;
      text-decoration: none;
      font-weight: 700;
    }
    .house-figure {
      margin: 0;
      text-align: center;
    }
    .house {
      width: min(14rem, 60vw);
      height: auto;
    }
    .outline {
      fill: none;
      stroke: var(--cc-color-control-border);
      stroke-width: 2;
      stroke-linejoin: round;
    }
    .floor {
      stroke: var(--cc-color-control-border);
      stroke-width: 2;
      stroke-linecap: round;
    }
    .fill {
      fill: var(--cc-color-positive-fill);
      transform-box: fill-box;
      transform-origin: bottom;
      transform: scaleY(0.6);
    }
    .values ul {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 1rem;
    }
    .values li {
      padding: 1rem;
      background: var(--cc-color-surface);
      border: 1px solid var(--cc-color-rule);
    }
    footer,
    .house-caption {
      color: var(--cc-color-ink-muted);
      font-size: 0.875rem;
    }
    footer {
      border-top: 1px solid var(--cc-color-rule);
    }
    @keyframes fill-in {
      from {
        transform: scaleY(0);
      }
    }
    @media (prefers-reduced-motion: no-preference) {
      .fill {
        animation: fill-in 1200ms ease-out;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .fill {
        animation: none;
      }
    }
    @media (min-width: 48rem) {
      .values ul {
        grid-template-columns: repeat(3, 1fr);
      }
    }
    @media (min-width: 64rem) {
      .hero {
        grid-template-columns: 1fr auto;
      }
    }
  `,
  host: { 'data-testid': 'page-landing' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingPageComponent {
  /** Route data (ISSUES_URL, injected at build time): the public Issues URL, '' in dev builds. */
  readonly issuesUrl = input<string | undefined>('');

  /** Repository URL derived from the issues URL; '' unless it is an https URL (never a literal in the sources). */
  protected readonly repoUrl = computed(() => {
    const url = (this.issuesUrl() ?? '').replace(/\/+$/, '').replace(/\/issues$/, '');
    return url.startsWith('https://') ? url : '';
  });
}
