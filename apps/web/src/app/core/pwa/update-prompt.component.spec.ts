import { TestBed } from '@angular/core/testing';
import type { VersionEvent } from '@angular/service-worker';
import { describe, expect, it, vi } from 'vitest';
import { RELOAD_PAGE, SW_UPDATE } from './pwa-update.service.ts';
import { createFakeSwUpdate } from './testing/fake-sw-update.ts';
import { UpdatePromptComponent } from './update-prompt.component.ts';

async function setup() {
  const fake = createFakeSwUpdate();
  const reload = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      { provide: RELOAD_PAGE, useValue: reload },
      { provide: SW_UPDATE, useValue: () => Promise.resolve(fake.swUpdate) },
    ],
  });
  const fixture = TestBed.createComponent(UpdatePromptComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  return { fixture, root, emit: fake.emit, activateUpdate: fake.activateUpdate, reload };
}

const ready: VersionEvent = { type: 'VERSION_READY', currentVersion: { hash: 'a' }, latestVersion: { hash: 'b' } };

describe('cc-update-prompt', () => {
  it('shows nothing until a version is ready', async () => {
    const { root } = await setup();
    expect(root.querySelector('[role="status"]')).toBeNull();
  });

  it('VERSION_READY shows a Spanish role=status prompt with an Actualizar button', async () => {
    const { fixture, root, emit } = await setup();
    emit(ready);
    fixture.detectChanges();
    const status = root.querySelector('[role="status"]');
    expect(status?.textContent).toContain('Hay una versión nueva de CuotasCasa.');
    const button = status?.querySelector('button');
    expect(button?.textContent.trim()).toBe('Actualizar');
    expect(button?.getAttribute('type')).toBe('button');
  });

  it('keeps the live region in the DOM only while an update is waiting', async () => {
    const { fixture, root, emit } = await setup();
    emit(ready);
    fixture.detectChanges();
    root.querySelector('button')?.click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root.querySelector('[role="status"]')).toBeNull();
    });
  });

  it('accepting activates the update and reloads', async () => {
    const { fixture, root, emit, activateUpdate, reload } = await setup();
    emit(ready);
    fixture.detectChanges();
    root.querySelector('button')?.click();
    await vi.waitFor(() => {
      expect(reload).toHaveBeenCalledTimes(1);
    });
    expect(activateUpdate).toHaveBeenCalledTimes(1);
  });

  it('does not touch Angular Material (keeps the /app bundle small)', async () => {
    const { fixture, emit } = await setup();
    emit(ready);
    fixture.detectChanges();
    expect(document.querySelector('.mat-mdc-snack-bar-container')).toBeNull();
  });
});
