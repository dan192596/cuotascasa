import { type InputSignal, reflectComponentType } from '@angular/core';
import type { Uuid } from '@cuotascasa/schema';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { ScenarioEditorComponent } from './scenario-editor.component.ts';

/** Frozen contract of cc-scenario-editor (docs/specs/component-contracts.md). Implemented by W5-04. */
describe('cc-scenario-editor contract', () => {
  it('keeps its selector, one required signal input loanId and no outputs', () => {
    const mirror = reflectComponentType(ScenarioEditorComponent);
    expect(mirror?.selector).toBe('cc-scenario-editor');
    expect(mirror?.isStandalone).toBe(true);
    expect(mirror?.inputs.map(({ templateName, isSignal }) => ({ templateName, isSignal }))).toEqual([
      { templateName: 'loanId', isSignal: true },
    ]);
    expect(mirror?.outputs).toEqual([]);
  });

  it('keeps the input type', () => {
    expectTypeOf<ScenarioEditorComponent['loanId']>().toEqualTypeOf<InputSignal<Uuid>>();
  });
});
