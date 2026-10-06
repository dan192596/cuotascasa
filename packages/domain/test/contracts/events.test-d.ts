import { describe, expectTypeOf, it } from 'vitest';
import type {
  ActualPaymentBreakdown,
  ActualPaymentEvent,
  AdvanceInstallmentsEvent,
  Commission,
  DomainEvent,
  DomainEventOf,
  DomainEventType,
  EventOrderKey,
  EventPhase,
  FixedChargeChangeEvent,
  HypotheticalEvent,
  PrepaymentEvent,
  RateChangeEvent,
  RateChangePolicy,
  ReportedBalanceEvent,
} from '../../src/types/events.ts';
import type { FixedChargeLine } from '../../src/types/loan.ts';
import type { LocalDate, Money, Rate } from '../../src/types/primitives.ts';

describe('domain events (contract)', () => {
  it('DomainEvent is the union of the six event types of [ALG.EVENTS]', () => {
    expectTypeOf<DomainEventType>().toEqualTypeOf<
      'ReportedBalance' | 'RateChange' | 'FixedChargeChange' | 'Prepayment' | 'AdvanceInstallments' | 'ActualPayment'
    >();
    expectTypeOf<DomainEvent['type']>().toEqualTypeOf<DomainEventType>();
    expectTypeOf<DomainEventOf<'Prepayment'>>().toEqualTypeOf<PrepaymentEvent>();
    expectTypeOf<DomainEvent['id']>().toEqualTypeOf<string>();
    expectTypeOf<DomainEvent['date']>().toEqualTypeOf<LocalDate>();
  });

  it('pins the RateChange policies and the bank installment of BANK_INSTALLMENT ([ALG.RATE])', () => {
    expectTypeOf<RateChangePolicy>().toEqualTypeOf<
      'RECALC_INSTALLMENT_KEEP_TERM' | 'KEEP_INSTALLMENT_ADJUST_TERM' | 'BANK_INSTALLMENT'
    >();
    expectTypeOf<Extract<RateChangeEvent, { policy: 'BANK_INSTALLMENT' }>['bankInstallment']>().toEqualTypeOf<Money>();
    expectTypeOf<RateChangeEvent['interestRate']>().toEqualTypeOf<Rate | undefined>();
  });

  it('pins the other event payloads', () => {
    expectTypeOf<FixedChargeChangeEvent['fixedCharges']>().toEqualTypeOf<readonly FixedChargeLine[]>();
    expectTypeOf<PrepaymentEvent['mode']>().toEqualTypeOf<'REDUCE_TERM' | 'REDUCE_INSTALLMENT'>();
    expectTypeOf<Commission>().toEqualTypeOf<
      { readonly kind: 'FLAT'; readonly amount: Money } | { readonly kind: 'PERCENT'; readonly rate: Rate }
    >();
    expectTypeOf<AdvanceInstallmentsEvent['count']>().toEqualTypeOf<number>();
    expectTypeOf<ReportedBalanceEvent['balance']>().toEqualTypeOf<Money>();
    expectTypeOf<ReportedBalanceEvent['installmentNumber']>().toEqualTypeOf<number | undefined>();
    expectTypeOf<ActualPaymentEvent['installmentNumber']>().toEqualTypeOf<number>();
  });

  it('an ActualPayment breakdown carries the four components or is omitted, never a partial one ([ALG.ACTUAL])', () => {
    expectTypeOf<ActualPaymentBreakdown>().toEqualTypeOf<{
      readonly capital: Money;
      readonly interest: Money;
      readonly insurance: Money;
      readonly fixedCharges: Money;
    }>();
    expectTypeOf<{
      readonly capital: Money;
      readonly interest: Money;
      readonly fixedCharges: Money;
    }>().not.toExtend<ActualPaymentBreakdown>();
    expectTypeOf<ActualPaymentEvent['breakdown']>().toEqualTypeOf<ActualPaymentBreakdown | undefined>();
  });

  it('hypothetical events never include anchors or actual payments ([ALG.PATHS])', () => {
    expectTypeOf<HypotheticalEvent['type']>().toEqualTypeOf<
      'RateChange' | 'FixedChargeChange' | 'Prepayment' | 'AdvanceInstallments'
    >();
  });

  it('the order key is (k, phase, date, typeRank, id) ([ALG.EVENTS.ORDER])', () => {
    expectTypeOf<EventOrderKey>().toEqualTypeOf<{
      readonly k: number;
      readonly phase: EventPhase;
      readonly date: LocalDate;
      readonly typeRank: number;
      readonly id: string;
    }>();
    expectTypeOf<EventPhase>().toEqualTypeOf<0 | 1 | 3 | 4>();
  });
});
