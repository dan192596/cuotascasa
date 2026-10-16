import { InjectionToken } from '@angular/core';
import { PathKind } from '@cuotascasa/domain';
import type { ExportFormat, ReportWriter } from '@cuotascasa/export';
import type { BuildComparisonReportFn, BuildScheduleReportFn } from '@cuotascasa/export/model';

/** Report builders of `@cuotascasa/export/model`; loaded together, only when a download is requested. */
export interface ReportBuilders {
  readonly buildScheduleReport: BuildScheduleReportFn;
  readonly buildComparisonReport: BuildComparisonReportFn;
}

/**
 * The only door to `@cuotascasa/export` (ADR-0013, W5-06): every loader is a dynamic `import()` run on click, so no
 * writer is in the initial graph. A test provides spies to prove that one format loads only its own chunk.
 */
export interface ExportLoaders {
  readonly writers: { readonly [F in ExportFormat]: () => Promise<ReportWriter> };
  readonly builders: () => Promise<ReportBuilders>;
}

export const EXPORT_LOADERS = new InjectionToken<ExportLoaders>('EXPORT_LOADERS', {
  providedIn: 'root',
  factory: () => ({
    writers: {
      csv: () => import('@cuotascasa/export/csv').then((m) => m.csvWriter),
      excel: () => import('@cuotascasa/export/excel').then((m) => m.excelWriter),
      pdf: () => import('@cuotascasa/export/pdf').then((m) => m.pdfWriter),
    },
    builders: () => import('@cuotascasa/export/model'),
  }),
});

/** Saves bytes as a file. The default builds a Blob and clicks an anchor; a test replaces it. */
export type FileSaver = (bytes: Uint8Array<ArrayBuffer>, mimeType: string, fileName: string) => void;

/** Milliseconds the object URL stays alive after the click, so every browser starts the download before it is revoked. */
export const OBJECT_URL_LIFETIME_MS = 1000;

export const saveBlobAsFile: FileSaver = (bytes, mimeType, fileName) => {
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_LIFETIME_MS);
};

export const FILE_SAVER = new InjectionToken<FileSaver>('FILE_SAVER', {
  providedIn: 'root',
  factory: () => saveBlobAsFile,
});

const SCHEDULE_VIEW_SLUGS = {
  [PathKind.ORIGINAL]: 'original',
  [PathKind.REAL]: 'real',
  [PathKind.SCENARIO]: 'escenario',
} as const satisfies Record<PathKind, string>;

/** `cuotascasa-<tabla|comparacion>-<vista>-AAAA-MM-DD.<ext>`: no loan name, bank or amount ever goes in a file name. */
export function exportFileName(
  request:
    | { readonly kind: 'schedule'; readonly pathKind: PathKind; readonly generatedOn: string }
    | { readonly kind: 'comparison'; readonly generatedOn: string },
  extension: string,
): string {
  const [what, view] =
    request.kind === 'schedule'
      ? (['tabla', SCHEDULE_VIEW_SLUGS[request.pathKind]] as const)
      : (['comparacion', 'escenarios'] as const);
  return `cuotascasa-${what}-${view}-${request.generatedOn}.${extension}`;
}

export type ExportFailureStage = 'load' | 'write';

/** Fixed Spanish copy by stage: an error's own text may carry amounts or loan names and is never shown. */
export function exportErrorMessage(stage: ExportFailureStage): string {
  return stage === 'load'
    ? 'No se pudo preparar la exportación. Revisa tu conexión a internet e inténtalo de nuevo.'
    : 'No se pudo generar el archivo. Inténtalo de nuevo.';
}

/** Spanish names of the formats, for buttons and announcements. */
export const FORMAT_LABELS = {
  excel: 'Excel',
  csv: 'CSV',
  pdf: 'PDF',
} as const satisfies Record<ExportFormat, string>;
