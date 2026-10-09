import { TestBed } from '@angular/core/testing';
import type { SwUpdate, VersionEvent } from '@angular/service-worker';
import { describe, expect, it, vi } from 'vitest';
import { PwaUpdateService, RELOAD_PAGE, SW_UPDATE } from './pwa-update.service.ts';
import { createFakeSwUpdate } from './testing/fake-sw-update.ts';

function setup(options: { swUpdate?: SwUpdate | null; activate?: () => Promise<boolean> } = {}) {
  const fake = createFakeSwUpdate(options.activate);
  const reload = vi.fn();
  const swUpdate = options.swUpdate === undefined ? fake.swUpdate : options.swUpdate;
  TestBed.configureTestingModule({
    providers: [
      { provide: RELOAD_PAGE, useValue: reload },
      { provide: SW_UPDATE, useValue: () => Promise.resolve(swUpdate) },
    ],
  });
  const service = TestBed.inject(PwaUpdateService);
  // The lazy SwUpdate load resolves on a microtask.
  const loaded = Promise.resolve().then(() => Promise.resolve());
  return { service, emit: fake.emit, activateUpdate: fake.activateUpdate, reload, loaded };
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

  it('flags VERSION_READY and ignores the other version events', async () => {
    const { service, emit, loaded } = setup();
    await loaded;
    emit({ type: 'VERSION_DETECTED', version: { hash: 'b' } });
    emit({ type: 'NO_NEW_VERSION_DETECTED', version: { hash: 'a' } });
    expect(service.updateReady()).toBe(false);
    emit(ready);
    expect(service.updateReady()).toBe(true);
  });

  it('activates the new version and then reloads', async () => {
    const { service, emit, activateUpdate, reload, loaded } = setup();
    await loaded;
    emit(ready);
    await service.activateAndReload();
    expect(activateUpdate).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(service.updateReady()).toBe(false);
  });

  it('does not reload before the activation resolves', async () => {
    let finish: (value: boolean) => void = () => undefined;
    const { service, reload, loaded } = setup({
      activate: () => new Promise<boolean>((resolve) => (finish = resolve)),
    });
    await loaded;
    const pending = service.activateAndReload();
    expect(reload).not.toHaveBeenCalled();
    finish(true);
    await pending;
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('still reloads when the activation fails (the worker may already have swapped)', async () => {
    const { service, reload, loaded } = setup({ activate: () => Promise.reject(new Error('no sw')) });
    await loaded;
    await service.activateAndReload();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('is inert when there is no SwUpdate (dev, specs, unsupported browsers)', async () => {
    const { service, reload, loaded } = setup({ swUpdate: null });
    await loaded;
    expect(service.updateReady()).toBe(false);
    await service.activateAndReload();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
