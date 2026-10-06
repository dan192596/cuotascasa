import { NotImplementedError, parseLocalDate } from '@cuotascasa/domain';
import { describe, expect, it } from 'vitest';
import type { ReportModel } from '../report-model.ts';
import { excelWriter } from './index.ts';

const model: ReportModel = {
  kind: 'schedule',
  title: 'Tabla de amortización',
  currency: 'GTQ',
  currencyLabel: 'Q',
  generatedOn: parseLocalDate('2026-01-15'),
  meta: [{ label: 'Moneda', value: 'GTQ' }],
  tables: [],
};

describe('excel/ stub (owned by W4-10)', () => {
  it('declares its format and rejects with NotImplementedError naming W4-10 on write', async () => {
    expect(excelWriter.format).toBe('excel');
    expect(excelWriter.mimeType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(excelWriter.extension).toBe('xlsx');
    await expect(excelWriter.write(model)).rejects.toThrow(NotImplementedError);
    await expect(excelWriter.write(model)).rejects.toThrow('W4-10');
  });
});
