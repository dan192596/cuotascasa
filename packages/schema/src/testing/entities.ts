import fc from 'fast-check';
import { SYNCED_SETTINGS_ID, DEVICE_SETTINGS_ID } from '../entities/settings.ts';
import { CURRENCIES } from '../common.ts';
import type { ActualPayment, PaymentBreakdown } from '../entities/actual-payment.ts';
import { ROUNDING_PROFILES, RATE_TYPES, LOAN_STATUSES, type FixedCharge, type Loan } from '../entities/loan.ts';
import {
  COMMISSION_KINDS,
  PREPAYMENT_MODES,
  RATE_CHANGE_POLICIES,
  type ChargeItem,
  type Commission,
  type LoanEvent,
} from '../entities/loan-event.ts';
import { REPORTED_BALANCE_SOURCES, type ReportedBalance } from '../entities/reported-balance.ts';
import type { Scenario, ScenarioEvent } from '../entities/scenario.ts';
import { THEME_PREFERENCES, type DeviceSettings, type Settings, type SyncedSettings } from '../entities/settings.ts';
import {
  installmentArb,
  isoInstantArb,
  localDateArb,
  moneyArb,
  positiveMoneyArb,
  positiveRateArb,
  rateArb,
  recordWithOptionals,
  textArb,
  uuidArb,
} from './primitives.ts';

const stamps = {
  id: uuidArb,
  createdAt: isoInstantArb,
  updatedAt: isoInstantArb,
  updatedByDevice: uuidArb,
  deletedAt: fc.option(isoInstantArb, { nil: null }),
};

const notes = { note: textArb(500) };

const fixedChargeArb: fc.Arbitrary<FixedCharge> = fc.record({
  label: textArb(60),
  amount: moneyArb,
  effectiveFrom: localDateArb,
});

const chargeItemArb: fc.Arbitrary<ChargeItem> = fc.record({ label: textArb(60), amount: moneyArb });

export const loanArb: fc.Arbitrary<Loan> = fc.record({
  ...stamps,
  name: textArb(80),
  bank: fc.string({ maxLength: 80 }),
  principal: positiveMoneyArb,
  termMonths: fc.integer({ min: 1, max: 1200 }),
  disbursementDate: localDateArb,
  firstDueDate: localDateArb,
  paymentDay: fc.oneof(fc.integer({ min: 1, max: 31 }), fc.constant('END_OF_MONTH' as const)),
  currency: fc.constantFrom(...CURRENCIES),
  interestRate: rateArb,
  insuranceRates: fc.array(rateArb, { maxLength: 4 }),
  fixedCharges: fc.array(fixedChargeArb, { maxLength: 4 }),
  roundingProfile: fc.constantFrom(...ROUNDING_PROFILES),
  rateType: fc.constantFrom(...RATE_TYPES),
  templateRef: fc.record({
    id: fc.constantFrom('fha-gt', 'custom', 'simple-1'),
    version: fc.integer({ min: 1, max: 9 }),
  }),
  status: fc.constantFrom(...LOAN_STATUSES),
});

const commissionArb: fc.Arbitrary<Commission> = fc.oneof(
  fc.record({ kind: fc.constant(COMMISSION_KINDS[0]), amount: positiveMoneyArb }),
  fc.record({ kind: fc.constant(COMMISSION_KINDS[1]), rate: positiveRateArb }),
);

type EventPayload<T extends LoanEvent['type']> = Omit<
  Extract<LoanEvent, { type: T }>,
  'id' | 'createdAt' | 'updatedAt' | 'updatedByDevice' | 'deletedAt' | 'loanId' | 'date' | 'note'
>;

/** RateChange payload meeting checkRateChange: at least one new rate; bankInstallment only with BANK_INSTALLMENT. */
const rateChangePayloadArb: fc.Arbitrary<EventPayload<'RateChange'>> = fc
  .tuple(
    fc.constantFrom(...RATE_CHANGE_POLICIES),
    fc.constantFrom('rate', 'insurance', 'both'),
    rateArb,
    fc.array(rateArb, { maxLength: 3 }),
    positiveMoneyArb,
  )
  .map(([policy, kind, interestRate, insuranceRates, bankInstallment]) => ({
    type: 'RateChange' as const,
    policy,
    ...(kind !== 'insurance' ? { interestRate } : {}),
    ...(kind !== 'rate' ? { insuranceRates } : {}),
    ...(policy === 'BANK_INSTALLMENT' ? { bankInstallment } : {}),
  }));

const fixedChargeChangePayloadArb: fc.Arbitrary<EventPayload<'FixedChargeChange'>> = fc.record({
  type: fc.constant('FixedChargeChange' as const),
  fixedCharges: fc.array(chargeItemArb, { maxLength: 4 }),
});

const prepaymentPayloadArb: fc.Arbitrary<EventPayload<'Prepayment'>> = recordWithOptionals(
  {
    type: fc.constant('Prepayment'),
    amount: positiveMoneyArb,
    mode: fc.constantFrom(...PREPAYMENT_MODES),
  },
  { commission: commissionArb },
);

const advancePayloadArb: fc.Arbitrary<EventPayload<'AdvanceInstallments'>> = fc.record({
  type: fc.constant('AdvanceInstallments' as const),
  count: fc.integer({ min: 1, max: 1200 }),
});

const eventPayloadArb = fc.oneof(
  rateChangePayloadArb,
  fixedChargeChangePayloadArb,
  prepaymentPayloadArb,
  advancePayloadArb,
);

export const loanEventArb: fc.Arbitrary<LoanEvent> = fc
  .tuple(
    recordWithOptionals<Record<string, unknown>>({ ...stamps, loanId: uuidArb, date: localDateArb }, notes),
    eventPayloadArb,
  )
  .map(([common, payload]) => ({ ...common, ...payload }) as LoanEvent);

export const reportedBalanceArb: fc.Arbitrary<ReportedBalance> = recordWithOptionals(
  {
    ...stamps,
    loanId: uuidArb,
    date: localDateArb,
    balance: moneyArb,
    source: fc.constantFrom(...REPORTED_BALANCE_SOURCES),
  },
  { installmentNumber: installmentArb, totalInstallment: positiveMoneyArb, reportedRate: rateArb, ...notes },
);

const breakdownArb: fc.Arbitrary<PaymentBreakdown> = fc.record({
  capital: moneyArb,
  interest: moneyArb,
  insurance: moneyArb,
  fixedCharges: moneyArb,
});

export const actualPaymentArb: fc.Arbitrary<ActualPayment> = recordWithOptionals(
  {
    ...stamps,
    loanId: uuidArb,
    paidDate: localDateArb,
    installmentNumber: installmentArb,
    total: positiveMoneyArb,
  },
  { breakdown: breakdownArb, ...notes },
);

const scenarioEventArb: fc.Arbitrary<ScenarioEvent> = fc
  .tuple(
    recordWithOptionals<Record<string, unknown>>(
      { id: uuidArb, date: localDateArb, deletedAt: fc.option(isoInstantArb, { nil: null }) },
      notes,
    ),
    eventPayloadArb,
  )
  .map(([common, payload]) => ({ ...common, ...payload }) as ScenarioEvent);

export const scenarioArb: fc.Arbitrary<Scenario> = fc.record({
  ...stamps,
  loanId: uuidArb,
  name: textArb(60),
  events: fc.uniqueArray(scenarioEventArb, { selector: (event) => event.id, maxLength: 4 }),
});

export const syncedSettingsArb: fc.Arbitrary<SyncedSettings> = fc.record({
  ...stamps,
  id: fc.constant(SYNCED_SETTINGS_ID),
  scope: fc.constant('synced' as const),
  activeScenarioByLoan: fc.dictionary(uuidArb, uuidArb, { maxKeys: 3 }),
});

export const deviceSettingsArb: fc.Arbitrary<DeviceSettings> = fc.record({
  ...stamps,
  id: fc.constant(DEVICE_SETTINGS_ID),
  scope: fc.constant('device' as const),
  theme: fc.constantFrom(...THEME_PREFERENCES),
  driveSyncEnabled: fc.boolean(),
});

export const settingsArb: fc.Arbitrary<Settings> = fc.oneof(syncedSettingsArb, deviceSettingsArb);
