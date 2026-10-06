import { NotImplementedError, parseLocalDate } from '@cuotascasa/domain';
import { describe, expect, it } from 'vitest';
import type { ReportModel } from '../report-model.ts';
import { pdfWriter } from './index.ts';

const model: ReportModel = {
  kind: 'schedule',
  title: 'Tabla de amortización',
  currency: 'GTQ',
  currencyLabel: 'Q',
  generatedOn: parseLocalDate('2026-01-15'),
  meta: [{ label: 'Moneda', value: 'GTQ' }],
  tables: [],
};

describe('pdf/ stub (owned by W4-11)', () => {
  it('declares its format and rejects with NotImplementedError naming W4-11 on write', async () => {
    expect(pdfWriter.format).toBe('pdf');
    expect(pdfWriter.mimeType).toBe('application/pdf');
    expect(pdfWriter.extension).toBe('pdf');
    await expect(pdfWriter.write(model)).rejects.toThrow(NotImplementedError);
    await expect(pdfWriter.write(model)).rejects.toThrow('W4-11');
  });
});
