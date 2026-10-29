import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ThemeToggleComponent } from '../../core/theme/theme-toggle.component.ts';
import { SettingsBackupComponent } from './backup/settings-backup.component.ts';
import { SettingsDeviceComponent } from './device/settings-device.component.ts';
import { SettingsSyncComponent } from './sync/settings-sync.component.ts';

/**
 * Frozen page shell of /app/ajustes (W0-05): appearance (cc-theme-toggle, moved here from the top bar), backup (W5-07),
 * Drive sync (W5-08) and device data (W7-04).
 */
@Component({
  selector: 'cc-settings-page',
  imports: [ThemeToggleComponent, SettingsBackupComponent, SettingsSyncComponent, SettingsDeviceComponent],
  template: `
    <h1>Ajustes</h1>
    <section aria-labelledby="cc-appearance-title" data-testid="settings-appearance">
      <h2 id="cc-appearance-title">Apariencia</h2>
      <p>«Sistema» sigue el modo claro u oscuro de tu dispositivo.</p>
      <cc-theme-toggle />
    </section>
    <cc-settings-backup />
    <cc-settings-sync />
    <cc-settings-device />
  `,
  styles: `
    /* Mercado (ADR-0026): each section is a rounded block, with the page heading aligned to their edge. */
    :host {
      display: grid;
      gap: 1.25rem;
      padding: 1rem;
      color: var(--cc-color-ink);
    }
    h1 {
      margin: 0.5rem 0 0;
    }
    section,
    cc-settings-backup,
    cc-settings-sync,
    cc-settings-device {
      display: block;
      padding: 0.25rem clamp(1rem, 3vw, 1.75rem) 1.25rem;
      border: 1.5px solid var(--cc-color-rule);
      border-radius: var(--cc-radius-block);
      background: var(--cc-color-paper);
    }
    section p {
      color: var(--cc-color-ink-muted);
    }
  `,
  host: { 'data-testid': 'page-settings' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPageComponent {}
