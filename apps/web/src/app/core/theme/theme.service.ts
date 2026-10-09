import { DOCUMENT } from '@angular/common';
import { inject, Injectable, signal } from '@angular/core';
import type { SettingsStore } from '../../data/api.ts';

export type ThemePreference = ReturnType<SettingsStore['theme']>;

/**
 * Applies the theme to <html data-theme>. 'system' removes the attribute so tokens.css follows prefers-color-scheme.
 * It never persists anything: under /app the toggle hands it the preference stored in SettingsStore (ADR-0012 §6).
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly root = inject(DOCUMENT).documentElement;
  private readonly current = signal<ThemePreference>('system');
  readonly preference = this.current.asReadonly();

  setPreference(preference: ThemePreference): void {
    this.current.set(preference);
    if (preference === 'system') {
      this.root.removeAttribute('data-theme');
    } else {
      this.root.setAttribute('data-theme', preference);
    }
  }
}
