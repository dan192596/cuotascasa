import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataError, type DeviceDataService } from '../../../data/api.ts';
import { DEVICE_DATA_SERVICE } from '../../../data/tokens.ts';
import { Announcer } from '../../../ui/feedback/announcer.service.ts';
import {
  DEVICE_CLEAR_FAILED_TEXT,
  DEVICE_CLEARED_STATUS,
  DEVICE_CLEAR_PARTIAL_TEXT,
  LEAVE_DELAY_MS,
  LEAVE_TO_APP,
  SettingsDeviceComponent,
} from './settings-device.component.ts';

function mount(clearAll: () => Promise<void>, delay = 0) {
  const device: DeviceDataService = { clearAll: vi.fn(clearAll) };
  const leave = vi.fn();
  const announcer = { polite: vi.fn(() => Promise.resolve()), assertive: vi.fn(() => Promise.resolve()) };
  TestBed.configureTestingModule({
    providers: [
      { provide: DEVICE_DATA_SERVICE, useValue: device },
      { provide: LEAVE_TO_APP, useValue: leave },
      { provide: LEAVE_DELAY_MS, useValue: delay },
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

  it('on success shows a visible polite status and then leaves with a full load of /app', async () => {
    const { fixture, device, leave, announcer } = mount(() => Promise.resolve());
    await openDialog(fixture);
    await typeWord(fixture, 'BORRAR');
    confirm(fixture).click();
    await settle(fixture);
    await vi.waitFor(() => expect(leave).toHaveBeenCalledTimes(1));
    expect(leave).toHaveBeenCalledWith(true);
    fixture.detectChanges();
    const status = el(fixture, 'device-progress');
    expect(status?.getAttribute('role')).toBe('status');
    expect(status?.textContent).toBe(DEVICE_CLEARED_STATUS);
    expect(device.clearAll).toHaveBeenCalledTimes(1);
    expect(announcer.assertive).not.toHaveBeenCalled();
  });

  it('waits the leave delay before loading /app', async () => {
    const { fixture, leave } = mount(() => Promise.resolve(), 80);
    await openDialog(fixture);
    await typeWord(fixture, 'BORRAR');
    confirm(fixture).click();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(leave).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(leave).toHaveBeenCalledTimes(1));
  });

  it('on a failure before any change says nothing changed, stays open and does not leave', async () => {
    const { fixture, leave, announcer } = mount(() =>
      Promise.reject(new DataError('STORAGE', 'DEVICE_NOTHING_CHANGED')),
    );
    await openDialog(fixture);
    await typeWord(fixture, 'BORRAR');
    confirm(fixture).click();
    await settle(fixture);
    await vi.waitFor(() => expect(el(fixture, 'device-error')).not.toBeNull());
    fixture.detectChanges();
    expect(el(fixture, 'device-error')?.textContent).toBe(DEVICE_CLEAR_FAILED_TEXT);
    expect(announcer.assertive).toHaveBeenCalledWith(DEVICE_CLEAR_FAILED_TEXT);
    expect(leave).not.toHaveBeenCalled();
    expect(el(fixture, 'device-dialog')).not.toBeNull();
    expect(confirm(fixture).disabled).toBe(false);
    expect(el(fixture, 'device-confirm-input')?.getAttribute('aria-describedby')).toBe('device-error');
  });

  it('on a failure after the data layer closed says part may be gone, then loads /app', async () => {
    const { fixture, leave, announcer } = mount(() => Promise.reject(new DataError('STORAGE', 'secret detail 12345')));
    await openDialog(fixture);
    await typeWord(fixture, 'BORRAR');
    confirm(fixture).click();
    await settle(fixture);
    await vi.waitFor(() => expect(leave).toHaveBeenCalledTimes(1));
    expect(leave).toHaveBeenCalledWith(false);
    fixture.detectChanges();
    expect(el(fixture, 'device-error')?.textContent).toBe(DEVICE_CLEAR_PARTIAL_TEXT);
    expect(el(fixture, 'device-error')?.textContent).not.toContain('No se cambió nada');
    expect(announcer.assertive).toHaveBeenCalledWith(DEVICE_CLEAR_PARTIAL_TEXT);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('secret detail');
  });

  it('while open the rest of the page is inert; closing restores it', async () => {
    const { fixture } = mount(() => Promise.resolve());
    const other = document.createElement('main');
    document.body.prepend(other);
    await openDialog(fixture);
    expect(other.hasAttribute('inert')).toBe(true);
    expect(el(fixture, 'device-dialog')?.closest('[inert]')).toBeNull();
    el(fixture, 'device-cancel')?.click();
    await settle(fixture);
    expect(other.hasAttribute('inert')).toBe(false);
  });

  it('while deleting the field is read-only (not disabled) and focus stays in the dialog', async () => {
    let finish: () => void = () => undefined;
    const { fixture } = mount(() => new Promise<void>((resolve) => (finish = resolve)));
    await openDialog(fixture);
    await typeWord(fixture, 'BORRAR');
    confirm(fixture).click();
    fixture.detectChanges();
    const input = el(fixture, 'device-confirm-input') as HTMLInputElement;
    expect(input.readOnly).toBe(true);
    expect(input.disabled).toBe(false);
    expect(el(fixture, 'device-dialog')?.contains(document.activeElement)).toBe(true);
    finish();
    await settle(fixture);
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
