import { TestBed } from '@angular/core/testing';
import { SwUpdate, type VersionEvent } from '@angular/service-worker';
import { describe, expect, it, vi } from 'vitest';
import { PwaUpdateService, RELOAD_PAGE } from './pwa-update.service.ts';
import { createFakeSwUpdate } from './testing/fake-sw-update.ts';

function setup(options: { swUpdate?: boolean; activate?: () => Promise<boolean> } = {}) {
  const fake = createFakeSwUpdate(options.activate);
  const reload = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      { provide: RELOAD_PAGE, useValue: reload },
      ...(options.swUpdate === false ? [] : [{ provide: SwUpdate, useValue: fake.swUpdate }]),
    ],
  });
  return {
    service: TestBed.inject(PwaUpdateService),
    versionUpdates: { next: fake.emit },
    activateUpdate: fake.activateUpdate,
    reload,
  };
}

const ready: VersionEvent = {
  type: 'VERSION_READY',
  currentVersion: { hash: 'a' },
  latestVersion: { hash: 'b' },
};

describe('PwaUpdateService', () => {
  it('starts without an update ready', () => {
    expect(setup().service.updateReady()).toBe(false);
  });

  it('flags VERSION_READY and ignores the other version events', () => {
    const { service, versionUpdates } = setup();
    versionUpdates.next({ type: 'VERSION_DETECTED', version: { hash: 'b' } });
    versionUpdates.next({ type: 'NO_NEW_VERSION_DETECTED', version: { hash: 'a' } });
    expect(service.updateReady()).toBe(false);
    versionUpdates.next(ready);
    expect(service.updateReady()).toBe(true);
  });

  it('activates the new version and then reloads', async () => {
    const { service, versionUpdates, activateUpdate, reload } = setup();
    versionUpdates.next(ready);
    await service.activateAndReload();
    expect(activateUpdate).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(service.updateReady()).toBe(false);
  });

  it('does not reload before the activation resolves', async () => {
    let finish: (value: boolean) => void = () => undefined;
    const { service, reload } = setup({ activate: () => new Promise<boolean>((resolve) => (finish = resolve)) });
    const pending = service.activateAndReload();
    expect(reload).not.toHaveBeenCalled();
    finish(true);
    await pending;
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('still reloads when the activation fails (the worker may already have swapped)', async () => {
    const { service, reload } = setup({ activate: () => Promise.reject(new Error('no sw')) });
    await service.activateAndReload();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('is inert when SwUpdate is not provided (specs, public pages)', async () => {
    const { service, reload } = setup({ swUpdate: false });
    expect(service.updateReady()).toBe(false);
    await service.activateAndReload();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
