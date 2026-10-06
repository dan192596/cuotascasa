import { describe, expectTypeOf, it } from 'vitest';
import type {
  FixedCharge,
  FixedChargeLine,
  InsuranceKind,
  LoanTerms,
  Template,
  TemplateId,
  TemplateInstance,
  TemplateInsuranceRate,
  TemplateRef,
  TemplateValues,
} from '../../src/types/loan.ts';
import type {
  Currency,
  LocalDate,
  Money,
  PaymentDay,
  Rate,
  RateType,
  RoundingProfile,
} from '../../src/types/primitives.ts';

describe('loan terms and templates (contract)', () => {
  it('LoanTerms carries exactly the fields of [ALG.TERMS]', () => {
    expectTypeOf<keyof LoanTerms>().toEqualTypeOf<
      | 'principal'
      | 'termMonths'
      | 'disbursementDate'
      | 'firstDueDate'
      | 'paymentDay'
      | 'currency'
      | 'interestRate'
      | 'insuranceRates'
      | 'fixedCharges'
      | 'roundingProfile'
      | 'rateType'
    >();
    expectTypeOf<LoanTerms['principal']>().toEqualTypeOf<Money>();
    expectTypeOf<LoanTerms['termMonths']>().toEqualTypeOf<number>();
    expectTypeOf<LoanTerms['disbursementDate']>().toEqualTypeOf<LocalDate>();
    expectTypeOf<LoanTerms['firstDueDate']>().toEqualTypeOf<LocalDate>();
    expectTypeOf<LoanTerms['paymentDay']>().toEqualTypeOf<PaymentDay>();
    expectTypeOf<LoanTerms['currency']>().toEqualTypeOf<Currency>();
    expectTypeOf<LoanTerms['interestRate']>().toEqualTypeOf<Rate>();
    expectTypeOf<LoanTerms['insuranceRates']>().toEqualTypeOf<readonly Rate[]>();
    expectTypeOf<LoanTerms['fixedCharges']>().toEqualTypeOf<readonly FixedCharge[]>();
    expectTypeOf<LoanTerms['roundingProfile']>().toEqualTypeOf<RoundingProfile>();
    expectTypeOf<LoanTerms['rateType']>().toEqualTypeOf<RateType>();
  });

  it('a fixed charge has a label, an amount and effectiveFrom ([ALG.FIXED])', () => {
    expectTypeOf<FixedChargeLine>().toEqualTypeOf<{ readonly label: string; readonly amount: Money }>();
    expectTypeOf<FixedCharge['effectiveFrom']>().toEqualTypeOf<LocalDate>();
    expectTypeOf<FixedCharge>().toExtend<FixedChargeLine>();
  });

  it('Template is {id, version, name, values} and TemplateRef is {id, version} ([ALG.TEMPLATES])', () => {
    expectTypeOf<TemplateId>().toEqualTypeOf<'fha-gt' | 'simple'>();
    expectTypeOf<keyof Template>().toEqualTypeOf<'id' | 'version' | 'name' | 'values'>();
    expectTypeOf<TemplateRef>().toEqualTypeOf<{ readonly id: TemplateId; readonly version: number }>();
    expectTypeOf<keyof TemplateValues>().toEqualTypeOf<
      'insuranceRates' | 'roundingProfile' | 'paymentDay' | 'rateType' | 'fixedCharges'
    >();
    expectTypeOf<TemplateValues['paymentDay']>().toEqualTypeOf<PaymentDay | null>();
    expectTypeOf<TemplateValues['fixedCharges']>().toEqualTypeOf<readonly FixedChargeLine[]>();
    expectTypeOf<TemplateInsuranceRate>().toEqualTypeOf<{ readonly kind: InsuranceKind; readonly rate: Rate }>();
    expectTypeOf<InsuranceKind>().toEqualTypeOf<'mortgageInsurance' | 'lifeInsurance' | 'other'>();
    expectTypeOf<TemplateInstance>().toEqualTypeOf<{
      templateRef: TemplateRef;
      insuranceRates: TemplateInsuranceRate[];
      roundingProfile: RoundingProfile;
      paymentDay: PaymentDay | null;
      rateType: RateType | null;
      fixedCharges: FixedChargeLine[];
    }>();
  });
});
