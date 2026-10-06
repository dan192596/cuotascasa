import { type InputSignal, reflectComponentType } from '@angular/core';
import type { Uuid } from '@cuotascasa/schema';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { RealDataTimelineComponent } from './real-data-timeline.component.ts';

/** Frozen contract of cc-real-data-timeline (docs/specs/component-contracts.md). Implemented by W5-03. */
describe('cc-real-data-timeline contract', () => {
  it('keeps its selector, one required signal input loanId and no outputs', () => {
    const mirror = reflectComponentType(RealDataTimelineComponent);
    expect(mirror?.selector).toBe('cc-real-data-timeline');
    expect(mirror?.isStandalone).toBe(true);
    expect(mirror?.inputs.map(({ templateName, isSignal }) => ({ templateName, isSignal }))).toEqual([
      { templateName: 'loanId', isSignal: true },
    ]);
    expect(mirror?.outputs).toEqual([]);
  });

  it('keeps the input type', () => {
    expectTypeOf<RealDataTimelineComponent['loanId']>().toEqualTypeOf<InputSignal<Uuid>>();
  });
});
