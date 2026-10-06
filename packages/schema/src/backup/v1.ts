import { z } from 'zod';
import { isoInstantSchema, uuidSchema } from '../common.ts';
import { actualPaymentSchema } from '../entities/actual-payment.ts';
import { loanSchema } from '../entities/loan.ts';
import { loanEventSchema } from '../entities/loan-event.ts';
import { ENTITY_KEYS } from '../entities/registry.ts';
import { reportedBalanceSchema } from '../entities/reported-balance.ts';
import { scenarioSchema } from '../entities/scenario.ts';
import { settingsSchema } from '../entities/settings.ts';

/**
 * Collections of a v1 backup, tombstones included (ADR-0007 decision 1).
 * Ids are unique per collection; settings holds at most one record per scope.
 */
export const backupDataV1Schema = z
  .strictObject({
    loans: z.array(loanSchema),
    events: z.array(loanEventSchema),
    reportedBalances: z.array(reportedBalanceSchema),
    payments: z.array(actualPaymentSchema),
    scenarios: z.array(scenarioSchema),
    settings: z.array(settingsSchema).max(2),
  })
  .superRefine((data, ctx) => {
    for (const key of ENTITY_KEYS) {
      const seen = new Set<string>();
      const records: readonly { readonly id: string }[] = data[key];
      records.forEach((record, index) => {
        if (seen.has(record.id)) {
          ctx.addIssue({ code: 'custom', message: `Duplicate id in ${key}`, path: [key, index, 'id'] });
        }
        seen.add(record.id);
      });
    }
  });
export type BackupDataV1 = z.infer<typeof backupDataV1Schema>;

/**
 * Backup document v1. `synthetic: true` is accepted only so committed fixtures can carry the flag
 * (ADR-0015); parseBackup strips it and serializeBackup never emits it (ADR-0007, W1-03).
 */
export const backupDocumentV1Schema = z.strictObject({
  format: z.literal('cuotascasa'),
  version: z.literal(1),
  exportedAt: isoInstantSchema,
  deviceId: uuidSchema,
  appVersion: z.string().min(1).max(64),
  synthetic: z.literal(true).optional(),
  data: backupDataV1Schema,
});
export type BackupDocumentV1 = z.infer<typeof backupDocumentV1Schema>;
