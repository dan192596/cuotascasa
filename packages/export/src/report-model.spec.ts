import { describe, expect, it } from 'vitest';
import * as root from './index.ts';
import { EXPORT_FILE_TYPES, EXPORT_FORMATS } from './report-model.ts';

describe('export contract (ADR-0013)', () => {
  it('declares the three formats with their MIME type and extension', () => {
    expect(EXPORT_FORMATS).toEqual(['csv', 'excel', 'pdf']);
    expect(EXPORT_FILE_TYPES).toEqual({
      csv: { mimeType: 'text/csv;charset=utf-8', extension: 'csv' },
      excel: { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: 'xlsx' },
      pdf: { mimeType: 'application/pdf', extension: 'pdf' },
    });
  });

  it('the package root exposes only the contract, never a writer or a builder', () => {
    expect(Object.keys(root).sort()).toEqual(['EXPORT_FILE_TYPES', 'EXPORT_FORMATS']);
  });
});
