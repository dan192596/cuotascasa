import { signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataError, type PassphraseChangeOutcome, type SyncService } from '../../../data/api.ts';
import { SYNC_SERVICE } from '../../../data/tokens.ts';
import { SettingsSyncComponent } from './settings-sync.component.ts';

/** The status union of the frozen contract, without importing the sync package (not allowed in features). */
type SyncStatus = ReturnType<SyncService['status']>;

const PHRASE = 'frase sintetica de prueba 2031';

interface FakeSync extends SyncService {
  readonly status: WritableSignal<SyncStatus>;
  readonly statusText: WritableSignal<string>;
  readonly prepare: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
  readonly connect: ReturnType<typeof vi.fn<() => Promise<void>>>;
  readonly setPassphrase: ReturnType<typeof vi.fn<(p: string) => Promise<void>>>;
  readonly changePassphrase: ReturnType<typeof vi.fn<(p: string) => Promise<PassphraseChangeOutcome>>>;
  readonly sync: ReturnType<typeof vi.fn<() => Promise<void>>>;
  readonly disconnect: ReturnType<typeof vi.fn<() => Promise<void>>>;
}

function fakeSync(status: SyncStatus, text: string, configured = true): FakeSync {
  return {
    configured: signal(configured).asReadonly(),
    status: signal(status),
    statusText: signal(text),
    prepare: vi.fn(() => Promise.resolve(true)),
    connect: vi.fn(() => Promise.resolve()),
    setPassphrase: vi.fn(() => Promise.resolve()),
    changePassphrase: vi.fn(() => Promise.resolve<PassphraseChangeOutcome>('changed')),
    sync: vi.fn(() => Promise.resolve()),
    disconnect: vi.fn(() => Promise.resolve()),
  } as unknown as FakeSync;
}

function mount(sync: FakeSync): ComponentFixture<SettingsSyncComponent> {
  TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: SYNC_SERVICE, useValue: sync }] });
  const fixture = TestBed.createComponent(SettingsSyncComponent);
  fixture.detectChanges();
  return fixture;
}

const el = (f: ComponentFixture<unknown>, id: string) =>
  (f.nativeElement as HTMLElement).querySelector<HTMLElement>(`[data-testid="${id}"]`);
const text = (f: ComponentFixture<unknown>, id: string) => el(f, id)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;

async function settle(f: ComponentFixture<unknown>): Promise<void> {
  await f.whenStable();
  f.detectChanges();
}

function click(f: ComponentFixture<unknown>, id: string): void {
  el(f, id)?.click();
  f.detectChanges();
}

function type(f: ComponentFixture<unknown>, id: string, value: string): void {
  const input = el(f, id) as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input'));
  f.detectChanges();
}

beforeEach(() => {
  TestBed.resetTestingModule();
  localStorage.clear();
  sessionStorage.clear();
});

describe('cc-settings-sync: not configured', () => {
  it('shows the status text and no connect action, and contacts nothing', () => {
    const sync = fakeSync({ state: 'not-configured' }, 'No configurado', false);
    const f = mount(sync);
    expect(text(f, 'drive-status')).toBe('No configurado');
    expect(el(f, 'drive-connect')).toBeNull();
    expect(sync.prepare).not.toHaveBeenCalled();
  });
});

describe('cc-settings-sync: two-step connect', () => {
  it('does not contact Google when the screen loads, and explains the scope with a link to /privacidad', () => {
    const sync = fakeSync({ state: 'disconnected' }, 'Drive desconectado');
    const f = mount(sync);
    expect(sync.prepare).not.toHaveBeenCalled();
    expect(sync.connect).not.toHaveBeenCalled();
    expect(text(f, 'drive-status')).toBe('Drive desconectado');
    expect(text(f, 'drive-connect')).toBe('Conectar Drive');
    expect(el(f, 'drive-continue')).toBeNull();
    expect(text(f, 'drive-scope')).toContain('drive.appdata');
    expect(el(f, 'drive-privacy-link')?.getAttribute('href')).toBe('/privacidad');
  });

  it('«Conectar Drive» only prepares; «Continuar con Google» then calls connect() synchronously in the click', async () => {
    const sync = fakeSync({ state: 'disconnected' }, 'Drive desconectado');
    const f = mount(sync);
    click(f, 'drive-connect');
    expect(sync.prepare).toHaveBeenCalledTimes(1);
    expect(sync.connect).not.toHaveBeenCalled();
    await settle(f);
    expect(text(f, 'drive-continue')).toBe('Continuar con Google');
    expect(el(f, 'drive-connect')).toBeNull();

    (el(f, 'drive-continue') as HTMLButtonElement).click();
    // No await between the click and this assertion: the call happened inside the gesture.
    expect(sync.connect).toHaveBeenCalledTimes(1);
    expect(sync.prepare).toHaveBeenCalledTimes(1);
  });

  it('shows a fixed error and keeps «Conectar Drive» when prepare() reports false', async () => {
    const sync = fakeSync({ state: 'disconnected' }, 'Drive desconectado');
    sync.prepare.mockResolvedValueOnce(false);
    const f = mount(sync);
    click(f, 'drive-connect');
    await settle(f);
    expect(el(f, 'drive-continue')).toBeNull();
    expect(text(f, 'drive-connect')).toBe('Conectar Drive');
    expect(text(f, 'drive-error')).toBe(
      'No se pudo preparar la conexión con Google. Revisa tu conexión e inténtalo de nuevo.',
    );
  });

  it('after a reload (needs-auth) it routes through prepare then connect again, and never through sync()', async () => {
    const sync = fakeSync({ state: 'needs-auth' }, 'Falta autorizar Drive');
    const f = mount(sync);
    expect(text(f, 'drive-status')).toBe('Falta autorizar Drive');
    expect(el(f, 'drive-sync')).toBeNull();
    click(f, 'drive-connect');
    await settle(f);
    click(f, 'drive-continue');
    expect(sync.prepare).toHaveBeenCalledTimes(1);
    expect(sync.connect).toHaveBeenCalledTimes(1);
    expect(sync.sync).not.toHaveBeenCalled();
  });

  it('goes back to the first button when connecting finished without a connection', async () => {
    const sync = fakeSync({ state: 'disconnected' }, 'Sin conexión con Drive');
    const f = mount(sync);
    click(f, 'drive-connect');
    await settle(f);
    click(f, 'drive-continue');
    await settle(f);
    expect(text(f, 'drive-connect')).toBe('Conectar Drive');
    expect(el(f, 'drive-continue')).toBeNull();
  });

  it('shows a Spanish notice, not the raw error, when the service rejects', async () => {
    const sync = fakeSync({ state: 'disconnected' }, 'Drive desconectado');
    sync.connect.mockRejectedValueOnce(new DataError('STORAGE', 'SYNC_STORAGE_FAILURE Q 1,234.56'));
    const f = mount(sync);
    click(f, 'drive-connect');
    await settle(f);
    click(f, 'drive-continue');
    await settle(f);
    const notice = text(f, 'drive-error') ?? '';
    expect(notice).toContain('navegador');
    expect(notice).not.toContain('SYNC_STORAGE_FAILURE');
    expect(notice).not.toContain('1,234.56');
  });
});

describe('cc-settings-sync: passphrase setup', () => {
  const noKey: SyncStatus = { state: 'needs-passphrase', reason: 'no-key' };

  it('shows the setup form with the unrecoverable warning and a link to the privacy page', () => {
    const f = mount(fakeSync(noKey, 'Falta la frase de cifrado'));
    expect(text(f, 'drive-status')).toBe('Falta la frase de cifrado');
    expect(el(f, 'passphrase-form')).not.toBeNull();
    expect(text(f, 'passphrase-warning')).toContain('no se puede recuperar');
    expect(el(f, 'passphrase-confirm')).not.toBeNull();
  });

  it.each([
    ['KeyMismatch', 'La frase cambió en otro dispositivo: ingrésala de nuevo'],
    ['WrongPassphraseOrTamper', 'La frase no coincide con la copia de Drive: revísala e inténtalo de nuevo'],
  ] as const)('keeps the distinct service text for %s and asks for the existing phrase only', (reason, expected) => {
    const f = mount(fakeSync({ state: 'needs-passphrase', reason }, expected));
    expect(text(f, 'drive-status')).toBe(expected);
    expect(el(f, 'passphrase-form')).not.toBeNull();
    expect(el(f, 'passphrase-confirm')).toBeNull();
    expect(el(f, 'passphrase-strength')).toBeNull();
  });

  it('toggles the visibility of the phrase', () => {
    const f = mount(fakeSync(noKey, 'Falta la frase de cifrado'));
    const input = el(f, 'passphrase-input') as HTMLInputElement;
    const toggle = el(f, 'passphrase-toggle') as HTMLButtonElement;
    expect(input.type).toBe('password');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    toggle.click();
    f.detectChanges();
    expect(input.type).toBe('text');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect((el(f, 'passphrase-confirm') as HTMLInputElement).type).toBe('text');
  });

  it('rates the phrase with a strength meter', () => {
    const f = mount(fakeSync(noKey, 'Falta la frase de cifrado'));
    type(f, 'passphrase-input', 'Ab1!');
    expect(text(f, 'passphrase-strength')).toContain('Débil');
    type(f, 'passphrase-input', PHRASE);
    expect(text(f, 'passphrase-strength')).toContain('Fuerte');
  });

  it('refuses an empty phrase or a mismatching confirmation without calling the service', async () => {
    const sync = fakeSync(noKey, 'Falta la frase de cifrado');
    const f = mount(sync);
    click(f, 'passphrase-submit');
    expect(text(f, 'passphrase-error')).toContain('Escribe una frase');
    type(f, 'passphrase-input', PHRASE);
    type(f, 'passphrase-confirm', PHRASE + 'x');
    click(f, 'passphrase-submit');
    await settle(f);
    expect(text(f, 'passphrase-error')).toContain('no coinciden');
    expect(sync.setPassphrase).not.toHaveBeenCalled();
  });

  it('sets the phrase without syncing, invites to sync now, focuses «Sincronizar» and stores nothing', async () => {
    const sync = fakeSync(noKey, 'Falta la frase de cifrado');
    sync.setPassphrase.mockImplementation(() => {
      sync.status.set({ state: 'idle', pendingChanges: 2, lastSyncAt: null });
      sync.statusText.set('Cambios sin sincronizar (2)');
      return Promise.resolve();
    });
    const f = mount(sync);
    type(f, 'passphrase-input', PHRASE);
    type(f, 'passphrase-confirm', PHRASE);
    click(f, 'passphrase-submit');
    await settle(f);
    expect(sync.setPassphrase).toHaveBeenCalledWith(PHRASE);
    expect(sync.sync).not.toHaveBeenCalled();
    expect(el(f, 'passphrase-input')).toBeNull();
    expect(el(f, 'passphrase-form')).toBeNull();
    expect(text(f, 'passphrase-done')).toContain('sincronizar');
    expect(document.activeElement).toBe(el(f, 'drive-sync'));
    expect(JSON.stringify({ ...localStorage })).not.toContain(PHRASE);
    expect(JSON.stringify({ ...sessionStorage })).not.toContain(PHRASE);
    expect((f.nativeElement as HTMLElement).innerHTML).not.toContain(PHRASE);
  });

  it('clears the fields as soon as the service was called, before it answers', () => {
    const sync = fakeSync(noKey, 'Falta la frase de cifrado');
    sync.setPassphrase.mockImplementation(() => new Promise<void>(() => undefined));
    const f = mount(sync);
    type(f, 'passphrase-input', PHRASE);
    type(f, 'passphrase-confirm', PHRASE);
    click(f, 'passphrase-submit');
    expect(sync.setPassphrase).toHaveBeenCalledWith(PHRASE);
    expect((el(f, 'passphrase-input') as HTMLInputElement).value).toBe('');
    expect((el(f, 'passphrase-confirm') as HTMLInputElement).value).toBe('');
  });

  it('does not sync when the phrase was rejected, and keeps the form with the service text', async () => {
    const sync = fakeSync(noKey, 'Falta la frase de cifrado');
    sync.setPassphrase.mockImplementation(() => {
      sync.status.set({ state: 'needs-passphrase', reason: 'WrongPassphraseOrTamper' });
      sync.statusText.set('La frase no coincide con la copia de Drive: revísala e inténtalo de nuevo');
      return Promise.resolve();
    });
    const f = mount(sync);
    type(f, 'passphrase-input', PHRASE);
    type(f, 'passphrase-confirm', PHRASE);
    click(f, 'passphrase-submit');
    await settle(f);
    expect(sync.sync).not.toHaveBeenCalled();
    expect(text(f, 'drive-status')).toContain('La frase no coincide');
    expect(el(f, 'passphrase-form')).not.toBeNull();
  });
});

describe('cc-settings-sync: connected', () => {
  const idle = (pending = 0, lastSyncAt: string | null = '2026-03-05T15:30:00.000Z'): SyncStatus =>
    ({ state: 'idle', pendingChanges: pending, lastSyncAt }) as SyncStatus;

  it('shows the status text, the last sync date and the actions', () => {
    const f = mount(fakeSync(idle(), 'Sincronizado'));
    expect(text(f, 'drive-status')).toBe('Sincronizado');
    expect(text(f, 'drive-last-sync')).toMatch(/0[45]\/03\/2026|05\/03\/2026/);
    expect(el(f, 'drive-sync')).not.toBeNull();
    expect(el(f, 'drive-disconnect')?.textContent?.trim()).toBe('Desconectar Drive');
    expect(el(f, 'drive-connect')).toBeNull();
  });

  it('says there is no sync yet when lastSyncAt is null', () => {
    const f = mount(fakeSync(idle(0, null), 'Listo para sincronizar'));
    expect(text(f, 'drive-last-sync')).toContain('Aún no se ha sincronizado');
  });

  it('shows the pending changes text of the service, offline too', () => {
    const f = mount(
      fakeSync({ state: 'offline', pendingChanges: 3 }, 'Sin conexión con Drive · Cambios sin sincronizar (3)'),
    );
    expect(text(f, 'drive-status')).toBe('Sin conexión con Drive · Cambios sin sincronizar (3)');
    expect(el(f, 'drive-sync')).not.toBeNull();
  });

  it('calls sync() directly inside the click handler', () => {
    const sync = fakeSync(idle(1), 'Cambios sin sincronizar (1)');
    const f = mount(sync);
    (el(f, 'drive-sync') as HTMLButtonElement).click();
    expect(sync.sync).toHaveBeenCalledTimes(1);
  });

  it('disables the actions while syncing', () => {
    const f = mount(fakeSync({ state: 'syncing' }, 'Sincronizando…'));
    expect((el(f, 'drive-sync') as HTMLButtonElement).disabled).toBe(true);
  });

  it('maps a rejected sync() to a Spanish notice', async () => {
    const sync = fakeSync(idle(1), 'Cambios sin sincronizar (1)');
    sync.sync.mockRejectedValueOnce(new DataError('VALIDATION', 'SYNC_NOT_CONNECTED'));
    const f = mount(sync);
    click(f, 'drive-sync');
    await settle(f);
    const notice = text(f, 'drive-error') ?? '';
    expect(notice).toContain('Conecta Drive');
    expect(notice).not.toContain('SYNC_NOT_CONNECTED');
  });

  it('«Desconectar Drive» calls disconnect() and leaves the local data alone', async () => {
    const sync = fakeSync(idle(), 'Sincronizado');
    sync.disconnect.mockImplementation(() => {
      sync.status.set({ state: 'disconnected' });
      sync.statusText.set('Drive desconectado');
      return Promise.resolve();
    });
    const f = mount(sync);
    click(f, 'drive-disconnect');
    await settle(f);
    expect(sync.disconnect).toHaveBeenCalledTimes(1);
    expect(text(f, 'drive-status')).toBe('Drive desconectado');
    expect(text(f, 'drive-connect')).toBe('Conectar Drive');
  });
});

describe('cc-settings-sync: change passphrase', () => {
  const idle = { state: 'idle', pendingChanges: 0, lastSyncAt: '2026-03-05T15:30:00.000Z' } as SyncStatus;

  it('opens a form with toggle, confirmation, strength meter and the unrecoverable warning', () => {
    const f = mount(fakeSync(idle, 'Sincronizado'));
    expect(el(f, 'passphrase-form')).toBeNull();
    click(f, 'passphrase-change-open');
    expect(el(f, 'passphrase-form')).not.toBeNull();
    expect(el(f, 'passphrase-confirm')).not.toBeNull();
    expect(el(f, 'passphrase-toggle')).not.toBeNull();
    expect(el(f, 'passphrase-strength')).not.toBeNull();
    expect(text(f, 'passphrase-warning')).toContain('no se puede recuperar');
    expect(text(f, 'passphrase-other-devices')).toContain('otros dispositivos');
  });

  it('changes the phrase and closes the form, without a sync of its own', async () => {
    const sync = fakeSync(idle, 'Sincronizado');
    const f = mount(sync);
    click(f, 'passphrase-change-open');
    type(f, 'passphrase-input', PHRASE);
    type(f, 'passphrase-confirm', PHRASE);
    click(f, 'passphrase-submit');
    await settle(f);
    expect(sync.changePassphrase).toHaveBeenCalledWith(PHRASE);
    expect(sync.sync).not.toHaveBeenCalled();
    expect(el(f, 'passphrase-form')).toBeNull();
    expect(text(f, 'passphrase-done')).toContain('Frase cambiada');
    expect((f.nativeElement as HTMLElement).innerHTML).not.toContain(PHRASE);
  });

  it('keeps the form open when another device is syncing, showing the service text', async () => {
    const sync = fakeSync(idle, 'Sincronizado');
    sync.changePassphrase.mockImplementation(() => {
      sync.statusText.set('Otro dispositivo está sincronizando; inténtalo de nuevo');
      return Promise.resolve<PassphraseChangeOutcome>('busy');
    });
    const f = mount(sync);
    click(f, 'passphrase-change-open');
    type(f, 'passphrase-input', PHRASE);
    type(f, 'passphrase-confirm', PHRASE);
    click(f, 'passphrase-submit');
    await settle(f);
    expect(el(f, 'passphrase-form')).not.toBeNull();
    expect(el(f, 'passphrase-done')).toBeNull();
    expect((el(f, 'passphrase-input') as HTMLInputElement).value).toBe('');
    expect(text(f, 'drive-status')).toContain('Otro dispositivo está sincronizando');
  });

  it.each([
    ['offline', { state: 'offline', pendingChanges: 1 }, 'Sin conexión con Drive · Cambios sin sincronizar (1)'],
    ['needs-auth', { state: 'needs-auth' }, 'Falta autorizar Drive'],
  ] as const)('shows no success text when the change failed and the status is %s', async (_name, status, label) => {
    const sync = fakeSync(idle, 'Sincronizado');
    sync.changePassphrase.mockImplementation(() => {
      sync.status.set(status as SyncStatus);
      sync.statusText.set(label);
      return Promise.resolve<PassphraseChangeOutcome>('failed');
    });
    const f = mount(sync);
    click(f, 'passphrase-change-open');
    type(f, 'passphrase-input', PHRASE);
    type(f, 'passphrase-confirm', PHRASE);
    click(f, 'passphrase-submit');
    await settle(f);
    expect(el(f, 'passphrase-done')).toBeNull();
    expect(text(f, 'drive-status')).toBe(label);
  });

  it('keeps the form open when the change failed', async () => {
    const sync = fakeSync(idle, 'Sincronizado');
    sync.changePassphrase.mockResolvedValue('failed');
    const f = mount(sync);
    click(f, 'passphrase-change-open');
    type(f, 'passphrase-input', PHRASE);
    type(f, 'passphrase-confirm', PHRASE);
    click(f, 'passphrase-submit');
    await settle(f);
    expect(el(f, 'passphrase-form')).not.toBeNull();
    expect(el(f, 'passphrase-done')).toBeNull();
  });

  it('can be cancelled', () => {
    const f = mount(fakeSync(idle, 'Sincronizado'));
    click(f, 'passphrase-change-open');
    click(f, 'passphrase-cancel');
    expect(el(f, 'passphrase-form')).toBeNull();
  });
});

describe('cc-settings-sync: leaving Drive, focus and live regions', () => {
  it('offers «Desconectar Drive» when the token is missing (needs-auth) and in the passphrase mode', async () => {
    const auth = fakeSync({ state: 'needs-auth' }, 'Falta autorizar Drive');
    const f = mount(auth);
    expect(el(f, 'drive-disconnect')).not.toBeNull();
    click(f, 'drive-disconnect');
    expect(auth.disconnect).toHaveBeenCalledTimes(1);
    await settle(f);
    TestBed.resetTestingModule();
    const pass = fakeSync({ state: 'needs-passphrase', reason: 'no-key' }, 'Falta la frase de cifrado');
    const g = mount(pass);
    click(g, 'drive-disconnect');
    expect(pass.disconnect).toHaveBeenCalledTimes(1);
  });

  it('does not offer «Desconectar Drive» when plainly disconnected', () => {
    const f = mount(fakeSync({ state: 'disconnected' }, 'Drive desconectado'));
    expect(el(f, 'drive-disconnect')).toBeNull();
  });

  it('does not steal the focus on load', () => {
    mount(fakeSync({ state: 'disconnected' }, 'Drive desconectado'));
    expect(document.activeElement).toBe(document.body);
  });

  it('moves the focus to «Conectar Drive» after disconnecting', async () => {
    const sync = fakeSync({ state: 'idle', pendingChanges: 0, lastSyncAt: null }, 'Listo para sincronizar');
    sync.disconnect.mockImplementation(() => {
      sync.status.set({ state: 'disconnected' });
      sync.statusText.set('Drive desconectado');
      return Promise.resolve();
    });
    const f = mount(sync);
    click(f, 'drive-disconnect');
    await settle(f);
    await settle(f);
    expect(document.activeElement).toBe(el(f, 'drive-connect'));
  });

  it('moves the focus to the passphrase input when a sync ends in needs-passphrase', async () => {
    const sync = fakeSync({ state: 'idle', pendingChanges: 0, lastSyncAt: null }, 'Listo para sincronizar');
    sync.sync.mockImplementation(() => {
      sync.status.set({ state: 'needs-passphrase', reason: 'KeyMismatch' });
      sync.statusText.set('La frase cambió en otro dispositivo: ingrésala de nuevo');
      return Promise.resolve();
    });
    const f = mount(sync);
    click(f, 'drive-sync');
    await settle(f);
    await settle(f);
    expect(document.activeElement).toBe(el(f, 'passphrase-input'));
  });

  it('falls back to the section title when the new mode has no main control', async () => {
    const sync = fakeSync({ state: 'idle', pendingChanges: 0, lastSyncAt: null }, 'Listo para sincronizar');
    const f = mount(sync);
    sync.status.set({ state: 'not-configured' });
    f.detectChanges();
    await settle(f);
    await settle(f);
    expect(document.activeElement).toBe(el(f, 'drive-title'));
  });

  it('shows general errors as a polite status, and keeps the progress text in an always-present live region', async () => {
    const sync = fakeSync({ state: 'disconnected' }, 'Drive desconectado');
    sync.connect.mockRejectedValueOnce(new DataError('STORAGE'));
    const f = mount(sync);
    const progress = el(f, 'drive-progress');
    expect(progress?.getAttribute('role')).toBe('status');
    click(f, 'drive-connect');
    expect(el(f, 'drive-progress')).toBe(progress);
    expect(progress?.textContent).toContain('Preparando');
    await settle(f);
    click(f, 'drive-continue');
    await settle(f);
    expect(el(f, 'drive-error')?.getAttribute('role')).toBe('status');
  });
});
