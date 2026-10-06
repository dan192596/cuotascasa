/**
 * API raíz congelada de `@cuotascasa/export` (W0-03): solo el contrato, sin escritores.
 * Los escritores se cargan con `import()` desde `@cuotascasa/export/csv|excel|pdf` y el modelo desde `/model`.
 */
export {
  EXPORT_FILE_TYPES,
  EXPORT_FORMATS,
  type ExportFormat,
  type ReportCell,
  type ReportCellKind,
  type ReportColumn,
  type ReportMetaEntry,
  type ReportModel,
  type ReportRow,
  type ReportRowRole,
  type ReportTable,
  type ReportWriter,
} from './report-model.ts';
