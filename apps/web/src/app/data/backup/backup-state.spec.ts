import { describe, expect, it } from 'vitest';
import { isReminderDue } from './backup-state.ts';

const DAY = 24 * 60 * 60 * 1000;
const NOW = '2026-10-31T12:00:00.000Z';
const ago = (days: number, extraMs = 0): string => new Date(Date.parse(NOW) - days * DAY - extraMs).toISOString();

describe('isReminderDue (ADR-0007 decision 8)', () => {
  describe('with a previous backup', () => {
    const base = { oldestActiveAt: null, now: NOW } as const;
    it('changes: 20 is not due, 21 is', () => {
      expect(isReminderDue({ ...base, lastBackupAt: ago(1), changesSinceBackup: 20 })).toBe(false);
      expect(isReminderDue({ ...base, lastBackupAt: ago(1), changesSinceBackup: 21 })).toBe(true);
    });
    it('days: 30 is not due, 31 is', () => {
      expect(isReminderDue({ ...base, lastBackupAt: ago(30), changesSinceBackup: 0 })).toBe(false);
      expect(isReminderDue({ ...base, lastBackupAt: ago(30, 1), changesSinceBackup: 0 })).toBe(true);
      expect(isReminderDue({ ...base, lastBackupAt: ago(31), changesSinceBackup: 0 })).toBe(true);
    });
    it('ignores the oldest record when a backup exists', () => {
      expect(isReminderDue({ lastBackupAt: ago(1), changesSinceBackup: 0, oldestActiveAt: ago(90), now: NOW })).toBe(
        false,
      );
    });
  });

  describe('without a previous backup (lastBackupAt null)', () => {
    it('changes: 20 is not due, 21 is', () => {
      const input = { lastBackupAt: null, oldestActiveAt: ago(1), now: NOW } as const;
      expect(isReminderDue({ ...input, changesSinceBackup: 20 })).toBe(false);
      expect(isReminderDue({ ...input, changesSinceBackup: 21 })).toBe(true);
    });
    it('days of the oldest active record: 30 is not due, 31 is', () => {
      const input = { lastBackupAt: null, changesSinceBackup: 0, now: NOW } as const;
      expect(isReminderDue({ ...input, oldestActiveAt: ago(30) })).toBe(false);
      expect(isReminderDue({ ...input, oldestActiveAt: ago(31) })).toBe(true);
    });
    it('without active records only the changes count', () => {
      expect(isReminderDue({ lastBackupAt: null, changesSinceBackup: 0, oldestActiveAt: null, now: NOW })).toBe(false);
      expect(isReminderDue({ lastBackupAt: null, changesSinceBackup: 21, oldestActiveAt: null, now: NOW })).toBe(true);
    });
  });
});
