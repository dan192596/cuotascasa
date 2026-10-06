import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { describe, expect, it } from 'vitest';
import { appConfig } from './app.config.ts';

/** Every URL of the spec §9 route table and the page test ids its render must contain. */
const PAGES: ReadonlyArray<readonly [url: string, testIds: readonly string[]]> = [
  ['/', ['page-landing']],
  ['/privacidad', ['page-privacy']],
  ['/app', ['page-app', 'page-dashboard']],
  ['/app/prestamos', ['page-app', 'page-dashboard']],
  ['/app/prestamos/nuevo', ['page-app', 'page-loan-new']],
  ['/app/prestamos/loan-1', ['page-app', 'page-loan-detail']],
  ['/app/prestamos/loan-1/tabla', ['page-app', 'page-schedule']],
  ['/app/prestamos/loan-1/datos-reales', ['page-app', 'page-real-data']],
  ['/app/prestamos/loan-1/proyecciones', ['page-app', 'page-scenarios']],
  ['/app/ajustes', ['page-app', 'page-settings']],
  ['/no-existe', ['page-not-found']],
];

async function render(url: string): Promise<{ root: HTMLElement; router: Router }> {
  // The real root providers (router features, LOCALE_ID and the core provide*()): a page or a shell slot that
  // injects a root-provided service renders here as it does in the app.
  TestBed.configureTestingModule({ providers: appConfig.providers });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  return { root: harness.fixture.nativeElement as HTMLElement, router: TestBed.inject(Router) };
}

describe('app.routes.ts', () => {
  it.each(PAGES)('%s renders %j', async (url, testIds) => {
    const { root } = await render(url);
    for (const testId of testIds) {
      expect(root.querySelector(`[data-testid="${testId}"]`), testId).not.toBeNull();
    }
  });

  it('passes :id down to the page of every loan sub-route', async () => {
    for (const suffix of ['', '/tabla', '/datos-reales', '/proyecciones']) {
      const { router } = await render(`/app/prestamos/loan-7${suffix}`);
      let leaf = router.routerState.snapshot.root;
      while (leaf.firstChild) {
        leaf = leaf.firstChild;
      }
      expect(leaf.params['id'], suffix).toBe('loan-7');
      TestBed.resetTestingModule();
    }
  });
});
