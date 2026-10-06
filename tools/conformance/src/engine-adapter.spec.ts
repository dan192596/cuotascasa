import { buildPaths, buildSchedule } from '@cuotascasa/domain';
import type { DomainEvent, LoanTerms, Paths, PathsInput, Schedule, ScheduleRow } from '@cuotascasa/domain';
import { EXPECTED_ROW_COLUMNS, fixtureInputsSchema, type FixtureInputs } from '@cuotascasa/schema';
import { describe, expect, it } from 'vitest';
import {
  PUBLIC_ENGINE_API,
  createPublicEngine,
  toDomainEvent,
  toExpectedRow,
  toExpectedSummary,
  toLoanTerms,
} from './engine-adapter.ts';

// Synthetic zero-rate loan ([ALG.ZERO]): 300.00 over 3 installments of 100.00.
const TERMS = {
  principal: '300.00',
  termMonths: 3,
  disbursementDate: '2025-01-01',
  firstDueDate: '2025-02-28',
  paymentDay: 'END_OF_MONTH',
  currency: 'GTQ',
  interestRate: '0.0700',
  insuranceRates: ['0.0100', '0.0026'],
  fixedCharges: [{ label: 'IUSI', amount: '25.00', effectiveFrom: '2025-02-28' }],
  roundingProfile: 'FHA_GT_V1',
} as const;

function inputs(events: unknown[]): FixtureInputs {
  return fixtureInputsSchema.parse({ terms: TERMS, events });
}

function row(k: number): ScheduleRow {
  return {
    k,
    dueDate: `2025-0${String(k + 1)}-28`,
    opening: '300.00',
    interest: '0.00',
    insurance: '0.00',
    insuranceComponents: ['0.00', '0.00'],
    capital: '100.00',
    fixedCharges: '0.00',
    total: '100.00',
    closing: '200.00',
    prepayment: '0.00',
    commission: '0.00',
    closingAfterPrepayment: '200.00',
    level: '100.00',
    isLast: false,
    payoff: false,
    paid: k === 1,
  } as unknown as ScheduleRow;
}

const SCHEDULE = {
  currency: 'GTQ',
  roundingProfile: 'FHA_GT_V1',
  rows: [row(1), row(2)],
  totals: {
    interest: '1.00',
    insurance: '2.00',
    capital: '300.00',
    fixedCharges: '3.00',
    prepayments: '4.00',
    commissions: '5.00',
    total: '306.00',
    totalPaid: '315.00',
  },
  endDate: '2025-04-30',
  installmentCount: 2,
} as unknown as Schedule;

describe('toLoanTerms', () => {
  it('brands every value through the domain parsers and fills the informative rateType', () => {
    expect(toLoanTerms(inputs([]).terms)).toEqual({
      principal: '300.00',
      termMonths: 3,
      disbursementDate: '2025-01-01',
      firstDueDate: '2025-02-28',
      paymentDay: 'END_OF_MONTH',
      currency: 'GTQ',
      interestRate: '0.07',
      insuranceRates: ['0.01', '0.0026'],
      fixedCharges: [{ label: 'IUSI', amount: '25.00', effectiveFrom: '2025-02-28' }],
      roundingProfile: 'FHA_GT_V1',
      rateType: 'FIXED',
    });
  });
});

describe('toDomainEvent', () => {
  it('maps the six fixture event types to the domain union, renaming fields where the contracts differ', () => {
    const events = inputs([
      {
        id: 'ev-01',
        type: 'RateChange',
        date: '2025-03-10',
        policy: 'BANK_INSTALLMENT',
        interestRate: '0.0750',
        bankInstallment: '101.00',
      },
      {
        id: 'ev-02',
        type: 'RateChange',
        date: '2025-03-11',
        policy: 'RECALC_INSTALLMENT_KEEP_TERM',
        insuranceRates: ['0.0100'],
      },
      {
        id: 'ev-03',
        type: 'FixedChargeChange',
        date: '2025-03-12',
        fixedCharges: [{ label: 'IUSI', amount: '30.00' }],
      },
      {
        id: 'ev-04',
        type: 'Prepayment',
        date: '2025-03-13',
        amount: '50.00',
        mode: 'REDUCE_TERM',
        commission: { kind: 'PERCENT', rate: '0.02' },
      },
      { id: 'ev-05', type: 'Prepayment', date: '2025-03-14', amount: '20.00', mode: 'REDUCE_INSTALLMENT' },
      { id: 'ev-06', type: 'AdvanceInstallments', date: '2025-03-15', count: 1 },
      { id: 'ev-07', type: 'ReportedBalance', date: '2025-03-16', installmentNumber: 2, balance: '200.00' },
      {
        id: 'ev-08',
        type: 'ActualPayment',
        paidDate: '2025-03-17',
        installmentNumber: 1,
        total: '100.00',
        breakdown: { capital: '100.00', interest: '0.00', insurance: '0.00', fixedCharges: '0.00' },
      },
    ]).events.map(toDomainEvent);
    expect(events).toEqual([
      {
        type: 'RateChange',
        id: 'ev-01',
        date: '2025-03-10',
        policy: 'BANK_INSTALLMENT',
        interestRate: '0.075',
        bankInstallment: '101.00',
      },
      {
        type: 'RateChange',
        id: 'ev-02',
        date: '2025-03-11',
        policy: 'RECALC_INSTALLMENT_KEEP_TERM',
        insuranceRates: ['0.01'],
      },
      {
        type: 'FixedChargeChange',
        id: 'ev-03',
        date: '2025-03-12',
        fixedCharges: [{ label: 'IUSI', amount: '30.00' }],
      },
      {
        type: 'Prepayment',
        id: 'ev-04',
        date: '2025-03-13',
        amount: '50.00',
        mode: 'REDUCE_TERM',
        commission: { kind: 'PERCENT', rate: '0.02' },
      },
      { type: 'Prepayment', id: 'ev-05', date: '2025-03-14', amount: '20.00', mode: 'REDUCE_INSTALLMENT' },
      { type: 'AdvanceInstallments', id: 'ev-06', date: '2025-03-15', count: 1 },
      { type: 'ReportedBalance', id: 'ev-07', date: '2025-03-16', balance: '200.00', installmentNumber: 2 },
      {
        type: 'ActualPayment',
        id: 'ev-08',
        date: '2025-03-17',
        installmentNumber: 1,
        total: '100.00',
        breakdown: { capital: '100.00', interest: '0.00', insurance: '0.00', fixedCharges: '0.00' },
      },
    ]);
  });
});

describe('engine output → fixture shape', () => {
  it('keeps exactly the expected-row columns, in the a-expected.csv order', () => {
    expect(Object.keys(toExpectedRow(row(1)))).toEqual([...EXPECTED_ROW_COLUMNS]);
  });

  it('maps the schedule totals to the fixture summary', () => {
    expect(toExpectedSummary(SCHEDULE)).toEqual({
      installments: 2,
      endDate: '2025-04-30',
      totalInterest: '1.00',
      totalInsurance: '2.00',
      totalCapital: '300.00',
      totalFixedCharges: '3.00',
      totalPrepayments: '4.00',
      totalCommissions: '5.00',
      totalPaid: '315.00',
    });
  });
});

describe('createPublicEngine', () => {
  it('uses buildSchedule when the fixture has no anchors or actual payments', () => {
    const calls: string[] = [];
    const engine = createPublicEngine({
      buildSchedule: (terms: LoanTerms, events: readonly DomainEvent[]) => {
        calls.push(`buildSchedule ${terms.interestRate} ${String(events.length)}`);
        return SCHEDULE;
      },
      buildPaths: () => {
        throw new Error('buildPaths must not be called');
      },
    });
    const result = engine(inputs([{ id: 'ev-01', type: 'AdvanceInstallments', date: '2025-03-15', count: 1 }]));
    expect(calls).toEqual(['buildSchedule 0.07 1']);
    expect(result.rows).toHaveLength(2);
    expect(result.anchors).toEqual([]);
    expect(result.payments).toEqual([]);
    expect(result.summary.totalPaid).toBe('315.00');
  });

  it('uses buildPaths for anchors and payments, in the order of inputs.events', () => {
    let received: PathsInput | undefined;
    const engine = createPublicEngine({
      buildSchedule: () => {
        throw new Error('buildSchedule must not be called');
      },
      buildPaths: (input: PathsInput) => {
        received = input;
        return {
          input,
          original: SCHEDULE,
          real: SCHEDULE,
          scenario: null,
          cutoffK: 2,
          realDelta: {
            perAnchor: [
              { eventId: 'ev-02', k: 2, reported: '199.00', projected: '200.00', realDelta: '-1.00' },
              { eventId: 'ev-01', k: 1, reported: '301.00', projected: '300.00', realDelta: '1.00' },
            ],
            perComponent: [
              { eventId: 'ev-04', k: 2, capital: '0.50', interest: '0.00', insurance: '0.00', fixedCharges: '0.00' },
            ],
          },
        } as unknown as Paths;
      },
    });
    const result = engine(
      inputs([
        { id: 'ev-01', type: 'ReportedBalance', date: '2025-02-20', balance: '301.00' },
        { id: 'ev-02', type: 'ReportedBalance', date: '2025-03-20', balance: '199.00' },
        { id: 'ev-03', type: 'ActualPayment', paidDate: '2025-02-28', installmentNumber: 1, total: '100.00' },
        {
          id: 'ev-04',
          type: 'ActualPayment',
          paidDate: '2025-03-31',
          installmentNumber: 2,
          total: '100.50',
          breakdown: { capital: '100.50', interest: '0.00', insurance: '0.00', fixedCharges: '0.00' },
        },
      ]),
    );
    expect(received?.scenarioEvents).toBeNull();
    expect(received?.realEvents).toHaveLength(4);
    expect(result.anchors).toEqual([
      { eventId: 'ev-01', k: 1, realDelta: '1.00' },
      { eventId: 'ev-02', k: 2, realDelta: '-1.00' },
    ]);
    expect(result.payments).toEqual([
      { eventId: 'ev-03', k: 1, componentDeltas: null },
      {
        eventId: 'ev-04',
        k: 2,
        componentDeltas: { capital: '0.50', interest: '0.00', insurance: '0.00', fixedCharges: '0.00' },
      },
    ]);
  });

  it('is wired by default to the public API of @cuotascasa/domain', () => {
    expect(PUBLIC_ENGINE_API.buildSchedule).toBe(buildSchedule);
    expect(PUBLIC_ENGINE_API.buildPaths).toBe(buildPaths);
  });
});
