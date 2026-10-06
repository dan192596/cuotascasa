import {
  type ComparisonMetrics,
  type LocalDate,
  NotImplementedError,
  type PathKind,
  type Schedule,
} from '@cuotascasa/domain';
import type { ReportModel } from '../report-model.ts';

/** Entrada de `buildScheduleReport`: el calendario de una vista y sus rótulos. */
export interface ScheduleReportInput {
  readonly schedule: Schedule;
  readonly pathKind: PathKind;
  /** Alias del préstamo (dato del usuario; nunca sale del dispositivo). */
  readonly loanLabel: string;
  readonly generatedOn: LocalDate;
}

/** Un escenario comparado contra la base. */
export interface ComparedScenario {
  readonly label: string;
  readonly schedule: Schedule;
  readonly metrics: ComparisonMetrics;
}

/** Entrada de `buildComparisonReport`: la base y hasta 3 escenarios con sus métricas ([ALG.METRICS]). */
export interface ComparisonReportInput {
  readonly base: { readonly label: string; readonly schedule: Schedule };
  readonly scenarios: readonly ComparedScenario[];
  readonly loanLabel: string;
  readonly generatedOn: LocalDate;
}

export type BuildScheduleReportFn = (input: ScheduleReportInput) => ReportModel;
export type BuildComparisonReportFn = (input: ComparisonReportInput) => ReportModel;

/** Stubs de W3-15. W3-15 reemplaza este archivo (mismas firmas) y borra stub.spec.ts. */
export const buildScheduleReport: BuildScheduleReportFn = () => {
  throw new NotImplementedError('W3-15');
};
export const buildComparisonReport: BuildComparisonReportFn = () => {
  throw new NotImplementedError('W3-15');
};
