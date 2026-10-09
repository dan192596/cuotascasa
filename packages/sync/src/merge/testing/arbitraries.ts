import {
  type ActualPayment,
  type BackupData,
  type DeviceSettings,
  type Loan,
  type ReportedBalance,
  type SyncedSettings,
} from '@cuotascasa/schema';
import fc from 'fast-check';

/*
 * Test-only arbitraries (synthetic data). Stamping is monotonic per device: a version is a function of
 * (id, updatedAt, device), so one device never writes two different versions of a record with the same stamp.
 */

export const DEVICES = [
  'd0000000-0000-4000-8000-00000000000a',
  'd0000000-0000-4000-8000-00000000000b',
  'd0000000-0000-4000-8000-00000000000c',
] as const;
export const SYNCED_ID = '00000000-0000-4000-8000-000000000001' as const;
export const DEVICE_SETTINGS_ID = '00000000-0000-4000-8000-000000000002' as const;
const LOAN_REF = 'a0000000-0000-4000-8000-000000000001';

function instant(ms: number): string {
  return new Date(Date.UTC(2026, 9, 1) + ms).toISOString();
}

const stampArb = fc.record({
  updatedAt: fc.integer({ min: 0, max: 4 }).map((n) => instant(n * 1000)),
  updatedByDevice: fc.constantFrom(...DEVICES),
});

function tombstoned(updatedAt: string, device: string, id: string): boolean {
  return (updatedAt.length + device.charCodeAt(device.length - 1) + id.charCodeAt(id.length - 1)) % 3 === 0;
}

function stamps(id: string, s: { updatedAt: string; updatedByDevice: string }, monotonic: boolean, flip: boolean) {
  const dead = monotonic ? tombstoned(s.updatedAt, s.updatedByDevice, id) : flip;
  return {
    id,
    createdAt: instant(0),
    updatedAt: s.updatedAt,
    updatedByDevice: s.updatedByDevice,
    deletedAt: dead ? s.updatedAt : null,
  };
}

const idPool = (prefix: string) =>
  fc.integer({ min: 1, max: 4 }).map((n) => `${prefix}0000000-0000-4000-8000-00000000000${n}`);

function loanArb(monotonic: boolean): fc.Arbitrary<Loan> {
  return fc.tuple(idPool('a'), stampArb, fc.boolean()).map(([id, s, flip]) => ({
    ...stamps(id, s, monotonic, flip),
    name: monotonic ? `Casa ${s.updatedAt}` : `Casa ${flip}`,
    bank: 'Banco Ficticio',
    currency: 'GTQ',
    principal: '500000.00',
    termMonths: 240,
    disbursementDate: '2025-01-31',
    firstDueDate: '2025-02-28',
    paymentDay: 'END_OF_MONTH',
    interestRate: '0.07',
    rateType: 'VARIABLE',
    insuranceRates: ['0.01', '0.0026'],
    fixedCharges: [],
    roundingProfile: 'FHA_GT_V1',
    templateRef: { id: 'fha-gt', version: 1 },
    status: 'active',
  }));
}

function balanceArb(monotonic: boolean): fc.Arbitrary<ReportedBalance> {
  return fc.tuple(idPool('c'), stampArb, fc.boolean()).map(([id, s, flip]) => ({
    ...stamps(id, s, monotonic, flip),
    loanId: LOAN_REF,
    date: '2025-03-05',
    installmentNumber: 2,
    balance: monotonic ? '499178.20' : flip ? '1.00' : '2.00',
    source: 'BANK_EMAIL',
  }));
}

function paymentArb(monotonic: boolean): fc.Arbitrary<ActualPayment> {
  return fc.tuple(idPool('e'), stampArb, fc.boolean()).map(([id, s, flip]) => ({
    ...stamps(id, s, monotonic, flip),
    loanId: LOAN_REF,
    paidDate: '2025-02-27',
    installmentNumber: 1,
    total: monotonic ? '4658.47' : flip ? '1.00' : '2.00',
    breakdown: { capital: '821.80', interest: '2916.67', insurance: '525.00', fixedCharges: '395.00' },
  }));
}

function scenarioMap(empty: boolean): Record<string, string> {
  return empty ? {} : { [LOAN_REF]: 'f0000000-0000-4000-8000-000000000001' };
}

function syncedSettingsArb(monotonic: boolean): fc.Arbitrary<SyncedSettings> {
  return fc.tuple(stampArb, fc.boolean()).map(([s, flip]) => ({
    ...stamps(SYNCED_ID, s, monotonic, flip),
    id: SYNCED_ID,
    scope: 'synced',
    activeScenarioByLoan: scenarioMap(monotonic || flip),
  }));
}

function deviceSettingsArb(): fc.Arbitrary<DeviceSettings> {
  return fc.tuple(stampArb, fc.constantFrom('system', 'light', 'dark'), fc.boolean()).map(([s, theme, drive]) => ({
    ...stamps(DEVICE_SETTINGS_ID, s, true, false),
    id: DEVICE_SETTINGS_ID,
    scope: 'device',
    theme,
    driveSyncEnabled: drive,
  }));
}

function unique<T extends { readonly id: string }>(arb: fc.Arbitrary<T>): fc.Arbitrary<T[]> {
  return fc.uniqueArray(arb, { selector: (r) => r.id, maxLength: 4 });
}

export function datasetArb(options: { monotonic?: boolean } = {}): fc.Arbitrary<BackupData> {
  const monotonic = options.monotonic ?? true;
  return fc.record({
    loans: unique(loanArb(monotonic)),
    events: fc.constant([]),
    reportedBalances: unique(balanceArb(monotonic)),
    payments: unique(paymentArb(monotonic)),
    scenarios: fc.constant([]),
    settings: fc.tuple(fc.option(syncedSettingsArb(monotonic)), fc.option(deviceSettingsArb())).map(([s, d]) => {
      const out: (SyncedSettings | DeviceSettings)[] = [];
      if (s !== null) out.push(s);
      if (d !== null) out.push(d);
      return out;
    }),
  });
}

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) {
      deepFreeze(item);
    }
  }
  return value;
}
