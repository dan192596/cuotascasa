import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SettingsStore } from '../../data/api.ts';
import { SETTINGS_STORE } from '../../data/tokens.ts';
import { ThemeToggleComponent } from './theme-toggle.component.ts';

type Preference = ReturnType<SettingsStore['theme']>;

function setup(initial: Preference): {
  fixture: ComponentFixture<ThemeToggleComponent>;
  setTheme: ReturnType<typeof vi.fn>;
  theme: ReturnType<typeof signal<Preference>>;
} {
  const theme = signal<Preference>(initial);
  const setTheme = vi.fn((next: Preference) => {
    theme.set(next);
    return Promise.resolve();
  });
  TestBed.configureTestingModule({
    providers: [{ provide: SETTINGS_STORE, useValue: { theme, setTheme } }],
  });
  const fixture = TestBed.createComponent(ThemeToggleComponent);
  fixture.detectChanges();
  return { fixture, setTheme, theme };
}

function buttons(fixture: ComponentFixture<ThemeToggleComponent>): HTMLButtonElement[] {
  return [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')];
}

describe('cc-theme-toggle', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    TestBed.resetTestingModule();
  });

  it('offers Sistema, Claro and Oscuro in a labelled group and marks the stored one', async () => {
    const { fixture } = setup('dark');
    await fixture.whenStable();
    fixture.detectChanges();
    const all = buttons(fixture);
    expect(all.map((b) => b.textContent?.trim())).toEqual(['Sistema', 'Claro', 'Oscuro']);
    expect(all.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true']);
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="group"]')?.getAttribute('aria-label')).toBe(
      'Tema',
    );
  });

  it('applies the stored preference to the page', () => {
    setup('light');
    TestBed.tick();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('persists a choice through SettingsStore and applies it', async () => {
    const { fixture, setTheme } = setup('system');
    buttons(fixture)[2]?.click();
    await fixture.whenStable();
    expect(setTheme).toHaveBeenCalledWith('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
