import { signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DataError,
  type BackupFile,
  type BackupImportError,
  type BackupService,
  type PendingImport,
  type StorageHealth,
  type SyncService,
} from '../../../data/api.ts';
import { BACKUP_SERVICE, STORAGE_HEALTH, SYNC_SERVICE } from '../../../data/tokens.ts';
import { SettingsBackupComponent } from './settings-backup.component.ts';

const PREVIEW: PendingImport['preview'] = {
  sourceVersion: 1,
  exportedAt: '2026-10-04T16:00:00.000Z',
  appVersion: '1.0.0',
  counts: {
    loans: { active: 1, tombstoned: 0 },
    events: { active: 3, tombstoned: 1 },
    reportedBalances: { active: 2, tombstoned: 0 },
    payments: { active: 0, tombstoned: 0 },
    scenarios: { active: 1, tombstoned: 0 },
    settings: { active: 1, tombstoned: 0 },
  },
};

type PreviewResult = { ok: true; value: PendingImport } | { ok: false; error: BackupImportError };
const failure = (code: BackupImportError['code']): PreviewResult => ({
  ok: false,
  error: { code, message: 'raw 123.45' },
});
const pendingOk = (encrypted = false): PreviewResult => ({
  ok: true,
  value: { id: 'p1', preview: PREVIEW, encrypted },
});

interface Setup {
  readonly reminderDue?: boolean;
  readonly lastBackupAt?: string | null;
  readonly changes?: number;
  readonly drive?: SyncService['status'] extends () => infer S ? S : never;
  readonly persisted?: boolean | null;
  readonly safari?: boolean;
  readonly previews?: PreviewResult[];
}

interface Harness {
  readonly fixture: ComponentFixture<SettingsBackupComponent>;
  readonly backup: {
    [K in keyof BackupService]: BackupService[K] extends (...a: never[]) => unknown
      ? ReturnType<typeof vi.fn>
      : BackupService[K];
  };
  readonly health: { requestPersist: ReturnType<typeof vi.fn>; persisted: WritableSignal<boolean | null> };
  readonly click: ReturnType<typeof vi.fn>;
}

function mount(setup: Setup = {}): Harness {
  const previews = [...(setup.previews ?? [])];
  const backup = {
    lastBackupAt: signal(setup.lastBackupAt ?? null).asReadonly(),
    changesSinceBackup: signal(setup.changes ?? 0).asReadonly(),
    reminderDue: signal(setup.reminderDue ?? false).asReadonly(),
    exportJson: vi.fn((o?: { passphrase?: string }): Promise<BackupFile> =>
      Promise.resolve({
        fileName: 'cuotascasa-respaldo-2026-10-16.json',
        blob: new Blob(['{}']),
        encrypted: o?.passphrase !== undefined,
      }),
    ),
    markExported: vi.fn((): Promise<void> => Promise.resolve()),
    previewImport: vi.fn(() => Promise.resolve(previews.shift() ?? pendingOk())),
    confirmImport: vi.fn(() => Promise.resolve({ undoToken: 'u1' })),
    cancelImport: vi.fn(),
    undoImport: vi.fn(() => Promise.resolve()),
  };
  const persisted = signal<boolean | null>(setup.persisted ?? null);
  const health = {
    persisted,
    estimate: signal({ usageBytes: 1536, quotaBytes: 5 * 1024 * 1024 }).asReadonly(),
    safariNonStandalone: signal(setup.safari ?? false).asReadonly(),
    requestPersist: vi.fn(() => {
      persisted.set(true);
      return Promise.resolve(true);
    }),
  };
  const sync = {
    status: signal(setup.drive ?? { state: 'not-configured' as const }).asReadonly(),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: BACKUP_SERVICE, useValue: backup },
      { provide: STORAGE_HEALTH, useValue: health as unknown as StorageHealth },
      { provide: SYNC_SERVICE, useValue: sync },
    ],
  });
  const click = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(click);
  const fixture = TestBed.createComponent(SettingsBackupComponent);
  document.body.appendChild(fixture.nativeElement as HTMLElement);
  fixture.detectChanges();
  return { fixture, backup: backup as unknown as Harness['backup'], health, click };
}

const root = (f: ComponentFixture<unknown>) => f.nativeElement as HTMLElement;
const byId = (f: ComponentFixture<unknown>, id: string) => root(f).querySelector<HTMLElement>(`[data-testid="${id}"]`);
const cells = (f: ComponentFixture<unknown>, id: string) =>
  [...(byId(f, id)?.querySelectorAll('th,td') ?? [])].map((c) => c.textContent?.trim());
const text = (f: ComponentFixture<unknown>, id: string) =>
  byId(f, id)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;

async function settle(f: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 4; i += 1) {
    await f.whenStable();
    f.detectChanges();
  }
}

async function click(f: ComponentFixture<unknown>, id: string): Promise<void> {
  const el = byId(f, id);
  if (el === null) throw new Error(`no element ${id}`);
  el.click();
  await settle(f);
}

async function type(f: ComponentFixture<unknown>, id: string, value: string): Promise<void> {
  const el = byId(f, id) as HTMLInputElement;
  el.value = value;
  el.dispatchEvent(new Event('input'));
  await settle(f);
}

async function chooseFile(f: ComponentFixture<unknown>): Promise<File> {
  const input = byId(f, 'import-file') as HTMLInputElement;
  const file = new File(['{}'], 'cuotascasa-respaldo-2026-10-04.json', { type: 'application/json' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change'));
  await settle(f);
  return file;
}

beforeEach(() => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }));
});
afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('backup status and reminder', () => {
  it('shows the last backup and no reminder when reminderDue() is false', () => {
    const { fixture } = mount({ lastBackupAt: new Date().toISOString(), changes: 4 });
    expect(text(fixture, 'backup-status')).toBe('Último respaldo: hoy');
    expect(text(fixture, 'backup-changes')).toContain('4');
    expect(byId(fixture, 'backup-reminder')).toBeNull();
  });

  it('shows the reminder exactly when the service says so, whatever the numbers', () => {
    const due = mount({ reminderDue: true, lastBackupAt: new Date().toISOString(), changes: 0 });
    expect(byId(due.fixture, 'backup-reminder')).not.toBeNull();
  });

  it('says there is no backup yet', () => {
    const { fixture } = mount();
    expect(text(fixture, 'backup-status')).toBe('Aún no has hecho un respaldo');
  });
});

describe('plain export and its warning', () => {
  it('warns before the first plain download of the session and links to the encrypted export', async () => {
    const h = mount();
    await click(h.fixture, 'export-plain');
    expect(h.backup.exportJson).not.toHaveBeenCalled();
    const warning = text(h.fixture, 'plain-warning') ?? '';
    expect(warning).toContain('el respaldo JSON no va cifrado y contiene datos financieros');
    const link = byId(h.fixture, 'warning-go-encrypted');
    expect(link).not.toBeNull();
    // HTMLAnchorElement.click is mocked to observe downloads, so dispatch the event instead.
    link?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await settle(h.fixture);
    expect(root(h.fixture).ownerDocument.activeElement).toBe(byId(h.fixture, 'passphrase'));
  });

  it('downloads after «Descargar de todos modos» and does not warn again in the session', async () => {
    const h = mount();
    await click(h.fixture, 'export-plain');
    await click(h.fixture, 'warning-continue');
    expect(h.backup.exportJson).toHaveBeenCalledWith();
    expect(h.click).toHaveBeenCalledTimes(1);
    // W9-01: the service no longer marks on export; the screen marks the file it just downloaded.
    expect(h.backup.markExported).toHaveBeenCalledTimes(1);
    expect(h.backup.markExported).toHaveBeenCalledWith(await h.backup.exportJson.mock.results[0]?.value);
    expect(byId(h.fixture, 'plain-warning')).toBeNull();
    await click(h.fixture, 'export-plain');
    expect(h.backup.exportJson).toHaveBeenCalledTimes(2);
    expect(byId(h.fixture, 'plain-warning')).toBeNull();
  });

  it('a new component in the same session still remembers the warning', async () => {
    const h = mount();
    await click(h.fixture, 'export-plain');
    await click(h.fixture, 'warning-continue');
    const again = TestBed.createComponent(SettingsBackupComponent);
    again.detectChanges();
    await click(again, 'export-plain');
    expect(byId(again, 'plain-warning')).toBeNull();
  });

  it('cancelling the warning downloads nothing', async () => {
    const h = mount();
    await click(h.fixture, 'export-plain');
    await click(h.fixture, 'warning-cancel');
    expect(byId(h.fixture, 'plain-warning')).toBeNull();
    expect(h.backup.exportJson).not.toHaveBeenCalled();
  });
});

describe('encrypted export', () => {
  it('labels the field as the Drive passphrase, hides it, and can show it', async () => {
    const { fixture } = mount();
    const field = byId(fixture, 'passphrase') as HTMLInputElement;
    expect(field.type).toBe('password');
    expect(root(fixture).textContent).toContain('la misma frase que usas para Drive');
    expect(root(fixture).textContent).toContain('no se puede recuperar');
    await click(fixture, 'passphrase-toggle');
    expect(field.type).toBe('text');
    expect(byId(fixture, 'passphrase-toggle')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('needs a passphrase and its confirmation to match before exporting', async () => {
    const h = mount();
    expect((byId(h.fixture, 'export-encrypted') as HTMLButtonElement).disabled).toBe(true);
    await type(h.fixture, 'passphrase', 'frase sintetica');
    await type(h.fixture, 'passphrase-confirm', 'otra cosa');
    expect((byId(h.fixture, 'export-encrypted') as HTMLButtonElement).disabled).toBe(true);
    expect(text(h.fixture, 'passphrase-mismatch')).toContain('no coinciden');
    await type(h.fixture, 'passphrase-confirm', 'frase sintetica');
    expect((byId(h.fixture, 'export-encrypted') as HTMLButtonElement).disabled).toBe(false);
  });

  it('exports with the passphrase, downloads, and does not keep the passphrase', async () => {
    const h = mount();
    await type(h.fixture, 'passphrase', 'frase sintetica');
    await type(h.fixture, 'passphrase-confirm', 'frase sintetica');
    await click(h.fixture, 'export-encrypted');
    expect(h.backup.exportJson).toHaveBeenCalledWith({ passphrase: 'frase sintetica' });
    expect(h.click).toHaveBeenCalledTimes(1);
    expect(h.backup.markExported).toHaveBeenCalledWith(await h.backup.exportJson.mock.results[0]?.value);
    expect((byId(h.fixture, 'passphrase') as HTMLInputElement).value).toBe('');
    expect(text(h.fixture, 'notice-status')).toContain('cifrado');
  });

  it('maps a failed export to Spanish without the service message', async () => {
    const h = mount();
    h.backup.exportJson.mockRejectedValueOnce(new DataError('STORAGE', 'secret 123.45'));
    await type(h.fixture, 'passphrase', 'x');
    await type(h.fixture, 'passphrase-confirm', 'x');
    await click(h.fixture, 'export-encrypted');
    expect(text(h.fixture, 'notice-alert')).toContain('No se pudo preparar el respaldo');
    expect(h.backup.markExported).not.toHaveBeenCalled();
    expect(root(h.fixture).textContent).not.toContain('123.45');
  });
});

describe('import with preview', () => {
  it('shows counts before any write and confirm is the only thing that writes', async () => {
    const h = mount({ previews: [pendingOk()] });
    const file = await chooseFile(h.fixture);
    expect(h.backup.previewImport).toHaveBeenCalledWith(file);
    expect(h.backup.confirmImport).not.toHaveBeenCalled();
    const preview = byId(h.fixture, 'import-preview');
    expect(preview).not.toBeNull();
    expect(cells(h.fixture, 'preview-row-events')).toEqual(['Eventos', '3', '1']);
    expect(cells(h.fixture, 'preview-row-loans')).toEqual(['Préstamos', '1', '0']);
    expect(preview?.textContent).toContain('reemplaza');
  });

  it('clears the file control so the same file can be chosen again after cancelling', async () => {
    const h = mount({ previews: [pendingOk(), pendingOk()] });
    const input = byId(h.fixture, 'import-file') as HTMLInputElement;
    const setter = vi.fn();
    Object.defineProperty(input, 'value', { set: setter, get: () => 'C:\\fakepath\\x.json', configurable: true });
    await chooseFile(h.fixture);
    expect(setter).toHaveBeenCalledWith('');
    await click(h.fixture, 'import-cancel');
    await chooseFile(h.fixture);
    expect(h.backup.previewImport).toHaveBeenCalledTimes(2);
    expect(byId(h.fixture, 'import-preview')).not.toBeNull();
  });

  it('cancel leaves the data untouched', async () => {
    const h = mount({ previews: [pendingOk()] });
    await chooseFile(h.fixture);
    await click(h.fixture, 'import-cancel');
    expect(h.backup.cancelImport).toHaveBeenCalledWith('p1');
    expect(h.backup.confirmImport).not.toHaveBeenCalled();
    expect(byId(h.fixture, 'import-preview')).toBeNull();
  });

  it('confirm replaces, then offers «Deshacer»; undo restores', async () => {
    const h = mount({ previews: [pendingOk()] });
    await chooseFile(h.fixture);
    await click(h.fixture, 'import-confirm');
    expect(h.backup.confirmImport).toHaveBeenCalledWith('p1');
    expect(byId(h.fixture, 'import-preview')).toBeNull();
    expect(byId(h.fixture, 'undo')?.textContent).toContain('Deshacer');
    await click(h.fixture, 'undo');
    expect(h.backup.undoImport).toHaveBeenCalledWith('u1');
    expect(byId(h.fixture, 'undo')).toBeNull();
    expect(text(h.fixture, 'notice-status')).toContain('anteriores');
  });

  it('explains a lost undo window gracefully', async () => {
    const h = mount({ previews: [pendingOk()] });
    h.backup.undoImport.mockRejectedValueOnce(new DataError('NOT_FOUND'));
    await chooseFile(h.fixture);
    await click(h.fixture, 'import-confirm');
    await click(h.fixture, 'undo');
    expect(text(h.fixture, 'notice-alert')).toBe('Ya no se puede deshacer: pasaron 10 minutos o hubo cambios después.');
    expect(byId(h.fixture, 'undo')).toBeNull();
  });

  it('explains an expired preview on confirm', async () => {
    const h = mount({ previews: [pendingOk()] });
    h.backup.confirmImport.mockRejectedValueOnce(new DataError('NOT_FOUND'));
    await chooseFile(h.fixture);
    await click(h.fixture, 'import-confirm');
    expect(text(h.fixture, 'notice-alert')).toContain('venció');
    expect(byId(h.fixture, 'import-preview')).toBeNull();
  });

  it('shows the Spanish text of an invalid file and no preview', async () => {
    const h = mount({ previews: [failure('FOREIGN_FORMAT')] });
    await chooseFile(h.fixture);
    expect(text(h.fixture, 'notice-alert')).toBe('El archivo no es un respaldo de CuotasCasa.');
    expect(root(h.fixture).textContent).not.toContain('123.45');
    expect(byId(h.fixture, 'import-preview')).toBeNull();
  });

  it('asks for the passphrase of an encrypted backup, and keeps asking after a wrong one', async () => {
    const h = mount({ previews: [failure('PASSPHRASE_REQUIRED'), failure('WRONG_PASSPHRASE'), pendingOk(true)] });
    const file = await chooseFile(h.fixture);
    expect(byId(h.fixture, 'import-passphrase')).not.toBeNull();
    expect(byId(h.fixture, 'import-preview')).toBeNull();
    await type(h.fixture, 'import-passphrase', 'mala');
    await click(h.fixture, 'import-decrypt');
    expect(h.backup.previewImport).toHaveBeenLastCalledWith(file, { passphrase: 'mala' });
    expect(text(h.fixture, 'notice-alert')).toContain('frase es incorrecta');
    expect(byId(h.fixture, 'import-passphrase')).not.toBeNull();
    await type(h.fixture, 'import-passphrase', 'buena');
    await click(h.fixture, 'import-decrypt');
    expect(byId(h.fixture, 'import-preview')).not.toBeNull();
    expect(byId(h.fixture, 'import-passphrase')).toBeNull();
  });

  it('shows the sync notice only when Drive is set up', async () => {
    const without = mount({ previews: [pendingOk()] });
    await chooseFile(without.fixture);
    expect(byId(without.fixture, 'sync-notice')).toBeNull();
    TestBed.resetTestingModule();
    const withDrive = mount({
      previews: [pendingOk()],
      drive: { state: 'idle', pendingChanges: 0, lastSyncAt: null },
    });
    await chooseFile(withDrive.fixture);
    expect(text(withDrive.fixture, 'sync-notice')).toContain('próxima sincronización');
  });

  it('does not count a disconnected Drive as set up', async () => {
    const h = mount({ previews: [pendingOk()], drive: { state: 'disconnected' } });
    await chooseFile(h.fixture);
    expect(byId(h.fixture, 'sync-notice')).toBeNull();
  });

  it('forgets a pending preview when the component is destroyed', async () => {
    const h = mount({ previews: [pendingOk()] });
    await chooseFile(h.fixture);
    h.fixture.destroy();
    expect(h.backup.cancelImport).toHaveBeenCalledWith('p1');
  });
});

describe('storage persistence', () => {
  it('reflects persisted() and requests it on demand', async () => {
    const h = mount({ persisted: false });
    expect(text(h.fixture, 'persist-status')).toContain('No concedido');
    await click(h.fixture, 'persist-request');
    expect(h.health.requestPersist).toHaveBeenCalledTimes(1);
    expect(text(h.fixture, 'persist-status')).toContain('Concedido');
    expect(byId(h.fixture, 'persist-request')).toBeNull();
  });

  it('says so when the browser denies it', async () => {
    const h = mount({ persisted: false });
    h.health.requestPersist.mockImplementationOnce(() => Promise.resolve(false));
    await click(h.fixture, 'persist-request');
    expect(text(h.fixture, 'notice-status')).toContain('no lo concedió');
  });

  it('shows unknown state and the usage estimate', () => {
    const { fixture } = mount({ persisted: null });
    expect(text(fixture, 'persist-status')).toContain('No disponible');
    expect(byId(fixture, 'persist-request')).toBeNull();
    expect(text(fixture, 'persist-estimate')).toBe('Uso estimado: 1.5 KB de 5.0 MB');
  });

  it('explains Safari only for Safari in a tab', () => {
    expect(byId(mount({ safari: false }).fixture, 'safari-explanation')).toBeNull();
    TestBed.resetTestingModule();
    const safari = mount({ safari: true });
    expect(text(safari.fixture, 'safari-explanation')).toContain('7 días');
  });
});

const active = () => document.activeElement?.getAttribute('data-testid') ?? document.activeElement?.tagName;

describe('focus management', () => {
  it('moves focus to «Deshacer» after confirm', async () => {
    const h = mount({ previews: [pendingOk()] });
    await chooseFile(h.fixture);
    await click(h.fixture, 'import-confirm');
    expect(active()).toBe('undo');
  });

  it('moves focus to the file control after undo and after cancel', async () => {
    const h = mount({ previews: [pendingOk(), pendingOk()] });
    await chooseFile(h.fixture);
    await click(h.fixture, 'import-cancel');
    expect(active()).toBe('import-file');
    await chooseFile(h.fixture);
    await click(h.fixture, 'import-confirm');
    await click(h.fixture, 'undo');
    expect(active()).toBe('import-file');
  });

  it('moves focus to the file control when undo is no longer possible', async () => {
    const h = mount({ previews: [pendingOk()] });
    h.backup.undoImport.mockRejectedValueOnce(new DataError('NOT_FOUND'));
    await chooseFile(h.fixture);
    await click(h.fixture, 'import-confirm');
    await click(h.fixture, 'undo');
    expect(active()).toBe('import-file');
  });
});

describe('review fixes', () => {
  it('clears the previous message when a new action starts, so a repeat is announced again', async () => {
    const h = mount({ previews: [failure('FOREIGN_FORMAT')] });
    await chooseFile(h.fixture);
    expect(text(h.fixture, 'notice-alert')).not.toBe('');
    let release: (value: PreviewResult) => void = () => undefined;
    h.backup.previewImport.mockReturnValueOnce(new Promise<PreviewResult>((resolve) => (release = resolve)));
    await chooseFile(h.fixture);
    expect(text(h.fixture, 'notice-alert')).toBe('');
    release(failure('FOREIGN_FORMAT'));
    await settle(h.fixture);
    expect(text(h.fixture, 'notice-alert')).not.toBe('');
  });

  it('clears the message when confirm and undo start', async () => {
    const h = mount({ previews: [pendingOk()] });
    await chooseFile(h.fixture);
    let release: (value: { undoToken: string }) => void = () => undefined;
    h.backup.confirmImport.mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
    void byId(h.fixture, 'import-confirm')?.click();
    await settle(h.fixture);
    expect(text(h.fixture, 'notice-status')).toBe('');
    release({ undoToken: 'u1' });
    await settle(h.fixture);
    let done: () => void = () => undefined;
    h.backup.undoImport.mockReturnValueOnce(new Promise<void>((resolve) => (done = resolve)));
    void byId(h.fixture, 'undo')?.click();
    await settle(h.fixture);
    expect(text(h.fixture, 'notice-status')).toBe('');
    done();
    await settle(h.fixture);
  });

  it('disables «Deshacer» while undoing, so a double click cannot repeat it', async () => {
    const h = mount({ previews: [pendingOk()] });
    await chooseFile(h.fixture);
    await click(h.fixture, 'import-confirm');
    let done: () => void = () => undefined;
    h.backup.undoImport.mockReturnValueOnce(new Promise<void>((resolve) => (done = resolve)));
    void byId(h.fixture, 'undo')?.click();
    await settle(h.fixture);
    expect((byId(h.fixture, 'undo') as HTMLButtonElement).disabled).toBe(true);
    done();
    await settle(h.fixture);
    expect(h.backup.undoImport).toHaveBeenCalledTimes(1);
  });

  it('hides «Deshacer» 10 minutes after confirm', async () => {
    const h = mount({ previews: [pendingOk()] });
    await chooseFile(h.fixture);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      await click(h.fixture, 'import-confirm');
      expect(byId(h.fixture, 'undo')).not.toBeNull();
      vi.advanceTimersByTime(9 * 60 * 1000);
      h.fixture.detectChanges();
      expect(byId(h.fixture, 'undo')).not.toBeNull();
      vi.advanceTimersByTime(60 * 1000 + 1);
      await settle(h.fixture);
      expect(byId(h.fixture, 'undo')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the backup date as a local calendar day', async () => {
    const night = new Date(2026, 9, 4, 23, 30).toISOString();
    const preview = { ok: true, value: { id: 'p1', preview: { ...PREVIEW, exportedAt: night }, encrypted: false } };
    const h = mount({ previews: [preview as PreviewResult] });
    await chooseFile(h.fixture);
    expect(text(h.fixture, 'import-preview')).toContain('Respaldo del 04/10/2026');
  });

  it('lets a password manager offer to save the passphrases and hides the import one after decrypting', async () => {
    const h = mount({ previews: [failure('PASSPHRASE_REQUIRED'), pendingOk(true)] });
    expect(byId(h.fixture, 'passphrase')?.getAttribute('autocomplete')).toBe('new-password');
    expect(byId(h.fixture, 'passphrase-confirm')?.getAttribute('autocomplete')).toBe('new-password');
    await chooseFile(h.fixture);
    expect(byId(h.fixture, 'import-passphrase')?.getAttribute('autocomplete')).toBe('current-password');
    await click(h.fixture, 'import-passphrase-toggle');
    await type(h.fixture, 'import-passphrase', 'x');
    await click(h.fixture, 'import-decrypt');
    await chooseFile(h.fixture);
    expect(byId(h.fixture, 'import-passphrase')).toBeNull();
  });

  it('cancels a preview that resolves after the component was destroyed', async () => {
    const h = mount();
    let release: (value: PreviewResult) => void = () => undefined;
    h.backup.previewImport.mockReturnValueOnce(new Promise<PreviewResult>((resolve) => (release = resolve)));
    void chooseFile(h.fixture);
    h.fixture.destroy();
    release(pendingOk());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(h.backup.cancelImport).toHaveBeenCalledWith('p1');
  });

  it('replaces the persistence button with the outcome after the first request', async () => {
    const h = mount({ persisted: false });
    h.health.requestPersist.mockImplementationOnce(() => Promise.resolve(false));
    await click(h.fixture, 'persist-request');
    expect(byId(h.fixture, 'persist-request')).toBeNull();
    expect(text(h.fixture, 'persist-outcome')).toContain('no lo concedió');
  });
});
