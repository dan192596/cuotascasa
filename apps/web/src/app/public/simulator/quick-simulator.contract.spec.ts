import { reflectComponentType } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { QuickSimulatorComponent } from './quick-simulator.component.ts';

/** Frozen contract of cc-quick-simulator (docs/specs/component-contracts.md). Implemented by W4-03. */
describe('cc-quick-simulator contract', () => {
  it('keeps its selector and has no inputs or outputs', () => {
    const mirror = reflectComponentType(QuickSimulatorComponent);
    expect(mirror?.selector).toBe('cc-quick-simulator');
    expect(mirror?.isStandalone).toBe(true);
    expect(mirror?.inputs).toEqual([]);
    expect(mirror?.outputs).toEqual([]);
  });
});
