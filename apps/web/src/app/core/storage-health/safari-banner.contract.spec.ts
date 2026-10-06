import { reflectComponentType } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { SafariBannerComponent } from './safari-banner.component.ts';

/** Frozen contract of cc-safari-banner (docs/specs/component-contracts.md). Implemented by W3-13. */
describe('cc-safari-banner contract', () => {
  it('keeps its selector and has no inputs or outputs', () => {
    const mirror = reflectComponentType(SafariBannerComponent);
    expect(mirror?.selector).toBe('cc-safari-banner');
    expect(mirror?.isStandalone).toBe(true);
    expect(mirror?.inputs).toEqual([]);
    expect(mirror?.outputs).toEqual([]);
  });
});
