import { describe, expect, it } from 'vitest';
import { scenarioExample } from '../__examples__/scenario.example.ts';
import { withField } from '../test-support/with-field.ts';
import { scenarioSchema } from './scenario.ts';

describe('scenarioSchema', () => {
  it('parses its synthetic example', () => {
    expect(scenarioSchema.parse(scenarioExample)).toEqual(scenarioExample);
  });

  it('rejects a number-typed money field and a Date-typed date field', () => {
    expect(scenarioSchema.safeParse(withField(scenarioExample, ['events', 0, 'amount'], 20000)).success).toBe(false);
    expect(
      scenarioSchema.safeParse(withField(scenarioExample, ['events', 0, 'date'], new Date('2026-01-31T00:00:00Z')))
        .success,
    ).toBe(false);
  });

  it('accepts an embedded tombstone and rejects duplicate event ids', () => {
    expect(
      scenarioSchema.safeParse(withField(scenarioExample, ['events', 0, 'deletedAt'], '2026-10-05T15:00:00.000Z'))
        .success,
    ).toBe(true);
    const first = scenarioExample.events[0];
    expect(scenarioSchema.safeParse({ ...scenarioExample, events: [first, first] }).success).toBe(false);
  });

  it('accepts every hypothetical event type and rejects real-only types', () => {
    const common = { date: '2026-03-31', deletedAt: null };
    const events = [
      {
        ...common,
        id: 'f1000000-0000-4000-8000-000000000002',
        type: 'RateChange',
        policy: 'RECALC_INSTALLMENT_KEEP_TERM',
        interestRate: '0.06',
      },
      { ...common, id: 'f1000000-0000-4000-8000-000000000003', type: 'FixedChargeChange', fixedCharges: [] },
      { ...common, id: 'f1000000-0000-4000-8000-000000000004', type: 'AdvanceInstallments', count: 3 },
    ];
    expect(scenarioSchema.safeParse({ ...scenarioExample, events }).success).toBe(true);
    const anchor = { ...common, id: 'f1000000-0000-4000-8000-000000000005', type: 'ReportedBalance', balance: '1.00' };
    expect(scenarioSchema.safeParse({ ...scenarioExample, events: [anchor] }).success).toBe(false);
  });
});
