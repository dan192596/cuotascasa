import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
  viewChild,
} from '@angular/core';
import type { ExportFormat } from '@cuotascasa/export';
import type { ComparisonReportInput, ScheduleReportInput } from '@cuotascasa/export/model';
import { Announcer } from '../../ui/feedback/announcer.service.ts';
import { ExportSession } from './export-session.service.ts';
import {
  EXPORT_LOADERS,
  type ExportFailureStage,
  exportErrorMessage,
  exportFileName,
  FILE_SAVER,
  FORMAT_LABELS,
} from './export-support.ts';

/** What the host wants exported: the table of one view (W5-02) or the comparison (W5-05). */
export type ExportRequest =
  | { readonly kind: 'schedule'; readonly input: ScheduleReportInput }
  | { readonly kind: 'comparison'; readonly input: ComparisonReportInput };

let nextId = 0;

const FORMATS: readonly ExportFormat[] = ['excel', 'csv', 'pdf'];

/**
 * Export menu (R19, ADR-0013): Excel, CSV and PDF. The writers are fetched with a dynamic `import()` only when a format
 * is chosen. The first download of the session asks first, because the files are not encrypted (privacy page).
 */
@Component({
  selector: 'cc-export-menu',
  template: `
    <div class="menu">
      <button
        #trigger
        type="button"
        class="trigger"
        data-testid="export-trigger"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="open() ? listId : null"
        [attr.aria-disabled]="busy() !== null ? 'true' : null"
        [attr.aria-busy]="busy() !== null ? 'true' : null"
        (click)="toggle()"
      >
        Exportar
      </button>
      @if (open()) {
        <ul class="list" [id]="listId" data-testid="export-list">
          @for (format of formats; track format) {
            <li>
              <button type="button" [attr.data-testid]="'format-' + format" (click)="choose(format)">
                {{ labels[format] }}
              </button>
            </li>
          }
        </ul>
      }
    </div>
    @if (pending(); as format) {
      <div class="warning" role="group" [attr.aria-labelledby]="warningId" data-testid="export-warning">
        <p [id]="warningId">
          <strong>Antes de descargar:</strong> el Excel, CSV o PDF no va cifrado y contiene datos financieros. Guárdalo
          en un lugar seguro.
        </p>
        <button
          #confirm
          type="button"
          data-testid="warning-confirm"
          [attr.aria-describedby]="warningId"
          (click)="confirmWarning(format)"
        >
          Descargar {{ labels[format] }}
        </button>
        <button type="button" data-testid="warning-cancel" (click)="cancelWarning()">Cancelar</button>
      </div>
    }
    @if (busy(); as format) {
      <p class="progress" data-testid="export-progress">Generando archivo {{ labels[format] }}…</p>
    }
    @if (error(); as message) {
      <p class="error" data-testid="export-error">{{ message }}</p>
    }
  `,
  styles: `
    :host {
      display: inline-block;
      position: relative;
    }
    .menu {
      position: relative;
    }
    .list {
      list-style: none;
      margin: 0.25rem 0 0;
      padding: 0.25rem;
      display: grid;
      gap: 0.25rem;
      background: var(--cc-color-surface);
      border: 1px solid var(--cc-color-control-border);
      border-radius: 0.5rem;
    }
    .warning,
    .progress,
    .error {
      margin: 0.5rem 0 0;
      max-width: 28rem;
    }
    .warning {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .warning p {
      flex-basis: 100%;
      margin: 0;
    }
    button {
      min-height: 2.75rem;
      padding: 0 1rem;
      border: 1px solid var(--cc-color-control-border);
      border-radius: 0.25rem;
      background: var(--cc-color-surface);
      color: var(--cc-color-ink);
      font: inherit;
      cursor: pointer;
    }
    .error {
      color: var(--cc-color-danger);
    }
  `,
  host: {
    '(keydown.escape)': 'escape()',
    '(document:click)': 'outsideClick($event)',
    '(focusout)': 'focusOut($event)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExportMenuComponent {
  readonly request = input.required<ExportRequest>();

  protected readonly formats = FORMATS;
  protected readonly labels = FORMAT_LABELS;
  private readonly uid = nextId++;
  protected readonly listId = `cc-export-list-${this.uid}`;
  protected readonly warningId = `cc-export-warning-${this.uid}`;
  protected readonly open = signal(false);
  /** Format waiting for the user to accept the unencrypted-file notice. */
  protected readonly pending = signal<ExportFormat | null>(null);
  protected readonly busy = signal<ExportFormat | null>(null);
  protected readonly error = signal<string | null>(null);

  private readonly session = inject(ExportSession);
  private readonly loaders = inject(EXPORT_LOADERS);
  private readonly saveFile = inject(FILE_SAVER);
  private readonly announcer = inject(Announcer);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly confirm = viewChild<ElementRef<HTMLButtonElement>>('confirm');

  protected escape(): void {
    if (this.pending() !== null) this.cancelWarning();
    else this.close(true);
  }

  protected outsideClick(event: Event): void {
    if (event.target instanceof Node && !this.host.nativeElement.contains(event.target)) this.close(false);
  }

  protected focusOut(event: FocusEvent): void {
    const next = event.relatedTarget;
    if (next instanceof Node && this.host.nativeElement.contains(next)) return;
    this.close(false);
  }

  protected toggle(): void {
    if (this.busy() !== null) return;
    this.open.update((value) => !value);
  }

  protected close(restoreFocus: boolean): void {
    if (!this.open()) return;
    this.open.set(false);
    if (restoreFocus) this.focusAfterRender(this.trigger);
  }

  protected choose(format: ExportFormat): void {
    this.open.set(false);
    this.error.set(null);
    if (this.session.warningAccepted()) {
      this.focusAfterRender(this.trigger);
      void this.run(format);
      return;
    }
    this.pending.set(format);
    this.focusAfterRender(this.confirm);
  }

  protected confirmWarning(format: ExportFormat): void {
    this.session.warningAccepted.set(true);
    this.pending.set(null);
    this.focusAfterRender(this.trigger);
    void this.run(format);
  }

  protected cancelWarning(): void {
    this.pending.set(null);
    this.focusAfterRender(this.trigger);
  }

  private focusAfterRender(target: () => ElementRef<HTMLButtonElement> | undefined): void {
    afterNextRender(() => target()?.nativeElement.focus(), { injector: this.injector });
  }

  private async run(format: ExportFormat): Promise<void> {
    const request = this.request();
    let stage: ExportFailureStage = 'load';
    this.busy.set(format);
    try {
      const [writer, builders] = await Promise.all([this.loaders.writers[format](), this.loaders.builders()]);
      stage = 'write';
      const model =
        request.kind === 'schedule'
          ? builders.buildScheduleReport(request.input)
          : builders.buildComparisonReport(request.input);
      const bytes = await writer.write(model);
      const fileName = exportFileName(
        request.kind === 'schedule'
          ? { kind: 'schedule', pathKind: request.input.pathKind, generatedOn: request.input.generatedOn }
          : { kind: 'comparison', generatedOn: request.input.generatedOn },
        writer.extension,
      );
      // Copy into a plain ArrayBuffer so the bytes are a valid BlobPart whatever buffer the writer returned.
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      this.saveFile(copy, writer.mimeType, fileName);
      void this.announcer.polite(`Archivo ${FORMAT_LABELS[format]} listo: ${fileName}`);
    } catch {
      // The error text can carry amounts or loan names: only fixed copy by stage is shown.
      const message = exportErrorMessage(stage);
      this.error.set(message);
      void this.announcer.assertive(message);
    } finally {
      this.busy.set(null);
    }
  }
}
