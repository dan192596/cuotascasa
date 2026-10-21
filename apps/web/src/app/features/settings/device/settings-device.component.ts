import { CdkTrapFocus } from '@angular/cdk/a11y';
import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  ElementRef,
  InjectionToken,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DataError } from '../../../data/api.ts';
import { DEVICE_DATA_SERVICE } from '../../../data/tokens.ts';
import { Announcer } from '../../../ui/feedback/announcer.service.ts';

/** The word the owner types to arm the deletion (case-sensitive; surrounding spaces are ignored). */
export const CONFIRM_WORD = 'BORRAR';
export const DEVICE_CLEARED_STATUS = 'Listo. Se borraron los datos de este dispositivo.';
/** The failure happened before anything changed. */
export const DEVICE_CLEAR_FAILED_TEXT =
  'No se pudieron borrar los datos de este dispositivo. Cierra las demás pestañas de CuotasCasa e inténtalo de nuevo. No se cambió nada.';
/** The failure happened after the data layer was closed: part of the data may be gone and the page reloads. */
export const DEVICE_CLEAR_PARTIAL_TEXT =
  'No se pudo terminar de borrar los datos de este dispositivo. Puede que se haya borrado una parte. Cierra las demás pestañas de CuotasCasa, recarga e inténtalo de nuevo.';
/** DataError message of data/device for a failure before any change (the other STORAGE messages mean «partial»). */
const NOTHING_CHANGED = 'DEVICE_NOTHING_CHANGED';

/** Time the confirmation stays on screen before the page loads again, so it can be read. */
export const LEAVE_DELAY_MS = new InjectionToken<number>('LeaveDelayMs', { providedIn: 'root', factory: () => 1500 });

/** Full page load of /app: the in-memory stores are stale after the deletion. Replaced in tests. */
export const LEAVE_TO_APP = new InjectionToken<() => void>('LeaveToApp', {
  providedIn: 'root',
  factory: () => {
    const document = inject(DOCUMENT);
    return () => document.defaultView?.location.replace('/app');
  },
});

/**
 * Settings: «Borrar datos de este dispositivo» (R18, R2, R12). A destructive, irreversible action behind a modal that
 * only arms after typing BORRAR. It erases this device's data and key; the Drive copy stays (deleted in Google Drive).
 */
@Component({
  selector: 'cc-settings-device',
  imports: [CdkTrapFocus],
  template: `
    <section aria-labelledby="device-title">
      <h2 id="device-title" data-testid="device-title">Borrar datos de este dispositivo</h2>
      <p data-testid="device-erases">
        Se borran de este navegador, sin posibilidad de recuperarlos desde aquí: tus préstamos, los datos reales (abonos
        y saldos), tus escenarios, los ajustes de este dispositivo y la clave de cifrado guardada. Si Drive está
        conectado, se desconecta y se revoca su permiso.
      </p>
      <p data-testid="device-keeps">
        No se borra la copia en Google Drive. Para borrarla, entra a «Administrar aplicaciones» en tu cuenta de Google,
        elige CuotasCasa y usa «Borrar datos ocultos de la aplicación».
      </p>
      <p class="muted">Si tienes otros dispositivos, bórralos en cada uno. Conviene exportar un respaldo antes.</p>
      <div class="actions">
        <button type="button" class="danger" data-testid="device-open" #opener (click)="openDialog()">
          Borrar datos de este dispositivo
        </button>
      </div>
    </section>

    @if (open()) {
      <div class="backdrop" role="presentation" data-testid="device-backdrop" #backdrop>
        <form
          class="dialog"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="device-dialog-title"
          aria-describedby="device-dialog-text"
          data-testid="device-dialog"
          cdkTrapFocus
          [cdkTrapFocusAutoCapture]="true"
          novalidate
          (submit)="onSubmit($event)"
        >
          <h3 id="device-dialog-title">¿Borrar los datos de este dispositivo?</h3>
          <p id="device-dialog-text">Esta acción no se puede deshacer. La copia en Google Drive no se toca.</p>
          <label for="device-confirm-input">Escribe {{ word }} para confirmar</label>
          <input
            id="device-confirm-input"
            type="text"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            data-testid="device-confirm-input"
            #confirmInput
            [value]="typed()"
            [readOnly]="busy()"
            [attr.aria-describedby]="error() ? 'device-error' : null"
            (input)="typed.set(confirmInput.value)"
          />
          @if (error(); as message) {
            <p class="notice" id="device-error" data-testid="device-error">{{ message }}</p>
          }
          <div class="actions">
            <button type="button" data-testid="device-cancel" [disabled]="busy()" (click)="cancel()">Cancelar</button>
            <button type="submit" class="danger" data-testid="device-confirm" [disabled]="!armed() || busy()">
              Borrar datos
            </button>
          </div>
          <p class="muted" role="status" tabindex="-1" data-testid="device-progress" #progress>{{ status() }}</p>
        </form>
      </div>
    }
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
    .notice {
      padding: 0.25rem 0.75rem;
      border-left: 4px solid var(--cc-color-danger);
      background: var(--cc-color-surface);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem 0.75rem;
      margin: 0.75rem 0;
    }
    .danger {
      color: var(--cc-color-danger);
      border-color: var(--cc-color-danger);
    }
    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 1000;
      display: grid;
      place-items: center;
      background: color-mix(in srgb, var(--cc-color-ink) 45%, transparent);
    }
    .dialog {
      box-sizing: border-box;
      width: min(28rem, calc(100vw - 2rem));
      padding: 1.25rem;
      border: 1px solid var(--cc-color-control-border);
      border-radius: 0.5rem;
      background: var(--cc-color-surface);
      color: var(--cc-color-ink);
      font-family: var(--cc-font-body);
    }
    .dialog h3 {
      margin: 0 0 0.5rem;
    }
    label {
      display: block;
      margin-top: 0.75rem;
      font-weight: bold;
    }
    input {
      box-sizing: border-box;
      width: 100%;
      margin-top: 0.25rem;
      padding: 0.375rem 0.5rem;
      border: 1px solid var(--cc-color-control-border);
      border-radius: 0.25rem;
      color: var(--cc-color-ink);
      background: var(--cc-color-surface);
      font: inherit;
    }
  `,
  host: { '(document:keydown.escape)': 'onEscape()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsDeviceComponent {
  private readonly device = inject(DEVICE_DATA_SERVICE);
  private readonly announcer = inject(Announcer);
  private readonly leave = inject(LEAVE_TO_APP);
  private readonly injector = inject(Injector);
  private readonly input = viewChild<ElementRef<HTMLInputElement>>('confirmInput');
  private readonly delayMs = inject(LEAVE_DELAY_MS);
  private readonly document = inject(DOCUMENT);
  private readonly backdrop = viewChild<ElementRef<HTMLElement>>('backdrop');
  private readonly progress = viewChild<ElementRef<HTMLElement>>('progress');
  private readonly opener = viewChild<ElementRef<HTMLButtonElement>>('opener');

  protected readonly word = CONFIRM_WORD;
  protected readonly open = signal(false);
  protected readonly typed = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly status = signal('');
  protected readonly armed = computed(() => this.typed().trim() === CONFIRM_WORD);

  constructor() {
    // While the dialog is open the rest of the page is inert (no focus, no pointer, hidden from assistive technology).
    effect((onCleanup) => {
      const dialog = this.backdrop()?.nativeElement;
      if (dialog === undefined) return;
      const inerted: Element[] = [];
      for (
        let node: Element = dialog;
        node.parentElement !== null && node !== this.document.body;
        node = node.parentElement
      ) {
        for (const sibling of Array.from(node.parentElement.children)) {
          if (sibling !== node && sibling.tagName !== 'SCRIPT' && !sibling.hasAttribute('inert')) {
            sibling.setAttribute('inert', '');
            inerted.push(sibling);
          }
        }
      }
      onCleanup(() => inerted.forEach((element) => element.removeAttribute('inert')));
    });
    // The trap restores focus to the opener on close; the first stop is the field, which arms the action.
    effect(() => {
      if (this.open()) afterNextRender(() => this.input()?.nativeElement.focus(), { injector: this.injector });
    });
  }

  protected openDialog(): void {
    this.typed.set('');
    this.error.set(null);
    this.open.set(true);
  }

  protected cancel(): void {
    if (this.busy()) return;
    this.open.set(false);
    this.typed.set('');
    this.error.set(null);
    // Safari does not focus a button on click, so the trap has nothing to restore: return to the opener explicitly.
    afterNextRender(() => this.opener()?.nativeElement.focus(), { injector: this.injector });
  }

  protected onEscape(): void {
    if (this.open()) this.cancel();
  }

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.armed() || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.status.set('Borrando…');
    // The confirm button is about to be disabled: keep focus inside the dialog, on the status text.
    this.progress()?.nativeElement.focus();
    try {
      await this.device.clearAll();
    } catch (error) {
      // Fixed text for every failure: the error itself is never shown.
      const untouched = error instanceof DataError && error.message === NOTHING_CHANGED;
      const text = untouched ? DEVICE_CLEAR_FAILED_TEXT : DEVICE_CLEAR_PARTIAL_TEXT;
      this.error.set(text);
      this.status.set('');
      void this.announcer.assertive(text);
      if (untouched) {
        this.busy.set(false);
        return;
      }
      // The data layer of this tab is closed and its state is dead: load /app again after the text could be read.
      await this.pause();
      this.leave();
      return;
    }
    this.status.set(DEVICE_CLEARED_STATUS);
    await this.pause();
    this.leave();
  }

  private pause(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, this.delayMs));
  }
}
