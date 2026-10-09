import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SwUpdate, type VersionEvent } from '@angular/service-worker';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RELOAD_PAGE } from './pwa-update.service.ts';
import { createFakeSwUpdate } from './testing/fake-sw-update.ts';
import { UpdatePromptComponent } from './update-prompt.component.ts';

function setup() {
  const fake = createFakeSwUpdate();
  const reload = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      { provide: RELOAD_PAGE, useValue: reload },
      { provide: SwUpdate, useValue: fake.swUpdate },
    ],
  });
  const fixture = TestBed.createComponent(UpdatePromptComponent);
  fixture.detectChanges();
  return { fixture, versionUpdates: { next: fake.emit }, activateUpdate: fake.activateUpdate, reload };
}

const ready: VersionEvent = { type: 'VERSION_READY', currentVersion: { hash: 'a' }, latestVersion: { hash: 'b' } };

function snackBarElement(): HTMLElement | null {
  return document.querySelector('.mat-mdc-snack-bar-container');
}

afterEach(() => {
  TestBed.inject(MatSnackBar).dismiss();
});

describe('cc-update-prompt', () => {
  it('shows nothing until a version is ready', () => {
    setup();
    expect(snackBarElement()).toBeNull();
  });

  it('VERSION_READY opens a Spanish snackbar with an Actualizar action', async () => {
    const { fixture, versionUpdates } = setup();
    versionUpdates.next(ready);
    await fixture.whenStable();
    await vi.waitFor(() => {
      expect(snackBarElement()).not.toBeNull();
    });
    const text = snackBarElement()?.textContent ?? '';
    expect(text).toContain('Hay una versión nueva de CuotasCasa');
    expect(text).toContain('Actualizar');
  });

  it('accepting activates the update and reloads', async () => {
    const { fixture, versionUpdates, activateUpdate, reload } = setup();
    versionUpdates.next(ready);
    await fixture.whenStable();
    await vi.waitFor(() => {
      expect(snackBarElement()?.querySelector('button')).not.toBeNull();
    });
    snackBarElement()?.querySelector('button')?.click();
    await vi.waitFor(() => {
      expect(reload).toHaveBeenCalledTimes(1);
    });
    expect(activateUpdate).toHaveBeenCalledTimes(1);
  });

  it('dismissing without accepting neither activates nor reloads', async () => {
    const { fixture, versionUpdates, activateUpdate, reload } = setup();
    versionUpdates.next(ready);
    await fixture.whenStable();
    await vi.waitFor(() => {
      expect(snackBarElement()).not.toBeNull();
    });
    TestBed.inject(MatSnackBar).dismiss();
    await fixture.whenStable();
    expect(activateUpdate).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});
