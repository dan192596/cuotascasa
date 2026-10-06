import { reflectComponentType } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { UpdatePromptComponent } from './update-prompt.component.ts';

/** Frozen contract of cc-update-prompt (docs/specs/component-contracts.md). Implemented by W3-14. */
describe('cc-update-prompt contract', () => {
  it('keeps its selector and has no inputs or outputs', () => {
    const mirror = reflectComponentType(UpdatePromptComponent);
    expect(mirror?.selector).toBe('cc-update-prompt');
    expect(mirror?.isStandalone).toBe(true);
    expect(mirror?.inputs).toEqual([]);
    expect(mirror?.outputs).toEqual([]);
  });
});
