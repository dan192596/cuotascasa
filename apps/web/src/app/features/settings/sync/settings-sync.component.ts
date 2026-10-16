import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  effect,
  Injector,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { makeLocalDate } from '@cuotascasa/domain';
import { DataError } from '../../../data/api.ts';
import { SYNC_SERVICE } from '../../../data/tokens.ts';
import { formatLocalDate } from '../../../ui/format/format.ts';
import { MIN_RECOMMENDED_LENGTH, passphraseStrength } from './passphrase-strength.ts';

/** First step of the connection: nothing has contacted Google until the owner chooses «Conectar Drive». */
type ConnectStep = 'idle' | 'preparing' | 'ready';

/** Spanish text of a rejected service call. Never the raw error: its message could carry data. */
function errorText(error: unknown): string {
  if (error instanceof DataError) {
    switch (error.code) {
      case 'STORAGE':
        return 'No se pudo leer o guardar en este navegador. Tus datos locales no cambiaron.';
      case 'VALIDATION':
        return error.message === 'SYNC_NOT_CONNECTED'
          ? 'Conecta Drive antes de continuar.'
          : error.message === 'SYNC_NOT_CONFIGURED'
            ? 'Drive no está configurado en esta versión de la app.'
            : 'Revisa los datos e inténtalo de nuevo.';
      default:
        break;
    }
  }
  return 'No se pudo completar la acción. Inténtalo de nuevo.';
}

/**
 * Settings: Google Drive (HU-21, HU-22, R12, R18). Connecting takes two clicks (ADR-0008, W4 amendment): «Conectar
 * Drive» is the first explicit intent and the only thing that contacts Google (`prepare()`); «Continuar con Google»
 * then calls `connect()` as the very first statement of its handler, so WebKit keeps the consent popup inside the
 * gesture. The passphrase lives only in signals while the form is open, and it is cleared once the service answered.
 */
@Component({
  selector: 'cc-settings-sync',
  imports: [RouterLink],
  template: `
    <section aria-labelledby="drive-title">
      <h2 id="drive-title" data-testid="drive-title" tabindex="-1">Google Drive</h2>
      <p class="status" role="status" data-testid="drive-status">{{ sync.statusText() }}</p>

      @if (lastSyncText(); as last) {
        <p class="muted" data-testid="drive-last-sync">{{ last }}</p>
      }
      <p class="muted" role="status" data-testid="drive-progress">
        {{ step() === 'preparing' ? 'Preparando la conexión con Google…' : '' }}
      </p>
      @if (error(); as message) {
        <p class="notice" role="status" data-testid="drive-error">{{ message }}</p>
      }

      @if (mode() === 'connect') {
        <p class="muted" data-testid="drive-scope">
          Sincroniza una copia cifrada de tus datos en tu propio Google Drive. CuotasCasa pide un único permiso,
          <code>drive.appdata</code>: una carpeta oculta de la app, sin acceso a tus demás archivos. La copia se cifra
          en este dispositivo con una frase que solo tú conoces. Mientras no pulses «Conectar Drive», la app no contacta
          a Google.
          <a routerLink="/privacidad" data-testid="drive-privacy-link">Política de privacidad</a>
        </p>
        <div class="actions">
          @if (step() === 'ready') {
            <button
              type="button"
              class="primary"
              data-testid="drive-continue"
              [disabled]="connecting()"
              (click)="onContinue()"
            >
              Continuar con Google
            </button>
            <span class="muted">Se abrirá la ventana de Google para pedirte el permiso.</span>
          } @else {
            <button
              type="button"
              class="primary"
              data-testid="drive-connect"
              [disabled]="step() === 'preparing'"
              (click)="onConnect()"
            >
              Conectar Drive
            </button>
          }
          @if (canLeave()) {
            <button type="button" data-testid="drive-disconnect" [disabled]="busy()" (click)="onDisconnect()">
              Desconectar Drive
            </button>
          }
        </div>
      }

      @if (mode() === 'connected') {
        <div class="actions">
          <button type="button" class="primary" data-testid="drive-sync" [disabled]="busy()" (click)="onSync()">
            Sincronizar
          </button>
          <button
            type="button"
            data-testid="passphrase-change-open"
            [disabled]="busy() || changing()"
            (click)="openChange()"
          >
            Cambiar frase
          </button>
          <button type="button" data-testid="drive-disconnect" [disabled]="busy()" (click)="onDisconnect()">
            Desconectar Drive
          </button>
        </div>
        @if (doneText(); as done) {
          <p class="muted" role="status" data-testid="passphrase-done">{{ done }}</p>
        }
      }

      @if (mode() === 'passphrase' || changing()) {
        <form class="passphrase" data-testid="passphrase-form" (submit)="onSubmit($event)" novalidate>
          <h3 id="passphrase-title">{{ changing() ? 'Cambiar la frase de cifrado' : 'Frase de cifrado' }}</h3>
          <p class="warning" data-testid="passphrase-warning">
            Esta frase no se puede recuperar: CuotasCasa no la guarda y nadie puede restablecerla. Si la olvidas y
            pierdes todos los dispositivos con Drive conectado, no podrás leer la copia de Drive. Guárdala en un gestor
            de contraseñas.
          </p>
          @if (changing()) {
            <p class="muted" data-testid="passphrase-other-devices">
              Los otros dispositivos te pedirán la frase nueva la próxima vez que sincronicen.
            </p>
          } @else if (needsConfirm()) {
            <p class="muted">
              Si ya usas Drive en otro dispositivo, escribe la misma frase que allí. La frase se pide una vez por
              dispositivo.
            </p>
          }

          <label for="cc-passphrase">{{ changing() ? 'Frase nueva' : 'Frase' }}</label>
          <div class="field">
            <input
              id="cc-passphrase"
              data-testid="passphrase-input"
              [type]="shown() ? 'text' : 'password'"
              [value]="phrase()"
              [attr.autocomplete]="needsConfirm() ? 'new-password' : 'current-password'"
              autocapitalize="none"
              spellcheck="false"
              (input)="phrase.set(valueOf($event))"
            />
            <button
              type="button"
              data-testid="passphrase-toggle"
              [attr.aria-pressed]="shown()"
              (click)="shown.set(!shown())"
            >
              {{ shown() ? 'Ocultar frase' : 'Mostrar frase' }}
            </button>
          </div>

          @if (needsConfirm()) {
            <div class="strength" data-testid="passphrase-strength">
              <meter
                min="0"
                max="3"
                low="1"
                high="3"
                optimum="3"
                [value]="strength().level"
                aria-label="Fuerza de la frase"
              ></meter>
              <span>Fuerza: {{ strength().label }}</span>
              @if (strength().level === 1) {
                <span class="muted">Usa al menos {{ minLength }} caracteres; una frase larga de palabras sirve.</span>
              }
            </div>
            <label for="cc-passphrase-confirm">Confirma la frase</label>
            <input
              id="cc-passphrase-confirm"
              data-testid="passphrase-confirm"
              [type]="shown() ? 'text' : 'password'"
              [value]="confirm()"
              autocomplete="new-password"
              autocapitalize="none"
              spellcheck="false"
              (input)="confirm.set(valueOf($event))"
            />
          }

          @if (formError(); as message) {
            <p class="notice" role="status" data-testid="passphrase-error">{{ message }}</p>
          }
          <div class="actions">
            <button type="submit" class="primary" data-testid="passphrase-submit" [disabled]="busy()">
              {{ changing() ? 'Cambiar frase' : 'Guardar frase' }}
            </button>
            @if (changing()) {
              <button type="button" data-testid="passphrase-cancel" (click)="closeChange()">Cancelar</button>
            } @else {
              <button type="button" data-testid="drive-disconnect" [disabled]="busy()" (click)="onDisconnect()">
                Desconectar Drive
              </button>
            }
          </div>
        </form>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
      padding: 1rem;
      color: var(--cc-color-ink);
    }
    h2,
    h3 {
      font-family: var(--cc-font-heading);
    }
    p {
      margin: 0.5rem 0;
    }
    .muted {
      color: var(--cc-color-ink-muted);
    }
    .warning,
    .notice {
      padding: 0.25rem 0.75rem;
      border-left: 4px solid var(--cc-color-warning);
      background: var(--cc-color-surface);
    }
    .actions,
    .field,
    .strength {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem 0.75rem;
      margin: 0.75rem 0;
    }
    .passphrase {
      max-width: 36rem;
      margin-top: 1rem;
    }
    label {
      display: block;
      margin-top: 0.75rem;
      font-weight: bold;
    }
    input {
      box-sizing: border-box;
      min-width: 16rem;
      padding: 0.375rem 0.5rem;
      border: 1px solid var(--cc-color-control-border);
      border-radius: 0.25rem;
      color: var(--cc-color-ink);
      background: var(--cc-color-surface);
      font: inherit;
    }
    button {
      padding: 0.5rem 1rem;
      border: 1px solid var(--cc-color-control-border);
      border-radius: 0.25rem;
      color: var(--cc-color-ink);
      background: var(--cc-color-surface);
      font: inherit;
      cursor: pointer;
    }
    button.primary {
      border-color: var(--cc-color-ink);
      font-weight: bold;
    }
    button:disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }
    a {
      color: var(--cc-color-ink);
      text-decoration: underline;
    }
    a:focus-visible,
    button:focus-visible,
    input:focus-visible {
      outline: 2px solid var(--cc-color-ink);
      outline-offset: 2px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsSyncComponent {
  protected readonly sync = inject(SYNC_SERVICE);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly minLength = MIN_RECOMMENDED_LENGTH;
  protected readonly step = signal<ConnectStep>('idle');
  protected readonly connecting = signal(false);
  protected readonly working = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly changing = signal(false);
  protected readonly shown = signal(false);
  protected readonly phrase = signal('');
  protected readonly confirm = signal('');
  protected readonly formError = signal<string | null>(null);
  protected readonly doneText = signal<string | null>(null);

  protected readonly mode = computed<'not-configured' | 'connect' | 'passphrase' | 'connected'>(() => {
    switch (this.sync.status().state) {
      case 'not-configured':
        return 'not-configured';
      case 'disconnected':
      case 'needs-auth':
        return 'connect';
      case 'needs-passphrase':
        return 'passphrase';
      default:
        return 'connected';
    }
  });
  /** The token is gone after a reload: the owner can still leave Drive without connecting again. */
  protected readonly canLeave = computed(() => this.sync.status().state === 'needs-auth');
  protected readonly busy = computed(() => this.working() || this.sync.status().state === 'syncing');
  protected readonly needsConfirm = computed(() => {
    const status = this.sync.status();
    return this.changing() || (status.state === 'needs-passphrase' && status.reason === 'no-key');
  });
  protected readonly strength = computed(() => passphraseStrength(this.phrase()));
  protected readonly lastSyncText = computed<string | null>(() => {
    const status = this.sync.status();
    if (status.state !== 'idle') {
      return null;
    }
    if (status.lastSyncAt === null) {
      return 'Aún no se ha sincronizado.';
    }
    const at = new Date(status.lastSyncAt);
    if (Number.isNaN(at.getTime())) {
      return null;
    }
    const day = formatLocalDate(makeLocalDate(at.getFullYear(), at.getMonth() + 1, at.getDate()));
    const time = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
    return `Última sincronización: ${day} ${time}`;
  });

  private lastMode: string | null = null;
  private pendingFocus: string | null = null;

  constructor() {
    // On every change of mode the focus goes to the main control of the new one (never on first render).
    effect(() => {
      const mode = this.mode();
      const previous = this.lastMode;
      this.lastMode = mode;
      if (previous === null || previous === mode) {
        return;
      }
      untracked(() => {
        if (mode !== 'connected') {
          this.doneText.set(null);
        }
        this.focusMain(mode);
      });
    });
  }

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  /** First explicit intent to connect: the only moment the app contacts Google. */
  protected onConnect(): void {
    this.error.set(null);
    this.step.set('preparing');
    this.sync.prepare().then(
      (ready) => {
        if (!ready) {
          this.step.set('idle');
          this.error.set('No se pudo preparar la conexión con Google. Revisa tu conexión e inténtalo de nuevo.');
          return;
        }
        this.step.set('ready');
        this.focusLater('drive-continue');
      },
      (error: unknown) => {
        this.step.set('idle');
        this.error.set(errorText(error));
      },
    );
  }

  /** The service call is the first statement: nothing is awaited before the consent popup opens. */
  protected onContinue(): void {
    const connection = this.sync.connect();
    this.connecting.set(true);
    this.error.set(null);
    connection.then(
      () => this.afterConnect(),
      (error: unknown) => {
        this.error.set(errorText(error));
        this.afterConnect();
      },
    );
  }

  private afterConnect(): void {
    this.connecting.set(false);
    this.step.set('idle');
  }

  /** `sync()` is called first thing in the click: a renewed token needs a popup inside the gesture. */
  protected onSync(): void {
    const run = this.sync.sync();
    this.error.set(null);
    this.doneText.set(null);
    this.track(run);
  }

  protected onDisconnect(): void {
    const run = this.sync.disconnect();
    this.error.set(null);
    this.doneText.set(null);
    this.changing.set(false);
    this.clearPhrase();
    this.track(run);
  }

  protected openChange(): void {
    this.error.set(null);
    this.doneText.set(null);
    this.formError.set(null);
    this.clearPhrase();
    this.changing.set(true);
    this.focusLater('passphrase-input');
  }

  protected closeChange(): void {
    this.changing.set(false);
    this.formError.set(null);
    this.clearPhrase();
    this.focusLater('passphrase-change-open');
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    const phrase = this.phrase();
    if (phrase === '') {
      this.formError.set('Escribe una frase.');
      return;
    }
    if (this.needsConfirm() && phrase !== this.confirm()) {
      this.formError.set('Las dos frases no coinciden.');
      return;
    }
    this.formError.set(null);
    void this.submit(phrase, this.changing());
  }

  private async submit(phrase: string, changing: boolean): Promise<void> {
    this.working.set(true);
    this.error.set(null);
    try {
      // The service already received the string: nothing of it stays in this component while it works.
      if (changing) {
        const run = this.sync.changePassphrase(phrase);
        this.clearPhrase();
        // Only 'changed' is a success; 'busy' and 'failed' keep the form open and the status line explains why.
        if ((await run) !== 'changed') {
          return;
        }
        this.changing.set(false);
        this.doneText.set('Frase cambiada. Los otros dispositivos te pedirán la frase nueva.');
        this.focusLater('passphrase-change-open');
      } else {
        const run = this.sync.setPassphrase(phrase);
        this.clearPhrase();
        await run;
        if (this.mode() !== 'connected') {
          return;
        }
        // No automatic sync: a token renewal after an await would fall outside the owner's click.
        this.doneText.set('Frase guardada. Ya puedes sincronizar ahora.');
      }
    } catch (error) {
      this.error.set(errorText(error));
    } finally {
      this.clearPhrase();
      this.working.set(false);
      this.flushFocus();
    }
  }

  private flushFocus(): void {
    const pending = this.pendingFocus;
    this.pendingFocus = null;
    if (pending !== null) {
      this.focusMain(pending);
    }
  }

  private track(run: Promise<void>): void {
    this.working.set(true);
    run.then(
      () => {
        this.working.set(false);
        this.flushFocus();
      },
      (error: unknown) => {
        this.error.set(errorText(error));
        this.working.set(false);
        this.flushFocus();
      },
    );
  }

  private clearPhrase(): void {
    this.phrase.set('');
    this.confirm.set('');
    this.shown.set(false);
  }

  private focusMain(mode: string): void {
    const testId = mode === 'connect' ? 'drive-connect' : mode === 'passphrase' ? 'passphrase-input' : 'drive-sync';
    afterNextRender(
      () => {
        const root = this.host.nativeElement;
        const main = root.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
        if ((main === null || main.disabled) && this.working()) {
          this.pendingFocus = mode; // the control is disabled while the call runs: focus it when it ends.
          return;
        }
        const target = main !== null && !main.disabled ? main : root.querySelector<HTMLElement>('#drive-title');
        target?.focus();
      },
      { injector: this.injector },
    );
  }

  private focusLater(testId: string): void {
    afterNextRender(
      () => {
        this.host.nativeElement.querySelector<HTMLElement>(`[data-testid="${testId}"]`)?.focus();
      },
      { injector: this.injector },
    );
  }
}
