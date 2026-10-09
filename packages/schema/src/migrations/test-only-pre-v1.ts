import { z } from 'zod';
import type { BackupMigration } from '../backup/types.ts';
import { backupDocumentV1Schema } from '../backup/v1.ts';
import { actualPaymentSchema } from '../entities/actual-payment.ts';
import { loanSchema } from '../entities/loan.ts';
import { loanEventSchema } from '../entities/loan-event.ts';
import { reportedBalanceSchema } from '../entities/reported-balance.ts';
import { scenarioSchema } from '../entities/scenario.ts';
import { loanExample } from '../__examples__/loan.example.ts';

/**
 * Test-only "version 0" (no settings collection) used to prove the migration chain while v1 is the only real
 * version. It is imported by specs only and never registered in backupMigrations.
 */
export const backupDocumentV0Schema = backupDocumentV1Schema.omit({ version: true, data: true }).extend({
  version: z.literal(0),
  data: z.strictObject({
    loans: z.array(loanSchema),
    events: z.array(loanEventSchema),
    reportedBalances: z.array(reportedBalanceSchema),
    payments: z.array(actualPaymentSchema),
    scenarios: z.array(scenarioSchema),
  }),
});

export const preV1Document = {
  format: 'cuotascasa',
  version: 0,
  exportedAt: '2026-10-04T16:00:00.000Z',
  deviceId: 'd0000000-0000-4000-8000-000000000001',
  appVersion: '0.9.0',
  data: { loans: [loanExample], events: [], reportedBalances: [], payments: [], scenarios: [] },
};

export const preV1ToV1: BackupMigration = {
  from: 0,
  to: 1,
  migrate(input) {
    const document = input as { data: Record<string, unknown> };
    return { ...document, version: 1, data: { ...document.data, settings: [] } };
  },
};
