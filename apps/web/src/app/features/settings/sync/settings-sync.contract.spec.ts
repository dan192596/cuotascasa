import { reflectComponentType } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { SettingsSyncComponent } from './settings-sync.component.ts';

/** Frozen contract of cc-settings-sync (docs/specs/component-contracts.md). Implemented by W5-08. */
describe('cc-settings-sync contract', () => {
  it('keeps its selector and has no inputs or outputs', () => {
    const mirror = reflectComponentType(SettingsSyncComponent);
    expect(mirror?.selector).toBe('cc-settings-sync');
    expect(mirror?.isStandalone).toBe(true);
    expect(mirror?.inputs).toEqual([]);
    expect(mirror?.outputs).toEqual([]);
  });
});
