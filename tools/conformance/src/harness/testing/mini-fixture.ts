import { fixtureSchema, type FeatureTag, type Fixture } from '@cuotascasa/schema';

/** One expected row of the synthetic mini-loan: 300.00 at a zero rate ([ALG.ZERO]), three installments of 100.00. */
function miniRow(k: number, dueDate: string): Fixture['expected']['rows'][number] {
  const opening = 300 - 100 * (k - 1);
  return {
    k,
    dueDate,
    opening: `${String(opening)}.00`,
    level: '100.00',
    interest: '0.00',
    insurance: '0.00',
    insuranceComponents: [],
    capital: '100.00',
    fixedCharges: '0.00',
    prepayment: '0.00',
    commission: '0.00',
    total: '100.00',
    closing: `${String(opening - 100)}.00`,
    paid: false,
  };
}

/** Synthetic mini-fixture for the harness self-tests; it validates against fixtureSchema. */
export function miniFixture(options: { loanIndex?: number; features?: FeatureTag[] } = {}): Fixture {
  const loanIndex = options.loanIndex ?? 1;
  return fixtureSchema.parse({
    synthetic: true,
    id: `core-${String(loanIndex).padStart(4, '0')}`,
    profile: 'core',
    seed: 20261004,
    loanIndex,
    generatorVersion: 1,
    features: options.features ?? ['core'],
    traits: ['roundingProfile:FHA_GT_V1', 'paymentDay:EOM', 'currency:GTQ', 'zeroRate'],
    inputs: {
      terms: {
        principal: '300.00',
        termMonths: 3,
        disbursementDate: '2025-01-01',
        firstDueDate: '2025-02-28',
        paymentDay: 'END_OF_MONTH',
        currency: 'GTQ',
        interestRate: '0.0000',
        insuranceRates: [],
        fixedCharges: [],
        roundingProfile: 'FHA_GT_V1',
      },
      events: [],
    },
    expected: {
      rows: [miniRow(1, '2025-02-28'), miniRow(2, '2025-03-31'), miniRow(3, '2025-04-30')],
      anchors: [],
      payments: [],
      summary: {
        installments: 3,
        endDate: '2025-04-30',
        totalInterest: '0.00',
        totalInsurance: '0.00',
        totalCapital: '300.00',
        totalFixedCharges: '0.00',
        totalPrepayments: '0.00',
        totalCommissions: '0.00',
        totalPaid: '300.00',
      },
    },
  });
}
