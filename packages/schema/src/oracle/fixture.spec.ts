import { describe, expect, it } from 'vitest';
import { withField, withoutField } from '../test-support/with-field.ts';
import {
  EXPECTED_CSV_HEADER,
  EXPECTED_ROW_COLUMNS,
  FEATURE_TAGS,
  TRAIT_TAGS,
  expectedRowSchema,
  featureTagSchema,
  fixtureIdFor,
  fixtureInputsSchema,
  fixtureSchema,
  manifestSchema,
  traitTagSchema,
} from './fixture.ts';

/*
 * Hand-written synthetic fixture following tools/oracle/FORMAT.md: profile 'full', slot F35 (zeroRate, END_OF_MONTH).
 * r = 0, so [ALG.ZERO] gives level = HALF_UP_2(150000.00 / 60) = 2500.00 and capital = level in every row.
 */
function endOfMonth(year: number, month: number): string {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 31;
  return `${String(year)}-${String(month).padStart(2, '0')}-${String(days)}`;
}

function zeroRateRows(): unknown[] {
  return Array.from({ length: 60 }, (_, index) => {
    const k = index + 1;
    const monthIndex = 1 + index;
    const year = 2025 + Math.floor(monthIndex / 12);
    const month = (monthIndex % 12) + 1;
    const remaining = 150000 - 2500 * index;
    return {
      k,
      dueDate: endOfMonth(year, month),
      opening: `${String(remaining)}.00`,
      level: '2500.00',
      interest: '0.00',
      insurance: '0.00',
      insuranceComponents: [],
      capital: '2500.00',
      fixedCharges: '0.00',
      prepayment: '0.00',
      commission: '0.00',
      total: '2500.00',
      closing: `${String(remaining - 2500)}.00`,
      paid: false,
    };
  });
}

const handWrittenFixture = {
  synthetic: true,
  id: 'full-0035',
  profile: 'full',
  seed: 20261004,
  loanIndex: 35,
  generatorVersion: 1,
  features: ['core'],
  traits: ['roundingProfile:FHA_GT_V1', 'paymentDay:EOM', 'currency:GTQ', 'zeroRate'],
  inputs: {
    terms: {
      principal: '150000.00',
      termMonths: 60,
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
    rows: zeroRateRows(),
    anchors: [],
    payments: [],
    summary: {
      installments: 60,
      endDate: '2030-01-31',
      totalInterest: '0.00',
      totalInsurance: '0.00',
      totalCapital: '150000.00',
      totalFixedCharges: '0.00',
      totalPrepayments: '0.00',
      totalCommissions: '0.00',
      totalPaid: '150000.00',
    },
  },
};

describe('fixtureSchema', () => {
  it('parses a hand-written synthetic fixture that follows FORMAT.md', () => {
    const parsed = fixtureSchema.parse(handWrittenFixture);
    expect(parsed.expected.rows).toHaveLength(60);
    expect(parsed.expected.rows[59]?.closing).toBe('0.00');
    expect(parsed.expected.rows[59]?.dueDate).toBe('2030-01-31');
  });

  it('rejects a fixture without synthetic: true', () => {
    expect(fixtureSchema.safeParse(withoutField(handWrittenFixture, ['synthetic'])).success).toBe(false);
    expect(fixtureSchema.safeParse(withField(handWrittenFixture, ['synthetic'], false)).success).toBe(false);
  });

  it('accepts exactly the FORMAT.md trait tags', () => {
    expect(traitTagSchema.options).toEqual([
      'roundingProfile:FHA_GT_V1',
      'roundingProfile:SIMPLE',
      'paymentDay:numeric',
      'paymentDay:EOM',
      'currency:GTQ',
      'currency:USD',
      'lastRow',
      'latePayment',
      'explicitKAnchor',
      'sameKAnchors',
      'zeroRate',
      'zeroInsurance',
    ]);
    const otherGroupMembers: readonly string[] = ['roundingProfile:SIMPLE', 'paymentDay:numeric', 'currency:USD'];
    const everyCompatibleTag = TRAIT_TAGS.filter((tag) => !otherGroupMembers.includes(tag));
    expect(fixtureSchema.safeParse(withField(handWrittenFixture, ['traits'], everyCompatibleTag)).success).toBe(true);
    expect(fixtureSchema.safeParse(withField(handWrittenFixture, ['traits'], [...TRAIT_TAGS])).success).toBe(false);
    expect(
      fixtureSchema.safeParse(withField(handWrittenFixture, ['traits'], ['paymentDay:EOM', 'currency:GTQ'])).success,
    ).toBe(false);
    expect(
      fixtureSchema.safeParse(
        withField(handWrittenFixture, ['traits'], ['roundingProfile:SIMPLE', 'paymentDay:EOM', 'currency:GTQ']),
      ).success,
    ).toBe(false);
    // Groups 1 and 2 are right here and only the currency group (TRAIT_GROUPS[2]) is wrong: the fixture is GTQ.
    const wrongCurrency = ['roundingProfile:FHA_GT_V1', 'paymentDay:EOM', 'currency:USD'];
    const noCurrency = ['roundingProfile:FHA_GT_V1', 'paymentDay:EOM'];
    const bothCurrencies = ['roundingProfile:FHA_GT_V1', 'paymentDay:EOM', 'currency:GTQ', 'currency:USD'];
    expect(fixtureSchema.safeParse(withField(handWrittenFixture, ['traits'], wrongCurrency)).success).toBe(false);
    expect(fixtureSchema.safeParse(withField(handWrittenFixture, ['traits'], noCurrency)).success).toBe(false);
    expect(fixtureSchema.safeParse(withField(handWrittenFixture, ['traits'], bothCurrencies)).success).toBe(false);
    const numeric = withField(handWrittenFixture, ['inputs', 'terms', 'paymentDay'], 28);
    expect(fixtureSchema.safeParse(numeric).success).toBe(false);
    const numericTraits = ['roundingProfile:FHA_GT_V1', 'paymentDay:numeric', 'currency:GTQ', 'zeroRate'];
    expect(fixtureSchema.safeParse(withField(numeric, ['traits'], numericTraits)).success).toBe(true);
    for (const unknown of ['leapYear', 'roundingProfile', 'paymentDay:31', 'currency:EUR']) {
      const traits = [...handWrittenFixture.traits, unknown];
      expect(fixtureSchema.safeParse(withField(handWrittenFixture, ['traits'], traits)).success).toBe(false);
    }
  });

  it('accepts exactly the FORMAT.md feature tags and always requires core', () => {
    expect(featureTagSchema.options).toEqual([...FEATURE_TAGS]);
    expect(FEATURE_TAGS).toHaveLength(13);
    expect(fixtureSchema.safeParse(withField(handWrittenFixture, ['features'], [...FEATURE_TAGS])).success).toBe(true);
    expect(fixtureSchema.safeParse(withField(handWrittenFixture, ['features'], ['anchor'])).success).toBe(false);
    expect(
      fixtureSchema.safeParse(withField(handWrittenFixture, ['features'], ['core', 'rateChange:GUESS'])).success,
    ).toBe(false);
    expect(fixtureSchema.safeParse(withField(handWrittenFixture, ['features'], ['core', 'core'])).success).toBe(false);
  });

  it('ties the id to profile and loanIndex', () => {
    expect(fixtureIdFor('core', 7)).toBe('core-0007');
    expect(fixtureSchema.safeParse(withField(handWrittenFixture, ['id'], 'full-0036')).success).toBe(false);
    expect(fixtureSchema.safeParse(withField(handWrittenFixture, ['profile'], 'core')).success).toBe(false);
  });

  it('requires rows k = 1..n and summary.installments = n', () => {
    expect(fixtureSchema.safeParse(withField(handWrittenFixture, ['expected', 'rows', 1, 'k'], 3)).success).toBe(false);
    expect(
      fixtureSchema.safeParse(withField(handWrittenFixture, ['expected', 'summary', 'installments'], 59)).success,
    ).toBe(false);
  });

  it('rejects number-typed money in rows', () => {
    expect(
      fixtureSchema.safeParse(withField(handWrittenFixture, ['expected', 'rows', 0, 'capital'], 2500)).success,
    ).toBe(false);
  });
});

describe('fixture inputs and the private a-terms.json shape', () => {
  it('parses an inline synthetic a-terms object with the fixture inputs schema', () => {
    const aTerms = {
      terms: {
        principal: '500000.00',
        termMonths: 240,
        disbursementDate: '2025-01-01',
        firstDueDate: '2025-02-28',
        paymentDay: 'END_OF_MONTH',
        currency: 'GTQ',
        interestRate: '0.07',
        insuranceRates: ['0.01', '0.0026'],
        fixedCharges: [
          { label: 'IUSI', amount: '350.00', effectiveFrom: '2025-02-28' },
          { label: 'Seguro de daños', amount: '45.00', effectiveFrom: '2025-02-28' },
        ],
        roundingProfile: 'FHA_GT_V1',
      },
      events: [],
    };
    expect(fixtureInputsSchema.parse(aTerms)).toEqual(aTerms);
  });

  it('parses every fixture event type with entity field names', () => {
    const inputs = {
      terms: handWrittenFixture.inputs.terms,
      events: [
        {
          id: 'ev-01',
          type: 'RateChange',
          date: '2026-01-15',
          policy: 'BANK_INSTALLMENT',
          interestRate: '0.075',
          bankInstallment: '4300.00',
        },
        {
          id: 'ev-02',
          type: 'FixedChargeChange',
          date: '2026-02-15',
          fixedCharges: [{ label: 'IUSI', amount: '360.00' }],
        },
        {
          id: 'ev-03',
          type: 'Prepayment',
          date: '2026-01-15',
          amount: '20000.00',
          mode: 'REDUCE_TERM',
          commission: { kind: 'PERCENT', rate: '0.02' },
        },
        { id: 'ev-04', type: 'AdvanceInstallments', date: '2026-01-15', count: 6 },
        { id: 'ev-05', type: 'ReportedBalance', date: '2025-03-05', installmentNumber: 3, balance: '499178.20' },
        { id: 'ev-06', type: 'ActualPayment', paidDate: '2025-03-10', installmentNumber: 1, total: '4658.47' },
      ],
    };
    expect(fixtureInputsSchema.safeParse(inputs).success).toBe(true);
    expect(fixtureInputsSchema.safeParse(withField(inputs, ['events', 5, 'date'], '2025-03-10')).success).toBe(false);
    expect(fixtureInputsSchema.safeParse(withField(inputs, ['events', 1, 'id'], 'ev-01')).success).toBe(false);
  });

  it('fixes the a-expected.csv header to the expected row keys, in order', () => {
    expect(Object.keys(expectedRowSchema.shape)).toEqual([...EXPECTED_ROW_COLUMNS]);
    expect(EXPECTED_CSV_HEADER).toBe(
      'k,dueDate,opening,level,interest,insurance,insuranceComponents,capital,fixedCharges,prepayment,commission,total,closing,paid',
    );
  });
});

describe('manifestSchema', () => {
  it('parses profiles with seed, count and generatorVersion', () => {
    const manifest = { synthetic: true, profiles: { core: { seed: 20261004, count: 15, generatorVersion: 1 } } };
    expect(manifestSchema.parse(manifest)).toEqual(manifest);
  });

  it('rejects an unknown profile and a manifest without synthetic: true', () => {
    expect(
      manifestSchema.safeParse({ synthetic: true, profiles: { extra: { seed: 1, count: 1, generatorVersion: 1 } } })
        .success,
    ).toBe(false);
    expect(manifestSchema.safeParse({ profiles: {} }).success).toBe(false);
  });
});
