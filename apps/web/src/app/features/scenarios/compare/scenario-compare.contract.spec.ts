import { type InputSignal, reflectComponentType } from '@angular/core';
import type { Uuid } from '@cuotascasa/schema';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { ScenarioCompareComponent } from './scenario-compare.component.ts';

/** Frozen contract of cc-scenario-compare (docs/specs/component-contracts.md). Implemented by W5-05. */
describe('cc-scenario-compare contract', () => {
  it('keeps its selector, one required signal input loanId and no outputs', () => {
    const mirror = reflectComponentType(ScenarioCompareComponent);
    expect(mirror?.selector).toBe('cc-scenario-compare');
    expect(mirror?.isStandalone).toBe(true);
    expect(mirror?.inputs.map(({ templateName, isSignal }) => ({ templateName, isSignal }))).toEqual([
      { templateName: 'loanId', isSignal: true },
    ]);
    expect(mirror?.outputs).toEqual([]);
  });

  it('keeps the input type', () => {
    expectTypeOf<ScenarioCompareComponent['loanId']>().toEqualTypeOf<InputSignal<Uuid>>();
  });
});
