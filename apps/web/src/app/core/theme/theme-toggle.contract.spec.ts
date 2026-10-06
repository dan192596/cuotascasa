import { reflectComponentType } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { ThemeToggleComponent } from './theme-toggle.component.ts';

/** Frozen contract of cc-theme-toggle (docs/specs/component-contracts.md). Implemented by W3-05. */
describe('cc-theme-toggle contract', () => {
  it('keeps its selector and has no inputs or outputs', () => {
    const mirror = reflectComponentType(ThemeToggleComponent);
    expect(mirror?.selector).toBe('cc-theme-toggle');
    expect(mirror?.isStandalone).toBe(true);
    expect(mirror?.inputs).toEqual([]);
    expect(mirror?.outputs).toEqual([]);
  });
});
