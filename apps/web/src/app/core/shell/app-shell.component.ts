import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  viewChild,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ErrorToastComponent } from '../errors/error-toast.component.ts';
import { UpdatePromptComponent } from '../pwa/update-prompt.component.ts';
import { SafariBannerComponent } from '../storage-health/safari-banner.component.ts';
import { ThemeToggleComponent } from '../theme/theme-toggle.component.ts';

/**
 * Shell of /app: top bar, skip link, slots (cc-safari-banner is hosted only here), outlet and disclaimer footer.
 * Keeps data-testid='page-app' (docs/specs/component-contracts.md).
 */
@Component({
  selector: 'cc-app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    SafariBannerComponent,
    UpdatePromptComponent,
    ThemeToggleComponent,
    ErrorToastComponent,
  ],
  template: `
    <a class="skip-link" href="#contenido" (click)="skipToContent($event)">Saltar al contenido</a>
    <header class="bar">
      <a class="brand" routerLink="/app">CuotasCasa</a>
      <nav aria-label="Principal">
        <a
          routerLink="/app"
          routerLinkActive="active"
          ariaCurrentWhenActive="page"
          [routerLinkActiveOptions]="{ exact: true }"
          >Panel</a
        >
        <a routerLink="/app/prestamos" routerLinkActive="active" ariaCurrentWhenActive="page">Préstamos</a>
        <a routerLink="/app/ajustes" routerLinkActive="active" ariaCurrentWhenActive="page">Ajustes</a>
      </nav>
      <cc-theme-toggle />
    </header>
    <cc-safari-banner />
    <cc-update-prompt />
    <main id="contenido" tabindex="-1" #main><router-outlet /></main>
    <footer>Cifras estimadas; el banco tiene la última palabra. No es asesoría financiera.</footer>
    <cc-error-toast />
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
    .skip-link {
      position: absolute;
      inset-inline-start: 0.5rem;
      top: -4rem;
      z-index: 1100;
      padding: 0.75rem 1rem;
      color: var(--cc-color-ink);
      background: var(--cc-color-surface);
      border: 2px solid var(--cc-color-ink);
    }
    .skip-link:focus {
      top: 0.5rem;
    }
    .bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem 1rem;
      padding: 0.5rem 1rem;
      border-bottom: 1px solid var(--cc-color-rule);
    }
    .brand {
      font-family: var(--cc-font-heading);
      font-size: 1.25rem;
    }
    nav {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
    }
    a {
      color: var(--cc-color-ink);
    }
    nav a {
      display: inline-flex;
      align-items: center;
      min-height: 2.75rem;
      padding: 0 0.75rem;
      text-decoration: none;
      border-bottom: 3px solid transparent;
    }
    nav a.active {
      font-weight: 700;
      border-bottom-color: var(--cc-color-accent);
    }
    main {
      flex: 1;
      width: 100%;
      box-sizing: border-box;
      padding: 1rem;
    }
    main:focus {
      outline: none;
    }
    footer {
      padding: 1rem;
      color: var(--cc-color-ink-muted);
      border-top: 1px solid var(--cc-color-rule);
      font-size: 0.875rem;
    }
    @media (min-width: 80rem) {
      .bar,
      main,
      footer {
        box-sizing: border-box;
        width: 100%;
        max-width: 80rem;
        margin-inline: auto;
      }
      main {
        padding: 2rem;
      }
    }
  `,
  host: { 'data-testid': 'page-app' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShellComponent {
  private readonly main = viewChild.required<ElementRef<HTMLElement>>('main');
  private readonly injector = inject(Injector);

  constructor() {
    const router = inject(Router);
    // WCAG 2.4.3: after every navigation except the first, move focus to the page heading (or main).
    let isFirst = true;
    let lastPath = '';
    const pathOf = (url: string) => url.split(/[?#]/, 1)[0] ?? '';
    const subscription = router.events.subscribe((event) => {
      if (!(event instanceof NavigationEnd)) {
        return;
      }
      const path = pathOf(event.urlAfterRedirects);
      const previous = lastPath;
      lastPath = path;
      if (isFirst) {
        isFirst = false;
        return;
      }
      if (path === previous) {
        return;
      }
      afterNextRender(
        () => {
          const main = this.main().nativeElement;
          const target = main.querySelector('h1') ?? main;
          if (!target.hasAttribute('tabindex')) {
            target.setAttribute('tabindex', '-1');
          }
          target.focus();
        },
        { injector: this.injector },
      );
    });
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
  }

  /** With <base href="/"> a plain #contenido anchor would reload the landing, so the click focuses main instead. */
  protected skipToContent(event: Event): void {
    event.preventDefault();
    this.main().nativeElement.focus();
  }
}
