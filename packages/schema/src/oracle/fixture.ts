import { z } from 'zod';
import {
  installmentNumberSchema,
  localDateSchema,
  moneySchema,
  positiveMoneySchema,
  signedMoneySchema,
} from '../common.ts';
import { paymentBreakdownSchema } from '../entities/actual-payment.ts';
import { loanTermsShape } from '../entities/loan.ts';
import {
  advanceInstallmentsPayloadShape,
  checkRateChange,
  fixedChargeChangePayloadShape,
  prepaymentPayloadShape,
  rateChangePayloadShape,
} from '../entities/loan-event.ts';

/**
 * Executable mirror of tools/oracle/FORMAT.md. Any change here is an Opus contract change that also
 * edits FORMAT.md; the conformance harness (W0-06) parses every committed fixture with fixtureSchema.
 */
export const FIXTURE_PROFILES = ['core', 'full'] as const;
export const fixtureProfileSchema = z.enum(FIXTURE_PROFILES);
export type FixtureProfile = z.infer<typeof fixtureProfileSchema>;

/** Feature tags gate enforcement: a fixture is enforced only when all of them are in enforced-features.json. */
export const FEATURE_TAGS = [
  'core',
  'rateChange:RECALC_INSTALLMENT_KEEP_TERM',
  'rateChange:KEEP_INSTALLMENT_ADJUST_TERM',
  'rateChange:BANK_INSTALLMENT',
  'fixedChargeChange',
  'prepayment:REDUCE_TERM',
  'prepayment:REDUCE_INSTALLMENT',
  'commission:FLAT',
  'commission:PERCENT',
  'payoff',
  'advance',
  'anchor',
  'actualPayment',
] as const;
export const featureTagSchema = z.enum(FEATURE_TAGS);
export type FeatureTag = z.infer<typeof featureTagSchema>;

/** Trait tags only measure coverage (W2-06 matrix); they never gate enforcement. */
export const TRAIT_TAGS = [
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
] as const;
export const traitTagSchema = z.enum(TRAIT_TAGS);
export type TraitTag = z.infer<typeof traitTagSchema>;

/** FORMAT.md §4.2: every fixture carries exactly one tag of each group, the one its inputs.terms imply. */
export const TRAIT_GROUPS = [
  ['roundingProfile:FHA_GT_V1', 'roundingProfile:SIMPLE'],
  ['paymentDay:numeric', 'paymentDay:EOM'],
  ['currency:GTQ', 'currency:USD'],
] as const satisfies readonly (readonly TraitTag[])[];

/** Fixture id '<profile>-<NNNN>' (loanIndex zero-padded to 4 digits); the file is DIR/<fixture-id>.json. */
export const FIXTURE_ID_PATTERN = /^(core|full)-\d{4}$/;

export function fixtureIdFor(profile: FixtureProfile, loanIndex: number): string {
  return `${profile}-${String(loanIndex).padStart(4, '0')}`;
}

const fixtureEventIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);

export const fixtureTermsSchema = z.strictObject(loanTermsShape);
export type FixtureTerms = z.infer<typeof fixtureTermsSchema>;

/** Events of a fixture: the four LoanEvent payloads plus ReportedBalance and ActualPayment, entity field names. */
export const fixtureEventSchema = z.discriminatedUnion('type', [
  z
    .strictObject({ id: fixtureEventIdSchema, date: localDateSchema, ...rateChangePayloadShape })
    .superRefine(checkRateChange),
  z.strictObject({ id: fixtureEventIdSchema, date: localDateSchema, ...fixedChargeChangePayloadShape }),
  z.strictObject({ id: fixtureEventIdSchema, date: localDateSchema, ...prepaymentPayloadShape }),
  z.strictObject({ id: fixtureEventIdSchema, date: localDateSchema, ...advanceInstallmentsPayloadShape }),
  z.strictObject({
    id: fixtureEventIdSchema,
    type: z.literal('ReportedBalance'),
    date: localDateSchema,
    installmentNumber: installmentNumberSchema.optional(),
    balance: moneySchema,
  }),
  z.strictObject({
    id: fixtureEventIdSchema,
    type: z.literal('ActualPayment'),
    paidDate: localDateSchema,
    installmentNumber: installmentNumberSchema,
    total: positiveMoneySchema,
    breakdown: paymentBreakdownSchema.optional(),
  }),
]);
export type FixtureEvent = z.infer<typeof fixtureEventSchema>;

/** `inputs` of a fixture; the private file a-terms.json has exactly this shape (FORMAT.md §8). */
export const fixtureInputsSchema = z
  .strictObject({
    terms: fixtureTermsSchema,
    events: z.array(fixtureEventSchema).max(60),
  })
  .superRefine((inputs, ctx) => {
    const seen = new Set<string>();
    inputs.events.forEach((event, index) => {
      if (seen.has(event.id)) {
        ctx.addIssue({ code: 'custom', message: 'Duplicate event id', path: ['events', index, 'id'] });
      }
      seen.add(event.id);
    });
  });
export type FixtureInputs = z.infer<typeof fixtureInputsSchema>;

/** Expected row; key order is the CSV column order of a-expected.csv (EXPECTED_ROW_COLUMNS). */
export const expectedRowSchema = z.strictObject({
  k: installmentNumberSchema,
  dueDate: localDateSchema,
  opening: moneySchema,
  level: moneySchema,
  interest: moneySchema,
  insurance: moneySchema,
  insuranceComponents: z.array(moneySchema).max(10),
  capital: moneySchema,
  fixedCharges: moneySchema,
  prepayment: moneySchema,
  commission: moneySchema,
  total: moneySchema,
  closing: moneySchema,
  paid: z.boolean(),
});
export type ExpectedRow = z.infer<typeof expectedRowSchema>;

export const EXPECTED_ROW_COLUMNS = [
  'k',
  'dueDate',
  'opening',
  'level',
  'interest',
  'insurance',
  'insuranceComponents',
  'capital',
  'fixedCharges',
  'prepayment',
  'commission',
  'total',
  'closing',
  'paid',
] as const;

/** Exact header line of a-expected.csv (FORMAT.md §8). */
export const EXPECTED_CSV_HEADER = EXPECTED_ROW_COLUMNS.join(',');

export const expectedAnchorSchema = z.strictObject({
  eventId: fixtureEventIdSchema,
  k: installmentNumberSchema,
  realDelta: signedMoneySchema,
});
export type ExpectedAnchor = z.infer<typeof expectedAnchorSchema>;

export const expectedPaymentSchema = z.strictObject({
  eventId: fixtureEventIdSchema,
  k: installmentNumberSchema,
  componentDeltas: z
    .strictObject({
      capital: signedMoneySchema,
      interest: signedMoneySchema,
      insurance: signedMoneySchema,
      fixedCharges: signedMoneySchema,
    })
    .nullable(),
});
export type ExpectedPayment = z.infer<typeof expectedPaymentSchema>;

export const expectedSummarySchema = z.strictObject({
  installments: installmentNumberSchema,
  endDate: localDateSchema,
  totalInterest: moneySchema,
  totalInsurance: moneySchema,
  totalCapital: moneySchema,
  totalFixedCharges: moneySchema,
  totalPrepayments: moneySchema,
  totalCommissions: moneySchema,
  totalPaid: moneySchema,
});
export type ExpectedSummary = z.infer<typeof expectedSummarySchema>;

function checkUnique(values: readonly string[], path: string, ctx: z.RefinementCtx): void {
  if (new Set(values).size !== values.length) {
    ctx.addIssue({ code: 'custom', message: `Duplicate tag in ${path}`, path: [path] });
  }
}

export const fixtureSchema = z
  .strictObject({
    synthetic: z.literal(true),
    id: z.string().regex(FIXTURE_ID_PATTERN),
    profile: fixtureProfileSchema,
    seed: z.int().min(0).max(4294967295),
    loanIndex: z.int().min(1).max(9999),
    generatorVersion: z.int().min(1),
    features: z.array(featureTagSchema).min(1),
    traits: z.array(traitTagSchema),
    inputs: fixtureInputsSchema,
    expected: z.strictObject({
      rows: z.array(expectedRowSchema).min(1),
      anchors: z.array(expectedAnchorSchema),
      payments: z.array(expectedPaymentSchema),
      summary: expectedSummarySchema,
    }),
  })
  .superRefine((fixture, ctx) => {
    if (fixture.id !== fixtureIdFor(fixture.profile, fixture.loanIndex)) {
      ctx.addIssue({ code: 'custom', message: 'id must be <profile>-<loanIndex padded to 4>', path: ['id'] });
    }
    if (!fixture.features.includes('core')) {
      ctx.addIssue({ code: 'custom', message: "Every fixture carries the feature tag 'core'", path: ['features'] });
    }
    checkUnique(fixture.features, 'features', ctx);
    checkUnique(fixture.traits, 'traits', ctx);
    const terms = fixture.inputs.terms;
    const implied: readonly TraitTag[] = [
      `roundingProfile:${terms.roundingProfile}`,
      terms.paymentDay === 'END_OF_MONTH' ? 'paymentDay:EOM' : 'paymentDay:numeric',
      `currency:${terms.currency}`,
    ];
    TRAIT_GROUPS.forEach((group, index) => {
      const present = fixture.traits.filter((tag) => (group as readonly TraitTag[]).includes(tag));
      if (present.length !== 1 || present[0] !== implied[index]) {
        ctx.addIssue({
          code: 'custom',
          message: `traits carry exactly ${String(implied[index])} (FORMAT.md §4.2)`,
          path: ['traits'],
        });
      }
    });
    fixture.expected.rows.forEach((row, index) => {
      if (row.k !== index + 1) {
        ctx.addIssue({
          code: 'custom',
          message: 'Rows are numbered k = 1..n without gaps',
          path: ['expected', 'rows', index, 'k'],
        });
      }
    });
    if (fixture.expected.summary.installments !== fixture.expected.rows.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'summary.installments equals the number of rows',
        path: ['expected', 'summary', 'installments'],
      });
    }
  });
export type Fixture = z.infer<typeof fixtureSchema>;

/** DIR/manifest.json: one entry per committed profile (FORMAT.md §4). */
export const manifestSchema = z.strictObject({
  synthetic: z.literal(true),
  profiles: z.partialRecord(
    fixtureProfileSchema,
    z.strictObject({
      seed: z.int().min(0).max(4294967295),
      count: z.int().min(1).max(9999),
      generatorVersion: z.int().min(1),
    }),
  ),
});
export type Manifest = z.infer<typeof manifestSchema>;
