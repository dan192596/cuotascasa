import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataError, type DeviceDataService } from '../../../data/api.ts';
import { DEVICE_DATA_SERVICE } from '../../../data/tokens.ts';
import { Announcer } from '../../../ui/feedback/announcer.service.ts';
import {
  DEVICE_CLEAR_FAILED_TEXT,
  DEVICE_CLEARED_ANNOUNCEMENT,
  LEAVE_TO_APP,
  SettingsDeviceComponent,
} from './settings-device.component.ts';

function mount(clearAll: () => Promise<void>) {
  const device: DeviceDataService = { clearAll: vi.fn(clearAll) };
  const leave = vi.fn();
  const announcer = { polite: vi.fn(() => Promise.resolve()), assertive: vi.fn(() => Promise.resolve()) };
  TestBed.configureTestingModule({
    providers: [
      { provide: DEVICE_DATA_SERVICE, useValue: device },
      { provide: LEAVE_TO_APP, useValue: leave },
      { provide: Announcer, useValue: announcer },
    ],
  });
  const fixture = TestBed.createComponent(SettingsDeviceComponent);
  document.body.appendChild(fixture.nativeElement as HTMLElement);
  fixture.detectChanges();
  return { fixture, device, leave, announcer };
}

const el = (f: ComponentFixture<unknown>, id: string) =>
  (f.nativeElement as HTMLElement).querySelector<HTMLElement>(`[data-testid="${id}"]`);

async function settle(f: ComponentFixture<unknown>): Promise<void> {
  await f.whenStable();
  f.detectChanges();
}

async function openDialog(f: ComponentFixture<unknown>): Promise<void> {
  el(f, 'device-open')?.focus();
  el(f, 'device-open')?.click();
  await settle(f);
}

async function typeWord(f: ComponentFixture<unknown>, value: string): Promise<void> {
  const input = el(f, 'device-confirm-input') as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input'));
  await settle(f);
}

const confirm = (f: ComponentFixture<unknown>) => el(f, 'device-confirm') as HTMLButtonElement;

describe('cc-settings-device (W7-04)', () => {
  beforeEach(() => TestBed.resetTestingModule());
  afterEach(() => document.body.replaceChildren());

  it('explains what is erased and how to delete the Drive copy, and shows no dialog at first', () => {
    const { fixture } = mount(() => Promise.resolve());
    expect(el(fixture, 'device-title')?.textContent).toContain('Borrar datos de este dispositivo');
    const erases = el(fixture, 'device-erases')?.textContent ?? '';
    for (const part of ['préstamos', 'datos reales', 'escenarios', 'ajustes', 'clave de cifrado']) {
      expect(erases).toContain(part);
    }
    const keeps = el(fixture, 'device-keeps')?.textContent ?? '';
    expect(keeps).toContain('No se borra la copia en Google Drive');
    expect(keeps).toContain('Administrar aplicaciones');
    expect(keeps).toContain('Borrar datos ocultos de la aplicación');
    expect(el(fixture, 'device-dialog')).toBeNull();
  });

  it('opens a labelled alert dialog with the field focused and the action disabled', async () => {
    const { fixture } = mount(() => Promise.resolve());
    await openDialog(fixture);
    const dialog = el(fixture, 'device-dialog');
    expect(dialog?.getAttribute('role')).toBe('alertdialog');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(el(fixture, 'device-confirm-input'));
    expect(confirm(fixture).disabled).toBe(true);
  });

  it('arms only with BORRAR (case-sensitive, trimmed)', async () => {
    const { fixture } = mount(() => Promise.resolve());
    await openDialog(fixture);
    for (const wrong of ['', 'borrar', 'Borrar', 'BORRA', 'BORRARR', 'BO RRAR']) {
      await typeWord(fixture, wrong);
      expect(confirm(fixture).disabled, wrong).toBe(true);
    }
    await typeWord(fixture, '  BORRAR ');
    expect(confirm(fixture).disabled).toBe(false);
  });

  it('cancel and Escape change nothing and return focus to the opener', async () => {
    const { fixture, device } = mount(() => Promise.resolve());
    await openDialog(fixture);
    await typeWord(fixture, 'BORRAR');
    el(fixture, 'device-cancel')?.click();
    await settle(fixture);
    expect(el(fixture, 'device-dialog')).toBeNull();
    expect(document.activeElement).toBe(el(fixture, 'device-open'));

    await openDialog(fixture);
    expect((el(fixture, 'device-confirm-input') as HTMLInputElement).value).toBe('');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle(fixture);
    expect(el(fixture, 'device-dialog')).toBeNull();
    expect(device.clearAll).not.toHaveBeenCalled();
  });

  it('does not delete when submitted unarmed (Enter in the field)', async () => {
    const { fixture, device } = mount(() => Promise.resolve());
    await openDialog(fixture);
    await typeWord(fixture, 'borrar');
    el(fixture, 'device-dialog')?.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle(fixture);
    expect(device.clearAll).not.toHaveBeenCalled();
  });

  it('on success announces politely and then leaves with a full load of /app', async () => {
    const { fixture, device, leave, announcer } = mount(() => Promise.resolve());
    await openDialog(fixture);
    await typeWord(fixture, 'BORRAR');
    confirm(fixture).click();
    await settle(fixture);
    await vi.waitFor(() => expect(leave).toHaveBeenCalledTimes(1));
    expect(device.clearAll).toHaveBeenCalledTimes(1);
    expect(announcer.polite).toHaveBeenCalledWith(DEVICE_CLEARED_ANNOUNCEMENT);
    expect(announcer.assertive).not.toHaveBeenCalled();
    expect(announcer.polite.mock.invocationCallOrder[0]).toBeLessThan(leave.mock.invocationCallOrder[0] ?? 0);
  });

  it('on failure announces assertively with a fixed text, keeps the dialog and does not leave', async () => {
    const { fixture, leave, announcer } = mount(() => Promise.reject(new DataError('STORAGE', 'secret detail 12345')));
    await openDialog(fixture);
    await typeWord(fixture, 'BORRAR');
    confirm(fixture).click();
    await settle(fixture);
    await vi.waitFor(() => expect(el(fixture, 'device-error')).not.toBeNull());
    fixture.detectChanges();
    expect(el(fixture, 'device-error')?.textContent).toBe(DEVICE_CLEAR_FAILED_TEXT);
    expect(announcer.assertive).toHaveBeenCalledWith(DEVICE_CLEAR_FAILED_TEXT);
    expect(announcer.polite).not.toHaveBeenCalled();
    expect(leave).not.toHaveBeenCalled();
    expect(el(fixture, 'device-dialog')).not.toBeNull();
    expect(confirm(fixture).disabled).toBe(false);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('secret detail');
  });

  it('ignores Escape and a second submit while deleting', async () => {
    let finish: () => void = () => undefined;
    const { fixture, device } = mount(() => new Promise<void>((resolve) => (finish = resolve)));
    await openDialog(fixture);
    await typeWord(fixture, 'BORRAR');
    confirm(fixture).click();
    fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    el(fixture, 'device-dialog')?.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();
    expect(el(fixture, 'device-dialog')).not.toBeNull();
    expect(device.clearAll).toHaveBeenCalledTimes(1);
    finish();
    await settle(fixture);
  });
});
