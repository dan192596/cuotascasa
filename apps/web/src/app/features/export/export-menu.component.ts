import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { ComparisonReportInput, ScheduleReportInput } from '@cuotascasa/export/model';

/** Inert W0-05 stub; W5-06 replaces it keeping the frozen contract (export-menu.contract.spec.ts). */
export const CC_STUB = 'CC_STUB:W5-06';

/** What the host wants exported: the table of one view (W5-02) or the comparison (W5-05). */
export type ExportRequest =
  | { readonly kind: 'schedule'; readonly input: ScheduleReportInput }
  | { readonly kind: 'comparison'; readonly input: ComparisonReportInput };

@Component({
  selector: 'cc-export-menu',
  template: '',
  host: { 'data-cc-stub': CC_STUB },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExportMenuComponent {
  readonly request = input.required<ExportRequest>();
}
