import { ChangeDetectionStrategy, Component, ErrorHandler, inject } from '@angular/core';
import { SETTINGS_STORE } from '../../data/tokens.ts';
import { type ThemePreference, ThemeService } from './theme.service.ts';

interface ThemeOption {
  readonly value: ThemePreference;
  readonly label: string;
}

/**
 * Theme choice, hosted in Ajustes: persists through SettingsStore and applies through ThemeService right away. The
 * shell applies the stored preference on every /app page, so this control only reads and changes it.
 */
@Component({
  selector: 'cc-theme-toggle',
  template: `
    <div class="cc-theme-toggle" role="group" aria-label="Tema">
      @for (option of options; track option.value) {
        <button type="button" [attr.aria-pressed]="theme.preference() === option.value" (click)="choose(option.value)">
          {{ option.label }}
        </button>
      }
    </div>
  `,
  styleUrl: './theme-toggle.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemeToggleComponent {
  protected readonly theme = inject(ThemeService);
  private readonly settings = inject(SETTINGS_STORE);
  private readonly errors = inject(ErrorHandler);
  protected readonly options: readonly ThemeOption[] = [
    { value: 'system', label: 'Sistema' },
    { value: 'light', label: 'Claro' },
    { value: 'dark', label: 'Oscuro' },
  ];

  protected async choose(value: ThemePreference): Promise<void> {
    const previous = this.theme.preference();
    this.theme.setPreference(value);
    try {
      await this.settings.setTheme(value);
    } catch (error) {
      this.theme.setPreference(previous);
      // An async click handler's rejection would skip Angular's ErrorHandler, so report it explicitly.
      this.errors.handleError(error);
    }
  }
}
