import { NotImplementedError, parseLocalDate } from '@cuotascasa/domain';
import { describe, expect, it } from 'vitest';
import type { ReportModel } from '../report-model.ts';
import { csvWriter } from './index.ts';

const model: ReportModel = {
  kind: 'schedule',
  title: 'Tabla de amortización',
  currency: 'GTQ',
  currencyLabel: 'Q',
  generatedOn: parseLocalDate('2026-01-15'),
  meta: [{ label: 'Moneda', value: 'GTQ' }],
  tables: [],
};

describe('csv/ stub (owned by W3-15)', () => {
  it('declares its format and rejects with NotImplementedError naming W3-15 on write', async () => {
    expect(csvWriter.format).toBe('csv');
    expect(csvWriter.mimeType).toBe('text/csv;charset=utf-8');
    expect(csvWriter.extension).toBe('csv');
    await expect(csvWriter.write(model)).rejects.toThrow(NotImplementedError);
    await expect(csvWriter.write(model)).rejects.toThrow('W3-15');
  });
});
