import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { SETTINGS_STORE } from '../../data/tokens.ts';
import { SettingsBackupComponent } from './backup/settings-backup.component.ts';
import { SettingsDeviceComponent } from './device/settings-device.component.ts';
import { SettingsPageComponent } from './settings-page.component.ts';
import { SettingsSyncComponent } from './sync/settings-sync.component.ts';

describe('SettingsPageComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('hosts the theme choice under «Apariencia», before the backup, sync and device sections', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: SETTINGS_STORE, useValue: { theme: signal('system'), setTheme: () => Promise.resolve() } },
      ],
    });
    // The other sections are tested in their own specs; here they stay unrendered elements.
    TestBed.overrideComponent(SettingsPageComponent, {
      remove: { imports: [SettingsBackupComponent, SettingsSyncComponent, SettingsDeviceComponent] },
      add: { schemas: [NO_ERRORS_SCHEMA] },
    });
    const fixture = TestBed.createComponent(SettingsPageComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const appearance = root.querySelector('[data-testid="settings-appearance"]');
    expect(appearance?.querySelector('h2')?.textContent?.trim()).toBe('Apariencia');
    expect(appearance?.querySelector('cc-theme-toggle [role="group"]')?.getAttribute('aria-label')).toBe('Tema');
    expect([...root.children].map((child) => child.tagName.toLowerCase())).toEqual([
      'h1',
      'section',
      'cc-settings-backup',
      'cc-settings-sync',
      'cc-settings-device',
    ]);
  });
});
