import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { describe, expect, it } from 'vitest';
import type { SettingsStore, StorageHealth } from '../../data/api.ts';
import { SETTINGS_STORE, STORAGE_HEALTH } from '../../data/tokens.ts';
import { AppShellComponent } from './app-shell.component.ts';

@Component({ template: '<h1 id="t">Pantalla</h1>' })
class WithHeadingComponent {}

@Component({ template: '<p>Sin título</p>' })
class WithoutHeadingComponent {}

/** Minimal fakes for what the real slot components inject; their internals are tested in their own specs. */
const fakeSettings: Pick<SettingsStore, 'theme' | 'setTheme'> = {
  theme: signal('system' as const),
  setTheme: () => Promise.resolve(),
};
const fakeStorageHealth: Pick<StorageHealth, 'safariNonStandalone'> = { safariNonStandalone: signal(false) };

async function mount() {
  TestBed.configureTestingModule({
    providers: [
      { provide: SETTINGS_STORE, useValue: fakeSettings },
      { provide: STORAGE_HEALTH, useValue: fakeStorageHealth },
      provideRouter([
        {
          path: 'app',
          component: AppShellComponent,
          children: [
            { path: '', component: WithHeadingComponent },
            { path: 'prestamos', component: WithHeadingComponent },
            { path: 'ajustes', component: WithoutHeadingComponent },
          ],
        },
      ]),
    ],
  });
  const harness = await RouterTestingHarness.create('/app');
  const root = harness.fixture.nativeElement as HTMLElement;
  document.body.append(root);
  return { harness, root, router: TestBed.inject(Router) };
}

const link = (root: HTMLElement, text: string) =>
  [...root.querySelectorAll('nav a')].find((a) => a.textContent?.trim() === text) as HTMLAnchorElement;

describe('AppShellComponent', () => {
  it('keeps data-testid=page-app and renders the three frozen slots by selector', async () => {
    const { root } = await mount();
    expect(root.querySelector('[data-testid="page-app"]')).not.toBeNull();
    for (const selector of ['cc-safari-banner', 'cc-update-prompt', 'cc-theme-toggle']) {
      expect(root.querySelectorAll(selector), selector).toHaveLength(1);
    }
  });

  it('lists Panel, Préstamos and Ajustes in the top bar', async () => {
    const { root } = await mount();
    expect([...root.querySelectorAll('nav a')].map((a) => a.textContent?.trim())).toEqual([
      'Panel',
      'Préstamos',
      'Ajustes',
    ]);
    expect(link(root, 'Préstamos').getAttribute('href')).toBe('/app/prestamos');
  });

  it('reflects the active route with aria-current', async () => {
    const { harness, root } = await mount();
    await harness.fixture.whenStable();
    expect(link(root, 'Panel').getAttribute('aria-current')).toBe('page');
    expect(link(root, 'Ajustes').getAttribute('aria-current')).toBeNull();
    await harness.navigateByUrl('/app/ajustes');
    await harness.fixture.whenStable();
    expect(link(root, 'Ajustes').getAttribute('aria-current')).toBe('page');
    expect(link(root, 'Panel').getAttribute('aria-current')).toBeNull();
  });

  it('skip link moves focus to main without changing the URL', async () => {
    const { harness, root, router } = await mount();
    const before = router.url;
    const skip = root.querySelector('a.skip-link') as HTMLAnchorElement;
    expect(skip.textContent).toContain('Saltar al contenido');
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    skip.dispatchEvent(event);
    await harness.fixture.whenStable();
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(root.querySelector('main#contenido'));
    expect(root.querySelector('main')?.getAttribute('tabindex')).toBe('-1');
    expect(router.url).toBe(before);
  });

  it('shows the disclaimer in the footer', async () => {
    const { root } = await mount();
    expect(root.querySelector('footer')?.textContent).toContain(
      'Cifras estimadas; el banco tiene la última palabra. No es asesoría financiera.',
    );
  });

  it('focuses the page h1 after navigation, main when there is none, and not on first load', async () => {
    const { harness, root } = await mount();
    await harness.fixture.whenStable();
    expect(document.activeElement).not.toBe(root.querySelector('h1'));
    await harness.navigateByUrl('/app/prestamos');
    await harness.fixture.whenStable();
    expect(document.activeElement).toBe(root.querySelector('h1'));
    await harness.navigateByUrl('/app/ajustes');
    await harness.fixture.whenStable();
    expect(document.activeElement).toBe(root.querySelector('main'));
  });

  it('does not move focus on a query-only or fragment-only navigation', async () => {
    const { harness, root } = await mount();
    await harness.navigateByUrl('/app/prestamos');
    await harness.fixture.whenStable();
    const button = document.createElement('button');
    root.append(button);
    button.focus();
    await harness.navigateByUrl('/app/prestamos?orden=fecha');
    await harness.fixture.whenStable();
    expect(document.activeElement).toBe(button);
    await harness.navigateByUrl('/app/prestamos?orden=fecha#fin');
    await harness.fixture.whenStable();
    expect(document.activeElement).toBe(button);
  });

  it('has a responsive layout: wraps at 375px and is capped and centred from 1280px', () => {
    const styles = (AppShellComponent as unknown as { ɵcmp: { styles: string[] } }).ɵcmp.styles.join('');
    expect(styles).toMatch(/flex-wrap:\s*wrap/);
    expect(styles).toMatch(/@media \(min-width: 80rem\)/);
    expect(styles).toMatch(/max-width/);
  });
});
