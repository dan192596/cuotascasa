import { z } from 'zod';
import { baseRecordShape, isoInstantSchema, localDateSchema, noteSchema, textSchema, uuidSchema } from '../common.ts';
import {
  advanceInstallmentsPayloadShape,
  checkRateChange,
  fixedChargeChangePayloadShape,
  prepaymentPayloadShape,
  rateChangePayloadShape,
} from './loan-event.ts';

/**
 * Hypothetical event embedded in a Scenario. `id` is stable (the in-cell abono edits it in place) and
 * `deletedAt` is the embedded tombstone used when the cell is emptied (spec §9, «Abono en celda»).
 * The engine facade ignores events whose deletedAt is not null.
 */
const scenarioEventCommonShape = {
  id: uuidSchema,
  date: localDateSchema,
  note: noteSchema.optional(),
  deletedAt: isoInstantSchema.nullable(),
} as const;

export const scenarioEventSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...scenarioEventCommonShape, ...rateChangePayloadShape }).superRefine(checkRateChange),
  z.strictObject({ ...scenarioEventCommonShape, ...fixedChargeChangePayloadShape }),
  z.strictObject({ ...scenarioEventCommonShape, ...prepaymentPayloadShape }),
  z.strictObject({ ...scenarioEventCommonShape, ...advanceInstallmentsPayloadShape }),
]);
export type ScenarioEvent = z.infer<typeof scenarioEventSchema>;

/** A named set of hypothetical events of one loan (ADR-0005); each must fall after cutoffK ([ALG.PATHS.CUTOFF]). */
export const scenarioSchema = z
  .strictObject({
    ...baseRecordShape,
    loanId: uuidSchema,
    name: textSchema(60),
    events: z.array(scenarioEventSchema).max(200),
  })
  .superRefine((scenario, ctx) => {
    const seen = new Set<string>();
    scenario.events.forEach((event, index) => {
      if (seen.has(event.id)) {
        ctx.addIssue({ code: 'custom', message: 'Duplicate scenario event id', path: ['events', index, 'id'] });
      }
      seen.add(event.id);
    });
  });
export type Scenario = z.infer<typeof scenarioSchema>;
