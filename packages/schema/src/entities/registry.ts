import type { z } from 'zod';
import { actualPaymentSchema, type ActualPayment } from './actual-payment.ts';
import { loanSchema, type Loan } from './loan.ts';
import { loanEventSchema, type LoanEvent } from './loan-event.ts';
import { reportedBalanceSchema, type ReportedBalance } from './reported-balance.ts';
import { scenarioSchema, type Scenario } from './scenario.ts';
import { settingsSchema, type Settings } from './settings.ts';

/** Collection keys shared by the backup `data` object, DataStore.exportAll and the sync dataset. */
export const ENTITY_KEYS = ['loans', 'events', 'reportedBalances', 'payments', 'scenarios', 'settings'] as const;
export type EntityKey = (typeof ENTITY_KEYS)[number];

export interface EntityRecordMap {
  loans: Loan;
  events: LoanEvent;
  reportedBalances: ReportedBalance;
  payments: ActualPayment;
  scenarios: Scenario;
  settings: Settings;
}

export const ENTITY_SCHEMAS: { readonly [K in EntityKey]: z.ZodType<EntityRecordMap[K]> } = {
  loans: loanSchema,
  events: loanEventSchema,
  reportedBalances: reportedBalanceSchema,
  payments: actualPaymentSchema,
  scenarios: scenarioSchema,
  settings: settingsSchema,
};
