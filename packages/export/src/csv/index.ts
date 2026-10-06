import { NotImplementedError } from '@cuotascasa/domain';
import { EXPORT_FILE_TYPES, type ReportWriter } from '../report-model.ts';

/** Stub de W3-15. W3-15 reemplaza este archivo con el escritor real (misma forma) y borra stub.spec.ts. */
export const csvWriter: ReportWriter = {
  format: 'csv',
  mimeType: EXPORT_FILE_TYPES.csv.mimeType,
  extension: EXPORT_FILE_TYPES.csv.extension,
  write: () => Promise.reject(new NotImplementedError('W3-15')),
};
