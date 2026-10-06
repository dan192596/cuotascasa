import { type InputSignal, reflectComponentType } from '@angular/core';
import type { ComparisonReportInput, ScheduleReportInput } from '@cuotascasa/export/model';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { ExportMenuComponent, type ExportRequest } from './export-menu.component.ts';

/** Frozen contract of cc-export-menu (docs/specs/component-contracts.md). Implemented by W5-06. */
describe('cc-export-menu contract', () => {
  it('keeps its selector, one required signal input request and no outputs', () => {
    const mirror = reflectComponentType(ExportMenuComponent);
    expect(mirror?.selector).toBe('cc-export-menu');
    expect(mirror?.isStandalone).toBe(true);
    expect(mirror?.inputs.map(({ templateName, isSignal }) => ({ templateName, isSignal }))).toEqual([
      { templateName: 'request', isSignal: true },
    ]);
    expect(mirror?.outputs).toEqual([]);
  });

  it('keeps the request type', () => {
    type ExpectedRequest =
      | { readonly kind: 'schedule'; readonly input: ScheduleReportInput }
      | { readonly kind: 'comparison'; readonly input: ComparisonReportInput };
    expectTypeOf<ExportRequest>().toEqualTypeOf<ExpectedRequest>();
    expectTypeOf<ExportMenuComponent['request']>().toEqualTypeOf<InputSignal<ExportRequest>>();
  });
});
