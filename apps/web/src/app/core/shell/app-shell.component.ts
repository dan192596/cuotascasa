import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { UpdatePromptComponent } from '../pwa/update-prompt.component.ts';
import { SafariBannerComponent } from '../storage-health/safari-banner.component.ts';
import { ThemeToggleComponent } from '../theme/theme-toggle.component.ts';

/** Inert W0-05 stub; W3-09 replaces it. It must keep data-testid='page-app', the three slots and the outlet. */
export const CC_STUB = 'CC_STUB:W3-09';

@Component({
  selector: 'cc-app-shell',
  imports: [RouterOutlet, SafariBannerComponent, UpdatePromptComponent, ThemeToggleComponent],
  template: `
    <cc-safari-banner />
    <cc-update-prompt />
    <cc-theme-toggle />
    <main id="contenido"><router-outlet /></main>
  `,
  host: { 'data-testid': 'page-app', 'data-cc-stub': CC_STUB },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShellComponent {}
