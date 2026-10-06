import { NotImplementedError } from '@cuotascasa/domain';
import { EXPORT_FILE_TYPES, type ReportWriter } from '../report-model.ts';

/** Stub de W4-11. W4-11 reemplaza este archivo con el escritor real (misma forma) y borra stub.spec.ts. */
export const pdfWriter: ReportWriter = {
  format: 'pdf',
  mimeType: EXPORT_FILE_TYPES.pdf.mimeType,
  extension: EXPORT_FILE_TYPES.pdf.extension,
  write: () => Promise.reject(new NotImplementedError('W4-11')),
};
