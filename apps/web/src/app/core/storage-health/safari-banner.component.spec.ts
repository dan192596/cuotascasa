import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import type { StorageHealth } from '../../data/api.ts';
import { STORAGE_HEALTH } from '../../data/tokens.ts';
import { SafariBannerComponent } from './safari-banner.component.ts';
import { SafariBannerState } from './safari-banner-state.ts';

function mount(safari: boolean) {
  const health: StorageHealth = {
    persisted: signal<boolean | null>(null).asReadonly(),
    estimate: signal(null).asReadonly(),
    safariNonStandalone: signal(safari).asReadonly(),
    requestPersist: () => Promise.resolve(false),
  };
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: STORAGE_HEALTH, useValue: health }],
  });
  const fixture = TestBed.createComponent(SafariBannerComponent);
  fixture.detectChanges();
  return fixture;
}
const el = (f: ReturnType<typeof mount>) => f.nativeElement as HTMLElement;

describe('cc-safari-banner', () => {
  it('renders nothing outside non-standalone Safari', () => {
    expect(el(mount(false)).querySelector('[data-testid="safari-banner"]')).toBeNull();
  });

  it('shows a message in Spanish and links to /app/ajustes', () => {
    const root = el(mount(true));
    const banner = root.querySelector('[data-testid="safari-banner"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain('Safari');
    expect(root.querySelector('a')?.getAttribute('href')).toBe('/app/ajustes');
  });

  it('collapses for the session and reappears with a fresh session state', () => {
    const f = mount(true);
    const root = el(f);
    root.querySelector<HTMLButtonElement>('[data-testid="safari-banner-toggle"]')?.click();
    f.detectChanges();
    expect(root.querySelector('[data-testid="safari-banner-body"]')).toBeNull();
    const toggle = root.querySelector('[data-testid="safari-banner-toggle"]');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(TestBed.inject(SafariBannerState).collapsed()).toBe(true);

    TestBed.resetTestingModule();
    expect(el(mount(true)).querySelector('[data-testid="safari-banner-body"]')).not.toBeNull();
  });
});
