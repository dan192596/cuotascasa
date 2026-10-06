import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { BACKUP_SERVICE } from '../tokens.ts';
import { CC_STUB, provideBackup } from './provide-backup.ts';

describe('provideBackup (inert W0-05 stub, W4-08)', () => {
  it('reports no backup, no reminder and writes nothing', async () => {
    TestBed.configureTestingModule({ providers: [provideBackup()] });
    const backup = TestBed.inject(BACKUP_SERVICE);
    expect(CC_STUB).toBe('CC_STUB:W4-08');
    expect(backup.reminderDue()).toBe(false);
    expect(backup.lastBackupAt()).toBeNull();
    expect(backup.changesSinceBackup()).toBe(0);
    await expect(backup.exportJson()).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
  });
});
