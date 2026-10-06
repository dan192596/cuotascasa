import { describe, expect, it } from 'vitest';
import { actualPaymentExample } from '../__examples__/actual-payment.example.ts';
import { loanExample } from '../__examples__/loan.example.ts';
import { loanEventExample } from '../__examples__/loan-event.example.ts';
import { reportedBalanceExample } from '../__examples__/reported-balance.example.ts';
import { scenarioExample } from '../__examples__/scenario.example.ts';
import { deviceSettingsExample, syncedSettingsExample } from '../__examples__/settings.example.ts';
import { ENTITY_KEYS, ENTITY_SCHEMAS } from './registry.ts';

describe('ENTITY_SCHEMAS', () => {
  it('maps every collection key to the schema of its records', () => {
    expect(ENTITY_KEYS).toEqual(['loans', 'events', 'reportedBalances', 'payments', 'scenarios', 'settings']);
    expect(ENTITY_SCHEMAS.loans.safeParse(loanExample).success).toBe(true);
    expect(ENTITY_SCHEMAS.events.safeParse(loanEventExample).success).toBe(true);
    expect(ENTITY_SCHEMAS.reportedBalances.safeParse(reportedBalanceExample).success).toBe(true);
    expect(ENTITY_SCHEMAS.payments.safeParse(actualPaymentExample).success).toBe(true);
    expect(ENTITY_SCHEMAS.scenarios.safeParse(scenarioExample).success).toBe(true);
    expect(ENTITY_SCHEMAS.settings.safeParse(syncedSettingsExample).success).toBe(true);
    expect(ENTITY_SCHEMAS.settings.safeParse(deviceSettingsExample).success).toBe(true);
    expect(ENTITY_SCHEMAS.loans.safeParse(loanEventExample).success).toBe(false);
  });
});
