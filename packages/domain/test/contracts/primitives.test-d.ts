import { describe, expectTypeOf, it } from 'vitest';
import type {
  Currency,
  DayOfMonth,
  DomainError,
  DomainErrorKind,
  ErrorDetails,
  ErrorRule,
  InfeasibleGoalCode,
  InfeasibleGoalError,
  InvalidInputCode,
  InvalidInputError,
  InvalidInputRule,
  LocalDate,
  Money,
  NegativeAmortizationError,
  NegativeAmortizationRule,
  PaymentDay,
  Rate,
  RateType,
  RoundingProfile,
} from '../../src/types/primitives.ts';

declare const aNumber: number;
declare const aDate: Date;
declare const aString: string;

describe('branded primitives (contract)', () => {
  it('Money, Rate and LocalDate cannot be assigned from number, Date or plain string', () => {
    expectTypeOf<number>().not.toExtend<Money>();
    expectTypeOf<number>().not.toExtend<Rate>();
    expectTypeOf<number>().not.toExtend<LocalDate>();
    expectTypeOf<Date>().not.toExtend<Money>();
    expectTypeOf<Date>().not.toExtend<Rate>();
    expectTypeOf<Date>().not.toExtend<LocalDate>();
    expectTypeOf<string>().not.toExtend<Money>();
    expectTypeOf<string>().not.toExtend<Rate>();
    expectTypeOf<string>().not.toExtend<LocalDate>();
  });

  it('the brands are not interchangeable but still read as strings', () => {
    expectTypeOf<Rate>().not.toExtend<Money>();
    expectTypeOf<Money>().not.toExtend<Rate>();
    expectTypeOf<LocalDate>().not.toExtend<Money>();
    expectTypeOf<Money>().toExtend<string>();
    expectTypeOf<Rate>().toExtend<string>();
    expectTypeOf<LocalDate>().toExtend<string>();
  });

  it('rejects direct assignments at compile time', () => {
    // @ts-expect-error a JS number is never Money
    const fromNumber: Money = aNumber;
    // @ts-expect-error a Date is never a LocalDate
    const fromDate: LocalDate = aDate;
    // @ts-expect-error a plain string is never a Rate
    const fromString: Rate = aString;
    expectTypeOf(fromNumber).toEqualTypeOf<Money>();
    expectTypeOf(fromDate).toEqualTypeOf<LocalDate>();
    expectTypeOf(fromString).toEqualTypeOf<Rate>();
  });

  it('pins the closed unions of [ALG.TERMS]', () => {
    expectTypeOf<Currency>().toEqualTypeOf<'GTQ' | 'USD'>();
    expectTypeOf<RoundingProfile>().toEqualTypeOf<'FHA_GT_V1' | 'SIMPLE'>();
    expectTypeOf<RateType>().toEqualTypeOf<'FIXED' | 'VARIABLE'>();
    expectTypeOf<PaymentDay>().toEqualTypeOf<DayOfMonth | 'END_OF_MONTH'>();
    expectTypeOf<31>().toExtend<DayOfMonth>();
    expectTypeOf<32>().not.toExtend<DayOfMonth>();
    expectTypeOf<DomainErrorKind>().toEqualTypeOf<
      'NotImplemented' | 'InvalidInput' | 'NegativeAmortization' | 'CurrencyMismatch' | 'InfeasibleGoal'
    >();
  });
});

describe('typed errors (contract, [ALG.ERRORS])', () => {
  it('every DomainError exposes the rule and k of {type, rule, k}', () => {
    expectTypeOf<DomainError['rule']>().toEqualTypeOf<ErrorRule | null>();
    expectTypeOf<DomainError['k']>().toEqualTypeOf<number | null>();
    expectTypeOf<InvalidInputError['rule']>().toEqualTypeOf<InvalidInputRule>();
    expectTypeOf<NegativeAmortizationError['rule']>().toEqualTypeOf<NegativeAmortizationRule>();
    expectTypeOf<NegativeAmortizationError['k']>().toEqualTypeOf<number>();
    expectTypeOf<InfeasibleGoalError['rule']>().toEqualTypeOf<'ALG.GOAL'>();
    expectTypeOf<ErrorDetails['k']>().toEqualTypeOf<number | undefined>();
  });

  it('pins the constructors that the engine cards call', () => {
    expectTypeOf<ConstructorParameters<typeof InvalidInputError>>().toEqualTypeOf<
      [code: InvalidInputCode, message: string, details?: ErrorDetails | undefined]
    >();
    expectTypeOf<ConstructorParameters<typeof NegativeAmortizationError>>().toEqualTypeOf<
      [rule: NegativeAmortizationRule, k: number, level: Money, financialCharge: Money]
    >();
    expectTypeOf<ConstructorParameters<typeof InfeasibleGoalError>>().toEqualTypeOf<
      [code: InfeasibleGoalCode, message: string, details?: ErrorDetails | undefined]
    >();
  });
});
