import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import type { BackupFile, PendingImport } from '../../../data/api.ts';
import { BACKUP_SERVICE, STORAGE_HEALTH, SYNC_SERVICE } from '../../../data/tokens.ts';
import {
  countRows,
  dataErrorText,
  formatBytes,
  importErrorText,
  localDateText,
  lastBackupText,
  PlainExportSession,
} from './backup-model.ts';

/** ADR-0007 §5: the undo snapshot lives 10 minutes. */
const UNDO_WINDOW_MS = 10 * 60 * 1000;

interface Notice {
  readonly tone: 'status' | 'alert';
  readonly text: string;
}

/**
 * Backup block of /app/ajustes (HU-19, HU-20; R10, R11, R18; ADR-0007, ADR-0017): backup status and reminder, plain or
 * encrypted JSON export, import with preview, confirm and undo, storage persistence and the Safari explanation.
 * The reminder comes only from BackupService.reminderDue(); the passphrase is typed, never stored.
 */
@Component({
  selector: 'cc-settings-backup',
  template: `
    <section aria-labelledby="cc-backup-title" data-testid="settings-backup">
      <h2 id="cc-backup-title">Respaldo de tus datos</h2>

      <div role="status" data-testid="notice-status">{{ notice()?.tone === 'status' ? notice()?.text : '' }}</div>
      <div role="alert" data-testid="notice-alert">{{ notice()?.tone === 'alert' ? notice()?.text : '' }}</div>

      <p data-testid="backup-status">{{ lastBackup() }}</p>
      <p data-testid="backup-changes">Cambios desde el último respaldo: {{ backup.changesSinceBackup() }}</p>
      @if (backup.reminderDue()) {
        <p class="reminder" data-testid="backup-reminder">
          Conviene hacer un respaldo ahora: pasó mucho tiempo o hay varios cambios sin respaldar.
        </p>
      }

      <h3>Exportar</h3>
      <p>
        <button type="button" class="action" data-testid="export-plain" [disabled]="busy()" (click)="onPlainExport()">
          Exportar respaldo JSON
        </button>
      </p>
      @if (warning()) {
        <div class="warning" data-testid="plain-warning" tabindex="-1" #warningBox>
          <p>
            <strong>Aviso:</strong> el respaldo JSON no va cifrado y contiene datos financieros. Guárdalo en un lugar
            que solo tú controles, o
            <a href="#cc-passphrase" data-testid="warning-go-encrypted" (click)="goEncrypted($event)"
              >exporta la versión cifrada</a
            >.
          </p>
          <button type="button" class="action" data-testid="warning-continue" (click)="downloadPlain()">
            Descargar de todos modos
          </button>
          <button type="button" class="action" data-testid="warning-cancel" (click)="warning.set(false)">
            Cancelar
          </button>
        </div>
      }

      <fieldset class="encrypted">
        <legend>Exportar cifrado</legend>
        <p class="hint">
          Usa la misma frase que usas para Drive. La frase no se guarda en ningún lado y no se puede recuperar: si la
          olvidas, este respaldo no se podrá abrir. Guárdala en un gestor de contraseñas.
        </p>
        <p>
          <label for="cc-passphrase">Frase (la misma frase que usas para Drive)</label>
          <input
            id="cc-passphrase"
            data-testid="passphrase"
            [type]="show() ? 'text' : 'password'"
            autocomplete="new-password"
            autocapitalize="off"
            spellcheck="false"
            [value]="passphrase()"
            (input)="passphrase.set(value($event))"
          />
          <button
            type="button"
            class="action"
            data-testid="passphrase-toggle"
            [attr.aria-pressed]="show()"
            (click)="show.set(!show())"
          >
            {{ show() ? 'Ocultar frase' : 'Mostrar frase' }}
          </button>
        </p>
        <p>
          <label for="cc-passphrase-confirm">Repite la frase</label>
          <input
            id="cc-passphrase-confirm"
            data-testid="passphrase-confirm"
            [type]="show() ? 'text' : 'password'"
            autocomplete="new-password"
            autocapitalize="off"
            spellcheck="false"
            [attr.aria-describedby]="mismatch() ? 'cc-passphrase-mismatch' : null"
            [value]="confirmation()"
            (input)="confirmation.set(value($event))"
          />
        </p>
        @if (mismatch()) {
          <p id="cc-passphrase-mismatch" class="error" data-testid="passphrase-mismatch">Las frases no coinciden.</p>
        }
        <button
          type="button"
          class="action primary"
          data-testid="export-encrypted"
          [disabled]="!canEncrypt() || busy()"
          (click)="onEncryptedExport()"
        >
          Exportar respaldo cifrado
        </button>
      </fieldset>

      <h3>Importar</h3>
      <p class="hint">
        Importar reemplaza todos tus datos actuales. Antes de reemplazar verás qué contiene el archivo.
      </p>
      <p>
        <label for="cc-import-file">Archivo de respaldo (.json)</label>
        <input
          id="cc-import-file"
          type="file"
          accept="application/json,.json"
          data-testid="import-file"
          #importFile
          [disabled]="busy()"
          (change)="onFile($event)"
        />
      </p>

      @if (needsPassphrase()) {
        <p>
          <label for="cc-import-passphrase">Frase del respaldo cifrado (la misma de Drive)</label>
          <input
            id="cc-import-passphrase"
            data-testid="import-passphrase"
            [type]="showImport() ? 'text' : 'password'"
            autocomplete="current-password"
            autocapitalize="off"
            spellcheck="false"
            [value]="importPassphrase()"
            (input)="importPassphrase.set(value($event))"
          />
          <button
            type="button"
            class="action"
            data-testid="import-passphrase-toggle"
            [attr.aria-pressed]="showImport()"
            (click)="showImport.set(!showImport())"
          >
            {{ showImport() ? 'Ocultar frase' : 'Mostrar frase' }}
          </button>
        </p>
        <button
          type="button"
          class="action primary"
          data-testid="import-decrypt"
          [disabled]="importPassphrase() === '' || busy()"
          (click)="onDecrypt()"
        >
          Ver vista previa
        </button>
      }

      @if (pending(); as current) {
        <section aria-labelledby="cc-preview-title" class="preview" data-testid="import-preview">
          <h4 id="cc-preview-title" tabindex="-1" #previewTitle>Vista previa de la importación</h4>
          <p>
            Respaldo del {{ exportedOn(current) }}, versión {{ current.preview.sourceVersion }}.
            {{ current.encrypted ? 'Estaba cifrado.' : '' }}
          </p>
          <table>
            <caption>
              Registros que trae el archivo
            </caption>
            <thead>
              <tr>
                <th scope="col">Tipo</th>
                <th scope="col">Activos</th>
                <th scope="col">Borrados</th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.key) {
                <tr [attr.data-testid]="'preview-row-' + row.key">
                  <th scope="row">{{ row.label }}</th>
                  <td>{{ row.active }}</td>
                  <td>{{ row.tombstoned }}</td>
                </tr>
              }
            </tbody>
          </table>
          <p>
            Al confirmar se reemplazan todos tus datos actuales por estos. Podrás deshacerlo durante los siguientes 10
            minutos, mientras no hagas otros cambios.
          </p>
          @if (driveSetUp()) {
            <p data-testid="sync-notice">
              Tienes Drive configurado: en la próxima sincronización, lo importado se combina con la copia de Drive
              registro por registro. Los registros más nuevos en Drive vuelven a ganar y los que solo existen en Drive
              reaparecen.
            </p>
          }
          <button
            type="button"
            class="action primary"
            data-testid="import-confirm"
            [disabled]="busy()"
            (click)="onConfirm(current)"
          >
            Reemplazar mis datos
          </button>
          <button
            type="button"
            class="action"
            data-testid="import-cancel"
            [disabled]="busy()"
            (click)="onCancel(current)"
          >
            Cancelar
          </button>
        </section>
      }

      @if (undoToken(); as token) {
        <p class="undo">
          Importación lista.
          <button
            type="button"
            class="action"
            data-testid="undo"
            [disabled]="busy()"
            (click)="onUndo(token)"
            #undoButton
          >
            Deshacer
          </button>
        </p>
      }

      <h3>Almacenamiento</h3>
      <p data-testid="persist-status">{{ persistText() }}</p>
      @if (persistOutcome(); as outcome) {
        <p data-testid="persist-outcome">{{ outcome }}</p>
      } @else if (health.persisted() === false) {
        <p>
          <button type="button" class="action" data-testid="persist-request" (click)="onPersist()">
            Solicitar almacenamiento persistente
          </button>
        </p>
      }
      @if (estimateText(); as estimate) {
        <p data-testid="persist-estimate">{{ estimate }}</p>
      }
      @if (health.safariNonStandalone()) {
        <p class="warning" data-testid="safari-explanation">
          Safari puede borrar los datos de este sitio si no lo abres durante 7 días. Instala la app, haz respaldos
          seguidos o conecta Google Drive.
        </p>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
      padding: 0 1rem 1rem;
      color: var(--cc-color-ink);
    }
    h2,
    h3,
    h4 {
      font-family: var(--cc-font-heading);
    }
    .hint {
      color: var(--cc-color-ink-muted);
    }
    .reminder,
    .warning {
      padding: 0.5rem 0.75rem;
      border-left: 4px solid var(--cc-color-warning);
      background: var(--cc-color-surface);
    }
    .error {
      color: var(--cc-color-danger);
    }
    .encrypted {
      border: 1px solid var(--cc-color-control-border);
      border-radius: 0.25rem;
      margin: 1rem 0;
    }
    .preview {
      margin: 1rem 0;
      padding: 0.75rem;
      border: 1px solid var(--cc-color-control-border);
      border-radius: 0.25rem;
      background: var(--cc-color-surface);
    }
    table {
      border-collapse: collapse;
    }
    th,
    td {
      padding: 0.25rem 0.75rem;
      text-align: left;
      border-bottom: 1px solid var(--cc-color-control-border);
    }
    td {
      font-family: var(--cc-font-numeric);
      font-variant-numeric: tabular-nums;
    }
    input[type='password'],
    input[type='text'] {
      padding: 0.375rem 0.5rem;
      border: 1px solid var(--cc-color-control-border);
      border-radius: 0.25rem;
      color: var(--cc-color-ink);
      background: var(--cc-color-surface);
      font: inherit;
    }
    label {
      display: block;
      margin-bottom: 0.25rem;
    }
    .action {
      padding: 0.5rem 1rem;
      border: 1px solid var(--cc-color-control-border);
      border-radius: 0.25rem;
      color: var(--cc-color-ink);
      background: var(--cc-color-surface);
      font: inherit;
      cursor: pointer;
    }
    .action.primary {
      border-color: var(--cc-color-ink);
      font-weight: bold;
    }
    .action:disabled {
      cursor: not-allowed;
      opacity: 0.7;
    }
    a {
      color: var(--cc-color-ink);
      text-decoration: underline;
    }
    button:focus-visible,
    input:focus-visible,
    a:focus-visible,
    [tabindex='-1']:focus-visible {
      outline: 2px solid var(--cc-color-ink);
      outline-offset: 2px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsBackupComponent {
  protected readonly backup = inject(BACKUP_SERVICE);
  protected readonly health = inject(STORAGE_HEALTH);
  private readonly sync = inject(SYNC_SERVICE);
  private readonly session = inject(PlainExportSession);
  private readonly injector = inject(Injector);

  private readonly previewTitle = viewChild<ElementRef<HTMLElement>>('previewTitle');
  private readonly undoButton = viewChild<ElementRef<HTMLElement>>('undoButton');
  private readonly importFile = viewChild<ElementRef<HTMLElement>>('importFile');
  private readonly warningBox = viewChild<ElementRef<HTMLElement>>('warningBox');

  protected readonly notice = signal<Notice | null>(null);
  protected readonly busy = signal(false);
  protected readonly warning = signal(false);

  protected readonly passphrase = signal('');
  protected readonly confirmation = signal('');
  protected readonly show = signal(false);

  protected readonly importPassphrase = signal('');
  protected readonly showImport = signal(false);
  protected readonly needsPassphrase = signal(false);
  protected readonly pending = signal<PendingImport | null>(null);
  protected readonly undoToken = signal<string | null>(null);
  protected readonly persistOutcome = signal<string | null>(null);
  private file: File | null = null;
  private destroyed = false;
  private undoTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly lastBackup = computed(() => lastBackupText(this.backup.lastBackupAt(), Date.now()));
  protected readonly mismatch = computed(() => this.confirmation() !== '' && this.confirmation() !== this.passphrase());
  protected readonly canEncrypt = computed(() => this.passphrase() !== '' && this.passphrase() === this.confirmation());
  protected readonly rows = computed(() => {
    const current = this.pending();
    return current === null ? [] : countRows(current.preview);
  });
  /** ADR-0007 §6: the notice applies once Drive is set up on this device (anything past not-configured/disconnected). */
  protected readonly driveSetUp = computed(() => {
    const state = this.sync.status().state;
    return state !== 'not-configured' && state !== 'disconnected';
  });
  protected readonly persistText = computed(() => {
    const persisted = this.health.persisted();
    if (persisted === null) return 'Almacenamiento persistente: No disponible o aún sin saber en este navegador.';
    return persisted
      ? 'Almacenamiento persistente: Concedido. El navegador no borrará tus datos para liberar espacio.'
      : 'Almacenamiento persistente: No concedido. El navegador podría borrar tus datos si le falta espacio.';
  });
  protected readonly estimateText = computed(() => {
    const estimate = this.health.estimate();
    return estimate === null
      ? null
      : `Uso estimado: ${formatBytes(estimate.usageBytes)} de ${formatBytes(estimate.quotaBytes)}`;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.clearUndoTimer();
      const current = this.pending();
      if (current !== null) this.backup.cancelImport(current.id);
    });
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected exportedOn(current: PendingImport): string {
    return localDateText(current.preview.exportedAt);
  }

  /* ---------- export ---------- */

  protected async onPlainExport(): Promise<void> {
    if (!this.session.warned()) {
      this.warning.set(true);
      afterNextRender(() => this.warningBox()?.nativeElement.focus(), { injector: this.injector });
      return;
    }
    await this.downloadPlain();
  }

  protected async downloadPlain(): Promise<void> {
    this.warning.set(false);
    this.session.markWarned();
    await this.runExport(undefined);
  }

  protected goEncrypted(event: Event): void {
    event.preventDefault();
    this.warning.set(false);
    const doc = (event.target as HTMLElement).ownerDocument;
    afterNextRender(() => doc.getElementById('cc-passphrase')?.focus(), { injector: this.injector });
  }

  protected async onEncryptedExport(): Promise<void> {
    if (!this.canEncrypt()) return;
    await this.runExport(this.passphrase());
  }

  private async runExport(passphrase: string | undefined): Promise<void> {
    this.busy.set(true);
    this.notice.set(null);
    try {
      const file = await (passphrase === undefined ? this.backup.exportJson() : this.backup.exportJson({ passphrase }));
      this.download(file);
      if (passphrase !== undefined) {
        this.passphrase.set('');
        this.confirmation.set('');
        this.show.set(false);
      }
      this.notice.set({
        tone: 'status',
        text: file.encrypted
          ? 'Respaldo cifrado descargado. Guarda tu frase: sin ella no se puede abrir.'
          : 'Respaldo descargado.',
      });
    } catch (error) {
      this.notice.set({ tone: 'alert', text: dataErrorText(error, 'export') });
    } finally {
      this.busy.set(false);
    }
  }

  private download(file: BackupFile): void {
    const url = URL.createObjectURL(file.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  /* ---------- import ---------- */

  protected async onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const chosen = input.files?.[0];
    // Clear the control so choosing the same file again (after cancelling, say) fires `change` again.
    input.value = '';
    this.dropPending();
    this.undoToken.set(null);
    this.needsPassphrase.set(false);
    this.importPassphrase.set('');
    this.notice.set(null);
    if (chosen === undefined) {
      this.file = null;
      return;
    }
    this.file = chosen;
    await this.runPreview(undefined);
  }

  protected async onDecrypt(): Promise<void> {
    await this.runPreview(this.importPassphrase());
  }

  private async runPreview(passphrase: string | undefined): Promise<void> {
    const file = this.file;
    if (file === null) return;
    this.busy.set(true);
    this.notice.set(null);
    try {
      const result = await (passphrase === undefined
        ? this.backup.previewImport(file)
        : this.backup.previewImport(file, { passphrase }));
      if (this.destroyed) {
        if (result.ok) this.backup.cancelImport(result.value.id);
        return;
      }
      if (result.ok) {
        this.showImport.set(false);
        this.needsPassphrase.set(false);
        this.importPassphrase.set('');
        this.notice.set(null);
        this.pending.set(result.value);
        afterNextRender(() => this.previewTitle()?.nativeElement.focus(), { injector: this.injector });
      } else {
        this.needsPassphrase.set(
          result.error.code === 'PASSPHRASE_REQUIRED' || result.error.code === 'WRONG_PASSPHRASE',
        );
        this.notice.set({
          tone: result.error.code === 'PASSPHRASE_REQUIRED' ? 'status' : 'alert',
          text: importErrorText(result.error.code),
        });
      }
    } catch (error) {
      if (!this.destroyed) this.notice.set({ tone: 'alert', text: dataErrorText(error, 'confirm') });
    } finally {
      this.busy.set(false);
    }
  }

  protected onCancel(current: PendingImport): void {
    this.backup.cancelImport(current.id);
    this.pending.set(null);
    this.file = null;
    this.notice.set({ tone: 'status', text: 'Importación cancelada. Tus datos no cambiaron.' });
    this.focusFileControl();
  }

  private focusFileControl(): void {
    afterNextRender(() => this.importFile()?.nativeElement.focus(), { injector: this.injector });
  }

  private clearUndoTimer(): void {
    if (this.undoTimer !== undefined) clearTimeout(this.undoTimer);
    this.undoTimer = undefined;
  }

  protected async onConfirm(current: PendingImport): Promise<void> {
    this.busy.set(true);
    this.notice.set(null);
    try {
      const receipt = await this.backup.confirmImport(current.id);
      this.pending.set(null);
      this.file = null;
      this.undoToken.set(receipt.undoToken);
      this.clearUndoTimer();
      // The service forgets the snapshot after 10 minutes (ADR-0007 §5), so the button goes away with it.
      this.undoTimer = setTimeout(() => {
        this.undoToken.set(null);
        this.undoTimer = undefined;
      }, UNDO_WINDOW_MS);
      afterNextRender(() => this.undoButton()?.nativeElement.focus(), { injector: this.injector });
      this.notice.set({
        tone: 'status',
        text: 'Importación lista. Puedes deshacerla durante 10 minutos si no haces otros cambios.',
      });
    } catch (error) {
      this.pending.set(null);
      this.file = null;
      this.notice.set({ tone: 'alert', text: dataErrorText(error, 'confirm') });
      this.focusFileControl();
    } finally {
      this.busy.set(false);
    }
  }

  protected async onUndo(token: string): Promise<void> {
    this.busy.set(true);
    this.notice.set(null);
    try {
      await this.backup.undoImport(token);
      this.notice.set({ tone: 'status', text: 'Se restauraron tus datos anteriores a la importación.' });
    } catch (error) {
      this.notice.set({ tone: 'alert', text: dataErrorText(error, 'undo') });
    } finally {
      this.clearUndoTimer();
      this.undoToken.set(null);
      this.busy.set(false);
      this.focusFileControl();
    }
  }

  private dropPending(): void {
    const current = this.pending();
    if (current !== null) this.backup.cancelImport(current.id);
    this.pending.set(null);
  }

  /* ---------- storage ---------- */

  protected async onPersist(): Promise<void> {
    const granted = await this.health.requestPersist();
    this.persistOutcome.set(
      granted ? null : 'Ya lo solicitamos y el navegador no lo concedió. Haz respaldos seguidos.',
    );
    this.notice.set({
      tone: 'status',
      text: granted
        ? 'Almacenamiento persistente concedido.'
        : 'El navegador no lo concedió. Haz respaldos seguidos para no perder tus datos.',
    });
  }
}
