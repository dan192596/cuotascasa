import { NotImplementedError } from '@cuotascasa/domain';
import { EXPORT_FILE_TYPES, type ReportWriter } from '../report-model.ts';

/** Stub de W4-10. W4-10 reemplaza este archivo con el escritor real (misma forma) y borra stub.spec.ts. */
export const excelWriter: ReportWriter = {
  format: 'excel',
  mimeType: EXPORT_FILE_TYPES.excel.mimeType,
  extension: EXPORT_FILE_TYPES.excel.extension,
  write: () => Promise.reject(new NotImplementedError('W4-10')),
};
