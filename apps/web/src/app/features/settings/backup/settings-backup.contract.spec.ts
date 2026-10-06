import { reflectComponentType } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { SettingsBackupComponent } from './settings-backup.component.ts';

/** Frozen contract of cc-settings-backup (docs/specs/component-contracts.md). Implemented by W5-07. */
describe('cc-settings-backup contract', () => {
  it('keeps its selector and has no inputs or outputs', () => {
    const mirror = reflectComponentType(SettingsBackupComponent);
    expect(mirror?.selector).toBe('cc-settings-backup');
    expect(mirror?.isStandalone).toBe(true);
    expect(mirror?.inputs).toEqual([]);
    expect(mirror?.outputs).toEqual([]);
  });
});
