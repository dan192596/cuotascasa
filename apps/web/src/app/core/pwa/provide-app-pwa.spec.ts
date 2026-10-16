import { ErrorHandler } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { provideAppPwa, REGISTER_WORKER } from './provide-app-pwa.ts';

const routes = ['', 'privacidad', 'app', 'app/ajustes', 'app/prestamos/nuevo'].map((path) => ({
  path,
  children: [],
}));

function setup(enabled: boolean, register: () => Promise<void> = () => Promise.resolve()) {
  const spy = vi.fn(register);
  const handleError = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes),
      provideAppPwa({ enabled }),
      { provide: REGISTER_WORKER, useValue: spy },
      { provide: ErrorHandler, useValue: { handleError } },
    ],
  });
  const router = TestBed.inject(Router);
  return { router, spy, handleError };
}

describe('provideAppPwa (ADR-0023)', () => {
  it('never registers on / or /privacidad', async () => {
    const { router, spy } = setup(true);
    await router.navigateByUrl('/');
    await router.navigateByUrl('/privacidad');
    expect(spy).not.toHaveBeenCalled();
  });

  it('registers after the first NavigationEnd into /app, and only once', async () => {
    const { router, spy } = setup(true);
    await router.navigateByUrl('/');
    expect(spy).not.toHaveBeenCalled();
    await router.navigateByUrl('/app');
    expect(spy).toHaveBeenCalledTimes(1);
    await router.navigateByUrl('/app/ajustes');
    await router.navigateByUrl('/privacidad');
    await router.navigateByUrl('/app/prestamos/nuevo');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('registers when the very first navigation is a deep /app route', async () => {
    const { router, spy } = setup(true);
    await router.navigateByUrl('/app/prestamos/nuevo');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('registers nothing when disabled (dev mode)', async () => {
    const { router, spy } = setup(false);
    await router.navigateByUrl('/app');
    expect(spy).not.toHaveBeenCalled();
  });

  it('a failed registration is not an app error (no toast) and is retried on the next /app navigation', async () => {
    // WebKit rejects register() with a TypeError when a quick navigation cancels the worker download (W5-07 review).
    let fail = true;
    const { router, spy, handleError } = setup(true, () =>
      fail ? Promise.reject(new TypeError('Script load failed')) : Promise.resolve(),
    );
    await router.navigateByUrl('/app');
    await vi.waitFor(() => {
      expect(spy).toHaveBeenCalledTimes(1);
    });
    await Promise.resolve();
    fail = false;
    await router.navigateByUrl('/privacidad');
    expect(spy).toHaveBeenCalledTimes(1);
    await router.navigateByUrl('/app/ajustes');
    expect(spy).toHaveBeenCalledTimes(2);
    await router.navigateByUrl('/app');
    expect(spy).toHaveBeenCalledTimes(2);
    expect(handleError).not.toHaveBeenCalled();
  });
});
