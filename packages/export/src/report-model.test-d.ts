import type { ComparisonMetrics, Currency, LocalDate, Money, PathKind, Schedule } from '@cuotascasa/domain';
import { describe, expectTypeOf, it } from 'vitest';
import type { csvWriter } from './csv/index.ts';
import type { excelWriter } from './excel/index.ts';
import type {
  BuildComparisonReportFn,
  BuildScheduleReportFn,
  ComparisonReportInput,
  ScheduleReportInput,
  buildComparisonReport,
  buildScheduleReport,
} from './model/index.ts';
import type { pdfWriter } from './pdf/index.ts';
import type { ExportFormat, ReportCell, ReportModel, ReportWriter } from './report-model.ts';

describe('export contract types', () => {
  it('ExportFormat matches the subpaths csv | excel | pdf', () => {
    expectTypeOf<ExportFormat>().toEqualTypeOf<'csv' | 'excel' | 'pdf'>();
  });

  it('money cells carry Money strings, never numbers', () => {
    expectTypeOf<Extract<ReportCell, { kind: 'money' }>['value']>().toEqualTypeOf<Money>();
    expectTypeOf<number>().not.toExtend<Extract<ReportCell, { kind: 'money' }>['value']>();
    expectTypeOf<Extract<ReportCell, { kind: 'date' }>['value']>().toEqualTypeOf<LocalDate>();
  });

  it('ReportModel carries currency, generation date, meta and tables', () => {
    expectTypeOf<ReportModel['currency']>().toEqualTypeOf<Currency>();
    expectTypeOf<ReportModel['generatedOn']>().toEqualTypeOf<LocalDate>();
    expectTypeOf<keyof ReportModel>().toEqualTypeOf<
      'kind' | 'title' | 'currency' | 'currencyLabel' | 'generatedOn' | 'meta' | 'tables'
    >();
  });

  it('every writer is a ReportWriter that resolves to bytes', () => {
    expectTypeOf<ReportWriter['write']>().toEqualTypeOf<(model: ReportModel) => Promise<Uint8Array>>();
    expectTypeOf<typeof csvWriter>().toEqualTypeOf<ReportWriter>();
    expectTypeOf<typeof excelWriter>().toEqualTypeOf<ReportWriter>();
    expectTypeOf<typeof pdfWriter>().toEqualTypeOf<ReportWriter>();
  });

  it('the model builders keep their frozen signatures', () => {
    expectTypeOf<typeof buildScheduleReport>().toEqualTypeOf<BuildScheduleReportFn>();
    expectTypeOf<typeof buildComparisonReport>().toEqualTypeOf<BuildComparisonReportFn>();
    expectTypeOf<BuildScheduleReportFn>().toEqualTypeOf<(input: ScheduleReportInput) => ReportModel>();
    expectTypeOf<BuildComparisonReportFn>().toEqualTypeOf<(input: ComparisonReportInput) => ReportModel>();
    expectTypeOf<ScheduleReportInput>().toEqualTypeOf<{
      readonly schedule: Schedule;
      readonly pathKind: PathKind;
      readonly loanLabel: string;
      readonly generatedOn: LocalDate;
    }>();
    expectTypeOf<ComparisonReportInput>().toEqualTypeOf<{
      readonly base: { readonly label: string; readonly schedule: Schedule };
      readonly scenarios: readonly {
        readonly label: string;
        readonly schedule: Schedule;
        readonly metrics: ComparisonMetrics;
      }[];
      readonly loanLabel: string;
      readonly generatedOn: LocalDate;
    }>();
  });
});
