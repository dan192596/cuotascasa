import { CurrencyMismatchError } from '@cuotascasa/domain';
import type { ReportCell, ReportColumn, ReportRow } from '../report-model.ts';
import { currencyLabelOf, formatLocalDate } from './format.ts';
import type { BuildComparisonReportFn } from './types.ts';

const EMPTY: ReportCell = { kind: 'empty' };

function columns(label: string): readonly ReportColumn[] {
  return [
    { key: 'scenario', header: 'Escenario', kind: 'text', width: 28 },
    { key: 'installmentCount', header: 'Cuotas', kind: 'integer', width: 10 },
    { key: 'endDate', header: 'Fecha de fin', kind: 'date', width: 14 },
    { key: 'totalPaid', header: `Total pagado (${label})`, kind: 'money', width: 20 },
    { key: 'interestSaved', header: `Interés ahorrado (${label})`, kind: 'money', width: 22 },
    { key: 'monthsSaved', header: 'Meses ahorrados', kind: 'integer', width: 16 },
    { key: 'netSaving', header: `Ahorro neto (${label})`, kind: 'money', width: 20 },
  ];
}

/** [ALG.METRICS] Arma la comparación de la base contra sus escenarios, en una sola moneda (R27). */
export const buildComparisonReport: BuildComparisonReportFn = ({ base, scenarios, loanLabel, generatedOn }) => {
  const { currency } = base.schedule;
  const label = currencyLabelOf(currency);
  for (const scenario of scenarios) {
    if (scenario.schedule.currency !== currency) {
      throw new CurrencyMismatchError(currency, scenario.schedule.currency);
    }
  }

  const rows: ReportRow[] = [
    {
      role: 'data',
      cells: [
        { kind: 'text', value: base.label },
        { kind: 'integer', value: base.schedule.installmentCount },
        { kind: 'date', value: base.schedule.endDate },
        { kind: 'money', value: base.schedule.totals.totalPaid },
        EMPTY,
        EMPTY,
        EMPTY,
      ],
    },
    ...scenarios.map((scenario): ReportRow => ({
      role: 'data',
      cells: [
        { kind: 'text', value: scenario.label },
        { kind: 'integer', value: scenario.schedule.installmentCount },
        { kind: 'date', value: scenario.metrics.endDate },
        { kind: 'money', value: scenario.metrics.totalPaid },
        { kind: 'money', value: scenario.metrics.interestSaved },
        { kind: 'integer', value: scenario.metrics.monthsSaved },
        { kind: 'money', value: scenario.metrics.netSaving },
      ],
    })),
  ];

  return {
    kind: 'comparison',
    title: 'Comparación de escenarios',
    currency,
    currencyLabel: label,
    generatedOn,
    meta: [
      { label: 'Préstamo', value: loanLabel },
      { label: 'Moneda', value: currency },
      { label: 'Base', value: base.label },
      { label: 'Generado', value: formatLocalDate(generatedOn) },
    ],
    tables: [{ sheetName: 'Comparación', title: 'Comparación de escenarios', columns: columns(label), rows }],
  };
};
