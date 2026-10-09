import { TestBed } from '@angular/core/testing';
import {
  buildPaths,
  compareSchedules,
  type DomainEvent,
  InvalidInputError,
  NegativeAmortizationError,
  validateAgainstReportedBalance,
  yearlySubtotals,
} from '@cuotascasa/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { toActualPaymentEvent, toLoanTerms, toRealLoanEvent, toReportedBalanceEvent } from './map-entities.ts';
import {
  makeBalance,
  makeLoan,
  makeLoanDraft,
  makePayment,
  makePrepayment,
  makeRateChange,
  makeScenario,
  makeScenarioPrepayment,
  makeSecondLoan,
  uuid,
} from './testing/fixtures.ts';
import { createWorld, type World } from './testing/world.ts';

const LOAN = uuid(1);

beforeEach(() => TestBed.resetTestingModule());

function realEventsOf(world: {
  balances?: readonly Parameters<typeof toReportedBalanceEvent>[0][];
  payments?: readonly Parameters<typeof toActualPaymentEvent>[0][];
  events?: readonly Parameters<typeof toRealLoanEvent>[0][];
}): DomainEvent[] {
  return [
    ...(world.balances ?? []).map(toReportedBalanceEvent),
    ...(world.payments ?? []).map(toActualPaymentEvent),
    ...(world.events ?? []).map(toRealLoanEvent),
  ];
}

function withLoan(today = '2025-03-15'): World {
  const world = createWorld(today);
  world.loans.loansSignal.set([makeLoan()]);
  return world;
}

describe('forLoan', () => {
  it('is memoized per loan id and exposes the loan id', () => {
    const { service } = withLoan();
    expect(service.forLoan(LOAN)).toBe(service.forLoan(LOAN));
    expect(service.forLoan(LOAN).loanId).toBe(LOAN);
    expect(service.forLoan(uuid(9))).not.toBe(service.forLoan(LOAN));
  });

  it('asOf is Clock.today() and every projection shares it', () => {
    const { service } = withLoan('2025-03-15');
    expect(service.asOf()).toBe('2025-03-15');
    expect(service.forLoan(LOAN).asOf()).toBe('2025-03-15');
  });
});

describe('loading and unknown loans', () => {
  it('keeps nullable values null and inert values until every store is ready', () => {
    const world = withLoan();
    const names = ['loans', 'events', 'balances', 'payments', 'scenarios'] as const;
    for (const name of names) {
      world[name].readySignal.set(false);
      const projection = world.service.forLoan(LOAN);
      expect(projection.paths()).toBeNull();
      expect(projection.metrics()).toBeNull();
      expect(projection.balance()).toBeNull();
      expect(projection.error()).toBeNull();
      expect(projection.validation().status).toBe('UNVALIDATED');
      world[name].readySignal.set(true);
      expect(projection.paths()).not.toBeNull();
    }
  });

  it('is inert for a loan the store does not know', () => {
    const { service } = withLoan();
    const projection = service.forLoan(uuid(99));
    expect(projection.paths()).toBeNull();
    expect(projection.error()).toBeNull();
    expect(projection.cutoffK()).toBe(0);
    expect(projection.suggestedPaid()).toBe(false);
  });
});

describe('the three paths of the [ALG.EXAMPLE] loan', () => {
  it('builds original and real from the conditions and no scenario', () => {
    const { service } = withLoan();
    const paths = service.forLoan(LOAN).paths();
    expect(paths).not.toBeNull();
    expect(paths?.original.installmentCount).toBe(240);
    expect(paths?.original.totals.interest).toBe('443416.24');
    expect(paths?.original.endDate).toBe('2045-01-31');
    expect(paths?.real).toEqual(paths?.original);
    expect(paths?.scenario).toBeNull();
    expect(paths?.cutoffK).toBe(0);
  });

  it('equals the domain buildPaths of the mapped entities', () => {
    const world = withLoan();
    const prepayment = makePrepayment({ id: uuid(20) });
    world.events.setAll([prepayment]);
    const expected = buildPaths({
      terms: toLoanTerms(makeLoan()),
      realEvents: realEventsOf({ events: [prepayment] }),
      scenarioEvents: null,
    });
    const paths = world.service.forLoan(LOAN).paths();
    expect(paths?.real).toEqual(expected.real);
    expect(paths?.original).toEqual(expected.original);
    expect(paths?.real.installmentCount).toBe(220);
    expect(paths?.real.endDate).toBe('2043-05-31');
    expect(world.service.forLoan(LOAN).metrics()?.realVsOriginal.interestSaved).toBe('69172.80');
  });

  it('computes yearly subtotals of each path with the domain function', () => {
    const world = withLoan();
    world.scenarios.setAll([makeScenario({ id: uuid(30), events: [makeScenarioPrepayment({ id: uuid(31) })] })]);
    world.scenarios.setActive(LOAN, uuid(30));
    const projection = world.service.forLoan(LOAN);
    const paths = projection.paths();
    expect(paths?.scenario).not.toBeNull();
    expect(projection.yearlySubtotals()).toEqual({
      original: yearlySubtotals(paths!.original),
      real: yearlySubtotals(paths!.real),
      scenario: yearlySubtotals(paths!.scenario!),
    });
  });

  it('ignores records marked deleted', () => {
    const world = withLoan();
    world.events.setAll([makePrepayment({ id: uuid(20), deletedAt: '2026-02-01T00:00:00.000Z' })]);
    expect(world.service.forLoan(LOAN).paths()?.real.installmentCount).toBe(240);
  });
});

describe('derived values (spec §9)', () => {
  it('takes the current installment as the first real row due on or after asOf', () => {
    const { service } = withLoan('2025-03-15');
    const projection = service.forLoan(LOAN);
    expect(projection.currentInstallment()?.k).toBe(2);
    expect(projection.balance()).toBe('499178.20');
    expect(projection.nextInstallmentTotal()).toBe('4658.47');
    expect(projection.percentPaid()).toBe('0.2');
    expect(projection.realEndDate()).toBe('2045-01-31');
    expect(projection.suggestedPaid()).toBe(false);
  });

  it('on the due date itself the installment is still the current one', () => {
    const { service } = withLoan('2025-03-31');
    expect(service.forLoan(LOAN).currentInstallment()?.k).toBe(2);
  });

  it('before the first due date the current installment is the first and nothing is paid', () => {
    const projection = withLoan('2025-01-01').service.forLoan(LOAN);
    expect(projection.currentInstallment()?.k).toBe(1);
    expect(projection.balance()).toBe('500000.00');
    expect(projection.percentPaid()).toBe('0.0');
  });

  it('after the real end date there is no current installment and the balance is 0.00', () => {
    const projection = withLoan('2045-02-01').service.forLoan(LOAN);
    expect(projection.currentInstallment()).toBeNull();
    expect(projection.balance()).toBe('0.00');
    expect(projection.nextInstallmentTotal()).toBeNull();
    expect(projection.percentPaid()).toBe('100.0');
    expect(projection.suggestedPaid()).toBe(true);
  });

  it('on the end date itself the loan is not yet suggested as paid', () => {
    const projection = withLoan('2045-01-31').service.forLoan(LOAN);
    expect(projection.currentInstallment()?.k).toBe(240);
    expect(projection.suggestedPaid()).toBe(false);
  });

  it('realEndDate follows the real path and activeScenarioEndDate follows the active scenario, never replacing it', () => {
    const world = withLoan();
    world.scenarios.setAll([makeScenario({ id: uuid(30), events: [makeScenarioPrepayment({ id: uuid(31) })] })]);
    const projection = world.service.forLoan(LOAN);
    expect(projection.activeScenarioEndDate()).toBeNull();
    expect(projection.metrics()?.activeScenarioVsReal).toBeNull();
    world.scenarios.setActive(LOAN, uuid(30));
    const paths = projection.paths();
    expect(projection.realEndDate()).toBe('2045-01-31');
    expect(projection.activeScenarioEndDate()).toBe(paths?.scenario?.endDate);
    expect(projection.activeScenarioEndDate()).not.toBe(projection.realEndDate());
    expect(projection.metrics()?.activeScenarioVsReal).toEqual(compareSchedules(paths!.real, paths!.scenario!));
  });

  it('an active scenario with no live events has no scenario path', () => {
    const world = withLoan();
    world.scenarios.setAll([
      makeScenario({
        id: uuid(30),
        events: [makeScenarioPrepayment({ id: uuid(31), deletedAt: '2026-02-01T00:00:00.000Z' })],
      }),
    ]);
    world.scenarios.setActive(LOAN, uuid(30));
    const projection = world.service.forLoan(LOAN);
    expect(projection.paths()?.scenario).toBeNull();
    expect(projection.activeScenarioEndDate()).toBeNull();
    world.scenarios.setActive(LOAN, uuid(77));
    expect(projection.paths()?.scenario).toBeNull();
  });

  it('percentPaid reflects an anchor that re-anchors the balance', () => {
    const world = withLoan('2025-03-15');
    world.balances.setAll([
      makeBalance({ id: uuid(40), installmentNumber: 2, date: '2025-03-31', balance: '450000.00' }),
    ]);
    const projection = world.service.forLoan(LOAN);
    expect(projection.balance()).toBe('450000.00');
    expect(projection.percentPaid()).toBe('10.0');
  });
});

describe('validation status and suggestedPaid', () => {
  it('is UNVALIDATED without a reported balance', () => {
    expect(withLoan().service.forLoan(LOAN).validation()).toEqual({
      status: 'UNVALIDATED',
      reportedBalanceId: null,
      k: null,
      realDelta: null,
      cause: null,
    });
  });

  it('applies [ALG.VALIDATE] to the latest reported balance', () => {
    const world = withLoan();
    const balance = makeBalance({ id: uuid(40), date: '2025-07-31', balance: '495834.02' });
    world.balances.setAll([balance]);
    const expected = validateAgainstReportedBalance({
      terms: toLoanTerms(makeLoan()),
      realEvents: realEventsOf({ balances: [balance] }),
      reported: toReportedBalanceEvent(balance),
    });
    expect(world.service.forLoan(LOAN).validation()).toEqual({
      status: expected.status,
      reportedBalanceId: uuid(40),
      k: expected.k,
      realDelta: expected.realDelta,
      cause: expected.cause,
    });
  });

  it('is GREEN when the reported balance matches and RED with a cause when far away', () => {
    const world = withLoan();
    world.balances.setAll([makeBalance({ id: uuid(40), installmentNumber: 6, balance: '495834.02' })]);
    expect(world.service.forLoan(LOAN).validation()).toMatchObject({
      status: 'GREEN',
      k: 6,
      realDelta: '0.00',
      cause: null,
    });
    world.balances.setAll([makeBalance({ id: uuid(40), installmentNumber: 6, balance: '400000.00' })]);
    const red = world.service.forLoan(LOAN).validation();
    expect(red.status).toBe('RED');
    expect(red.cause).toBe('UNKNOWN');
    expect(red.realDelta).toBe('-95834.02');
  });

  it('picks the latest anchor: highest k, then later date, then greater id', () => {
    const world = withLoan();
    world.balances.setAll([
      makeBalance({ id: uuid(41), installmentNumber: 6, date: '2025-07-31', balance: '495834.02' }),
      makeBalance({ id: uuid(42), installmentNumber: 3, date: '2025-12-31', balance: '497517.58' }),
    ]);
    expect(world.service.forLoan(LOAN).validation().reportedBalanceId).toBe(uuid(41));
    world.balances.setAll([
      makeBalance({ id: uuid(41), installmentNumber: 6, date: '2025-07-31', balance: '495834.02' }),
      makeBalance({ id: uuid(43), installmentNumber: 6, date: '2025-07-31', balance: '495834.02' }),
      makeBalance({ id: uuid(42), installmentNumber: 6, date: '2025-07-01', balance: '495834.02' }),
    ]);
    expect(world.service.forLoan(LOAN).validation().reportedBalanceId).toBe(uuid(43));
  });

  it('suggestedPaid is true when the latest reported balance is 0.00', () => {
    const world = withLoan('2025-03-15');
    world.balances.setAll([makeBalance({ id: uuid(40), installmentNumber: 100, date: '2033-05-31', balance: '0.00' })]);
    const projection = world.service.forLoan(LOAN);
    expect(projection.error()).toBeNull();
    expect(projection.suggestedPaid()).toBe(true);
    world.balances.setAll([makeBalance({ id: uuid(40), installmentNumber: 100, date: '2033-05-31', balance: '0.01' })]);
    expect(projection.suggestedPaid()).toBe(false);
  });
});

describe('cutoffK, paid flags and Real Δ', () => {
  function realWorld(): {
    world: World;
    balance: ReturnType<typeof makeBalance>;
    payment: ReturnType<typeof makePayment>;
    prepayment: ReturnType<typeof makePrepayment>;
  } {
    const world = withLoan('2026-02-10');
    const balance = makeBalance({ id: uuid(40), installmentNumber: 3, date: '2025-04-30', balance: '497000.00' });
    const payment = makePayment({
      id: uuid(50),
      installmentNumber: 2,
      paidDate: '2025-04-12',
      total: '4700.00',
      breakdown: { capital: '830.00', interest: '2911.00', insurance: '524.00', fixedCharges: '395.00' },
    });
    const prepayment = makePrepayment({ id: uuid(20), date: '2025-12-31', amount: '5000.00', mode: 'REDUCE_TERM' });
    world.balances.setAll([balance]);
    world.payments.setAll([payment]);
    world.events.setAll([prepayment]);
    return { world, balance, payment, prepayment };
  }

  it('exposes the cutoffK of buildPaths (a real prepayment after an anchor moves it)', () => {
    const { world, balance, payment, prepayment } = realWorld();
    const expected = buildPaths({
      terms: toLoanTerms(makeLoan()),
      realEvents: realEventsOf({ balances: [balance], payments: [payment], events: [prepayment] }),
      scenarioEvents: null,
    });
    expect(expected.cutoffK).toBeGreaterThan(3);
    expect(world.service.forLoan(LOAN).cutoffK()).toBe(expected.cutoffK);
  });

  it('flags as paid every real-path row that has an ActualPayment', () => {
    const { world } = realWorld();
    const projection = world.service.forLoan(LOAN);
    const paid = [...projection.paidInstallments()];
    expect(paid).toEqual([2]);
    expect(
      projection
        .paths()
        ?.real.rows.filter((row) => row.paid)
        .map((row) => row.k),
    ).toEqual([2]);
  });

  it('a late payment keeps its installmentNumber and marks that row', () => {
    const world = withLoan('2026-02-10');
    world.payments.setAll([makePayment({ id: uuid(50), installmentNumber: 1, paidDate: '2025-06-20' })]);
    expect([...world.service.forLoan(LOAN).paidInstallments()]).toEqual([1]);
  });

  it('exposes Real Δ per anchor (with traffic light and cause) and per component, equal to the domain', () => {
    const { world, balance, payment, prepayment } = realWorld();
    const expected = buildPaths({
      terms: toLoanTerms(makeLoan()),
      realEvents: realEventsOf({ balances: [balance], payments: [payment], events: [prepayment] }),
      scenarioEvents: null,
    });
    const projection = world.service.forLoan(LOAN);
    const anchors = projection.realDeltaPerAnchor();
    expect(anchors).toHaveLength(1);
    expect(anchors[0]).toMatchObject(expected.realDelta.perAnchor[0]!);
    const validation = validateAgainstReportedBalance({
      terms: toLoanTerms(makeLoan()),
      realEvents: realEventsOf({ balances: [balance], payments: [payment], events: [prepayment] }),
      reported: toReportedBalanceEvent(balance),
    });
    expect(anchors[0]?.status).toBe(validation.status);
    expect(anchors[0]?.cause).toBe(validation.cause);
    expect(projection.realDeltaPerComponent()).toEqual(expected.realDelta.perComponent);
    expect(projection.realDeltaPerComponent()).toHaveLength(1);
    expect(projection.realDeltaPerComponent()[0]).toMatchObject({ eventId: uuid(50), k: 2 });
  });

  it('a payment without breakdown has no Real Δ per component', () => {
    const world = withLoan();
    world.payments.setAll([makePayment({ id: uuid(50) })]);
    expect(world.service.forLoan(LOAN).realDeltaPerComponent()).toEqual([]);
  });
});

describe('engine errors surface as typed state and never throw', () => {
  it('NegativeAmortization from a real rate change nulls the nullable members and keeps inert values', () => {
    const world = withLoan();
    world.events.setAll([
      makeRateChange({ id: uuid(20), policy: 'BANK_INSTALLMENT', bankInstallment: '100.00' } as never),
    ]);
    const projection = world.service.forLoan(LOAN);
    expect(projection.error()).toBeInstanceOf(NegativeAmortizationError);
    expect(projection.paths()).toBeNull();
    expect(projection.metrics()).toBeNull();
    expect(projection.yearlySubtotals()).toBeNull();
    expect(projection.currentInstallment()).toBeNull();
    expect(projection.balance()).toBeNull();
    expect(projection.percentPaid()).toBeNull();
    expect(projection.nextInstallmentTotal()).toBeNull();
    expect(projection.realEndDate()).toBeNull();
    expect(projection.activeScenarioEndDate()).toBeNull();
    expect(projection.validation().status).toBe('UNVALIDATED');
    expect(projection.suggestedPaid()).toBe(false);
    expect(projection.cutoffK()).toBe(0);
    expect(projection.paidInstallments().size).toBe(0);
    expect(projection.realDeltaPerAnchor()).toEqual([]);
    expect(projection.realDeltaPerComponent()).toEqual([]);
  });

  it('an anchor out of range is an InvalidInputError state', () => {
    const world = withLoan();
    world.balances.setAll([makeBalance({ id: uuid(40), installmentNumber: 500 })]);
    expect(world.service.forLoan(LOAN).error()).toBeInstanceOf(InvalidInputError);
  });

  it('an invalid stored loan is an InvalidInputError state', () => {
    const world = createWorld();
    world.loans.loansSignal.set([makeLoan({ principal: '0.00' })]);
    const projection = world.service.forLoan(LOAN);
    expect(projection.error()).toBeInstanceOf(InvalidInputError);
    expect(projection.paths()).toBeNull();
  });

  it('recovers when the offending record is removed', () => {
    const world = withLoan();
    world.balances.setAll([makeBalance({ id: uuid(40), installmentNumber: 500 })]);
    const projection = world.service.forLoan(LOAN);
    expect(projection.error()).not.toBeNull();
    world.balances.setAll([]);
    expect(projection.error()).toBeNull();
    expect(projection.paths()).not.toBeNull();
  });

  it('an error caused only by the active scenario keeps every original and real value (D27)', () => {
    const world = withLoan('2025-03-15');
    world.balances.setAll([
      makeBalance({ id: uuid(40), installmentNumber: 5, date: '2025-06-30', balance: '495000.00' }),
    ]);
    world.scenarios.setAll([
      makeScenario({ id: uuid(30), events: [makeScenarioPrepayment({ id: uuid(31), date: '2025-03-31' })] }),
    ]);
    world.scenarios.setActive(LOAN, uuid(30));
    const projection = world.service.forLoan(LOAN);
    const error = projection.error();
    expect(error).toBeInstanceOf(InvalidInputError);
    expect((error as InvalidInputError).code).toBe('HYPOTHETICAL_BEFORE_CUTOFF');
    const paths = projection.paths();
    expect(paths).not.toBeNull();
    expect(paths?.scenario).toBeNull();
    expect(paths?.original.installmentCount).toBe(240);
    expect(paths?.cutoffK).toBe(5);
    expect(projection.activeScenarioEndDate()).toBeNull();
    expect(projection.metrics()?.activeScenarioVsReal).toBeNull();
    expect(projection.metrics()?.realVsOriginal).not.toBeNull();
    expect(projection.yearlySubtotals()?.scenario).toBeNull();
    expect(projection.yearlySubtotals()?.real.length).toBeGreaterThan(0);
    expect(projection.balance()).toBe('499178.20');
    expect(projection.realEndDate()).not.toBeNull();
    expect(projection.cutoffK()).toBe(5);
    expect(projection.validation().status).not.toBe('UNVALIDATED');
    expect(projection.realDeltaPerAnchor()).toHaveLength(1);
  });
});

describe('validation-only errors ([ALG.VALIDATE] modeled path fails)', () => {
  function repro(withSecondAnchor: boolean): World {
    const world = withLoan('2025-03-15');
    world.balances.setAll([
      makeBalance({ id: uuid(40), installmentNumber: 10, date: '2025-11-30', balance: '100000.00' }),
      ...(withSecondAnchor
        ? [makeBalance({ id: uuid(41), installmentNumber: 25, date: '2027-02-28', balance: '95000.00' })]
        : []),
    ]);
    world.events.setAll([
      makeRateChange({
        id: uuid(20),
        date: '2026-09-30',
        interestRate: '0.2',
        policy: 'KEEP_INSTALLMENT_ADJUST_TERM',
      } as never),
    ]);
    return world;
  }

  it('realDeltaPerAnchor never throws, keeps the buildPaths delta and marks the anchor unvalidated', () => {
    const world = repro(true);
    const projection = world.service.forLoan(LOAN);
    expect(projection.error()).toBeNull();
    const anchors = projection.realDeltaPerAnchor();
    const deltas = projection.paths()!.realDelta.perAnchor;
    expect(anchors).toHaveLength(2);
    anchors.forEach((anchor, index) => expect(anchor).toMatchObject(deltas[index]!));
    expect(anchors.some((anchor) => anchor.status === 'UNVALIDATED' && anchor.cause === null)).toBe(true);
  });

  it('a validation-only error keeps the loan computed and its validation UNVALIDATED', () => {
    const world = repro(false);
    const projection = world.service.forLoan(LOAN);
    expect(projection.error()).toBeNull();
    expect(projection.paths()).not.toBeNull();
    expect(projection.balance()).not.toBeNull();
    expect(projection.metrics()).not.toBeNull();
    expect(projection.validation()).toEqual({
      status: 'UNVALIDATED',
      reportedBalanceId: null,
      k: null,
      realDelta: null,
      cause: null,
    });
  });
});

describe('memoization', () => {
  it('returns the same object on repeated reads', () => {
    const projection = withLoan().service.forLoan(LOAN);
    expect(projection.paths()).toBe(projection.paths());
    expect(projection.metrics()).toBe(projection.metrics());
  });

  it('recomputes the paths only when an input of this loan changes', () => {
    const world = withLoan();
    world.loans.loansSignal.set([makeLoan(), makeSecondLoan()]);
    const projection = world.service.forLoan(LOAN);
    const before = projection.paths();
    // another loan's records, and a new array of the same records for this loan, do not recompute
    world.events.setAll([makePrepayment({ id: uuid(21), loanId: uuid(2), date: '2025-12-31' })]);
    world.payments.setAll([]);
    world.balances.setAll([]);
    expect(projection.paths()).toBe(before);
    // a change of this loan does
    const prepayment = makePrepayment({ id: uuid(20) });
    world.events.setAll([prepayment]);
    const after = projection.paths();
    expect(after).not.toBe(before);
    expect(after?.real.installmentCount).toBe(220);
    // and only the changed collection's loan recomputes
    world.events.setAll([prepayment, makePrepayment({ id: uuid(21), loanId: uuid(2), date: '2025-12-31' })]);
    expect(projection.paths()).toBe(after);
  });

  it('does not recompute the paths when only the active scenario of another loan changes', () => {
    const world = withLoan();
    const projection = world.service.forLoan(LOAN);
    const before = projection.paths();
    world.scenarios.setActive(uuid(2), uuid(99));
    expect(projection.paths()).toBe(before);
  });

  it('derived values depend on asOf only, not on a recomputation of the paths', () => {
    const world = withLoan('2025-03-15');
    const projection = world.service.forLoan(LOAN);
    expect(projection.paths()).toBe(projection.paths());
    expect(projection.currentInstallment()).toBe(projection.currentInstallment());
  });
});

describe('totalsByCurrency (spec §9)', () => {
  function threeLoans(): World {
    const world = createWorld('2025-03-15');
    world.loans.loansSignal.set([
      makeLoan(),
      makeSecondLoan({ currency: 'GTQ', paymentDay: 'END_OF_MONTH', firstDueDate: '2025-02-28' }),
      makeSecondLoan({ id: uuid(3), currency: 'USD', paymentDay: 'END_OF_MONTH', firstDueDate: '2025-02-28' }),
    ]);
    return world;
  }

  it('groups by currency, GTQ first, and never adds GTQ to USD', () => {
    const world = threeLoans();
    const totals = world.service.totalsByCurrency();
    expect(totals.map((entry) => entry.currency)).toEqual(['GTQ', 'USD']);
    const gtq = totals[0]!;
    const usd = totals[1]!;
    const first = world.service.forLoan(uuid(1));
    const second = world.service.forLoan(uuid(2));
    const third = world.service.forLoan(uuid(3));
    expect(gtq.loanCount).toBe(2);
    expect(usd.loanCount).toBe(1);
    expect(usd.balance).toBe(third.balance());
    expect(usd.nextInstallmentTotal).toBe(third.nextInstallmentTotal());
    const sum = (a: string | null, b: string | null): string => (Number(a) + Number(b)).toFixed(2);
    expect(gtq.balance).toBe(sum(first.balance(), second.balance()));
    expect(gtq.nextInstallmentTotal).toBe(sum(first.nextInstallmentTotal(), second.nextInstallmentTotal()));
  });

  it('only counts active loans', () => {
    const world = threeLoans();
    world.loans.loansSignal.update((loans) =>
      loans.map((loan) => (loan.id === uuid(2) ? { ...loan, status: 'archived' } : loan)),
    );
    expect(world.service.totalsByCurrency()[0]?.loanCount).toBe(1);
    world.loans.loansSignal.update((loans) =>
      loans.map((loan) => (loan.id === uuid(3) ? { ...loan, status: 'paid' } : loan)),
    );
    expect(world.service.totalsByCurrency().map((entry) => entry.currency)).toEqual(['GTQ']);
  });

  it('leaves out a loan whose balance is null (engine error)', () => {
    const world = threeLoans();
    world.balances.setAll([makeBalance({ id: uuid(40), loanId: uuid(2), installmentNumber: 900 })]);
    const totals = world.service.totalsByCurrency();
    expect(totals[0]?.loanCount).toBe(1);
    expect(totals[0]?.balance).toBe(world.service.forLoan(uuid(1)).balance());
  });

  it('a loan without current installment adds 0.00 balance and no next installment', () => {
    const world = createWorld('2045-02-01');
    world.loans.loansSignal.set([makeLoan()]);
    expect(world.service.totalsByCurrency()).toEqual([
      { currency: 'GTQ', loanCount: 1, balance: '0.00', nextInstallmentTotal: '0.00' },
    ]);
  });

  it('is empty without active loans', () => {
    expect(createWorld().service.totalsByCurrency()).toEqual([]);
  });
});

describe('compareScenarios', () => {
  function scenarioWorld(): World {
    const world = withLoan();
    world.scenarios.setAll([
      makeScenario({ id: uuid(30), name: 'A', events: [makeScenarioPrepayment({ id: uuid(31) })] }),
      makeScenario({
        id: uuid(32),
        name: 'B',
        events: [makeScenarioPrepayment({ id: uuid(33), amount: '50000.00', date: '2027-01-15' })],
      }),
    ]);
    return world;
  }

  it('compares original, real and each scenario against the real path', () => {
    const world = scenarioWorld();
    const comparison = world.service.compareScenarios(LOAN, [uuid(30), uuid(32)])();
    const paths = world.service.forLoan(LOAN).paths()!;
    expect(comparison?.original).toEqual(paths.original);
    expect(comparison?.real).toEqual(paths.real);
    expect(comparison?.failed).toEqual([]);
    expect(comparison?.scenarios.map((entry) => entry.name)).toEqual(['A', 'B']);
    for (const entry of comparison?.scenarios ?? []) {
      expect(entry.metrics).toEqual(compareSchedules(paths.real, entry.schedule));
    }
    expect(comparison?.scenarios[1]?.metrics.interestSaved).not.toBe(comparison?.scenarios[0]?.metrics.interestSaved);
  });

  it('puts a scenario whose events no longer compute in failed', () => {
    const world = scenarioWorld();
    world.balances.setAll([
      makeBalance({ id: uuid(40), installmentNumber: 20, date: '2026-09-30', balance: '480000.00' }),
    ]);
    world.scenarios.setAll([
      makeScenario({ id: uuid(30), name: 'A', events: [makeScenarioPrepayment({ id: uuid(31), date: '2027-01-15' })] }),
      makeScenario({ id: uuid(32), name: 'B', events: [makeScenarioPrepayment({ id: uuid(33), date: '2025-03-31' })] }),
    ]);
    const comparison = world.service.compareScenarios(LOAN, [uuid(30), uuid(32)])();
    expect(comparison?.scenarios.map((entry) => entry.scenarioId)).toEqual([uuid(30)]);
    expect(comparison?.failed).toHaveLength(1);
    expect(comparison?.failed[0]?.scenarioId).toBe(uuid(32));
    expect(comparison?.failed[0]?.error).toBeInstanceOf(InvalidInputError);
  });

  it('keeps at most 3 scenarios, skips unknown and deleted events, and is memoized per request', () => {
    const world = scenarioWorld();
    const ids = [uuid(30), uuid(32), uuid(88), uuid(30), uuid(32)];
    const comparison = world.service.compareScenarios(LOAN, ids);
    expect(comparison()?.scenarios).toHaveLength(2);
    expect(world.service.compareScenarios(LOAN, ids)).toBe(comparison);
    expect(world.service.compareScenarios(LOAN, [uuid(30)])).not.toBe(comparison);
    const capped = world.service.compareScenarios(LOAN, [uuid(30), uuid(32), uuid(30), uuid(32)])();
    expect(capped?.scenarios.length).toBeLessThanOrEqual(3);
  });

  it('a scenario with only deleted events equals the real path', () => {
    const world = withLoan();
    world.scenarios.setAll([
      makeScenario({
        id: uuid(30),
        events: [makeScenarioPrepayment({ id: uuid(31), deletedAt: '2026-02-01T00:00:00.000Z' })],
      }),
    ]);
    const comparison = world.service.compareScenarios(LOAN, [uuid(30)])();
    expect(comparison?.scenarios[0]?.metrics.monthsSaved).toBe(0);
    expect(comparison?.scenarios[0]?.metrics.netSaving).toBe('0.00');
  });

  it('is null while loading and when original or real fail', () => {
    const world = scenarioWorld();
    world.scenarios.readySignal.set(false);
    expect(world.service.compareScenarios(LOAN, [uuid(30)])()).toBeNull();
    world.scenarios.readySignal.set(true);
    expect(world.service.compareScenarios(LOAN, [uuid(30)])()).not.toBeNull();
    world.balances.setAll([makeBalance({ id: uuid(40), installmentNumber: 900 })]);
    expect(world.service.compareScenarios(LOAN, [uuid(30)])()).toBeNull();
    expect(world.service.compareScenarios(uuid(99), [])()).toBeNull();
  });
});

describe('checkRealWrite (dry run)', () => {
  const bankBelowCharge = {
    entity: 'LoanEvent',
    record: {
      loanId: LOAN,
      date: '2025-06-30',
      type: 'RateChange',
      policy: 'BANK_INSTALLMENT',
      interestRate: '0.09',
      bankInstallment: '100.00',
    },
  } as const;

  it('returns the NegativeAmortizationError a RateChange would raise, without saving', () => {
    const world = withLoan();
    const projection = world.service.forLoan(LOAN);
    const before = projection.paths();
    const error = world.service.checkRealWrite(LOAN, bankBelowCharge as never);
    expect(error).toBeInstanceOf(NegativeAmortizationError);
    expect(projection.error()).toBeNull();
    expect(projection.paths()).toBe(before);
  });

  it('returns null for a write the real path accepts', () => {
    const world = withLoan();
    const write = {
      entity: 'LoanEvent',
      record: { loanId: LOAN, date: '2026-01-15', type: 'Prepayment', amount: '20000.00', mode: 'REDUCE_TERM' },
    } as const;
    expect(world.service.checkRealWrite(LOAN, write as never)).toBeNull();
  });

  it('an update replaces the record with its id instead of adding another', () => {
    const world = withLoan();
    const bad = makeRateChange({ id: uuid(20), policy: 'BANK_INSTALLMENT', bankInstallment: '4300.00' } as never);
    world.events.setAll([bad]);
    const fixed = { ...bankBelowCharge.record, id: uuid(20), bankInstallment: '4300.00' };
    expect(world.service.checkRealWrite(LOAN, { entity: 'LoanEvent', record: fixed } as never)).toBeNull();
    const broken = { ...bankBelowCharge.record, id: uuid(20) };
    expect(world.service.checkRealWrite(LOAN, { entity: 'LoanEvent', record: broken } as never)).toBeInstanceOf(
      NegativeAmortizationError,
    );
  });

  it('checks reported balances and payments too', () => {
    const world = withLoan();
    const outOfRange = {
      entity: 'ReportedBalance',
      record: { loanId: LOAN, date: '2025-06-30', installmentNumber: 900, balance: '1.00', source: 'OTHER' },
    } as const;
    expect(world.service.checkRealWrite(LOAN, outOfRange as never)).toBeInstanceOf(InvalidInputError);
    const payment = {
      entity: 'ActualPayment',
      record: { loanId: LOAN, paidDate: '2025-02-28', installmentNumber: 1, total: '4658.47' },
    } as const;
    expect(world.service.checkRealWrite(LOAN, payment as never)).toBeNull();
    const balanceUpdate = {
      entity: 'ReportedBalance',
      record: {
        id: uuid(40),
        loanId: LOAN,
        date: '2025-06-30',
        installmentNumber: 5,
        balance: '490000.00',
        source: 'OTHER',
      },
    } as const;
    world.balances.setAll([makeBalance({ id: uuid(40), installmentNumber: 900 })]);
    expect(world.service.forLoan(LOAN).error()).not.toBeNull();
    expect(world.service.checkRealWrite(LOAN, balanceUpdate as never)).toBeNull();
  });

  it('is null for an unknown loan or while the stores load', () => {
    const world = withLoan();
    expect(world.service.checkRealWrite(uuid(99), bankBelowCharge as never)).toBeNull();
    world.events.readySignal.set(false);
    expect(world.service.checkRealWrite(LOAN, bankBelowCharge as never)).toBeNull();
  });

  it('reports a malformed record as the domain InvalidInputError', () => {
    const world = withLoan();
    const write = {
      entity: 'LoanEvent',
      record: { loanId: LOAN, date: '2025-06-30', type: 'Prepayment', amount: '1.234', mode: 'REDUCE_TERM' },
    };
    expect(world.service.checkRealWrite(LOAN, write as never)).toBeInstanceOf(InvalidInputError);
  });
});

describe('toLoanTerms', () => {
  it('maps a draft and throws InvalidInputError for an invalid one', () => {
    const { service } = withLoan();
    const draft = makeLoanDraft();
    expect(service.toLoanTerms(draft)).toEqual(toLoanTerms(makeLoan()));
    expect(() => service.toLoanTerms({ ...draft, principal: 'abc' })).toThrow(InvalidInputError);
  });
});

describe('bench', () => {
  it('recomputes 3 loans x 360 rows (paths, metrics, subtotals, validation) in < 100 ms', () => {
    const world = createWorld('2030-06-15');
    const loans = [
      makeLoan({ id: uuid(1), termMonths: 360 }),
      makeLoan({ id: uuid(2), termMonths: 360 }),
      makeLoan({ id: uuid(3), termMonths: 360, currency: 'USD' }),
    ];
    world.loans.loansSignal.set(loans);
    // About 12 anchors on the first loan; the salt changes the balances so each pass recomputes.
    const anchorsFor = (salt: number) =>
      loans.slice(0, 1).flatMap((loan, li) =>
        Array.from({ length: 12 }, (_, i) =>
          makeBalance({
            id: uuid(100 + li * 20 + i),
            loanId: loan.id,
            installmentNumber: 6 + i,
            date: '2026-01-31',
            balance: (400000 + salt * 10 + i).toFixed(2),
          }),
        ),
      );
    world.balances.setAll(anchorsFor(0));
    const run = (): number => {
      const start = performance.now();
      for (const loan of loans) {
        const projection = world.service.forLoan(loan.id);
        expect(projection.paths()?.original.rows).toHaveLength(360);
        projection.metrics();
        projection.yearlySubtotals();
        projection.validation();
        projection.realDeltaPerAnchor();
      }
      world.service.totalsByCurrency();
      return performance.now() - start;
    };
    run(); // warm-up (JIT, first computeds)
    const best = Math.min(
      ...[1, 2, 3, 4, 5].map((pass) => {
        world.balances.setAll(anchorsFor(pass));
        return run();
      }),
    );
    console.info(`bench best of 5: ${best.toFixed(1)} ms`);
    // 100 ms locally. GitHub runners are about 2x slower (CI measured 189.85 ms), so CI allows 300 ms.
    const env = typeof process === 'undefined' ? undefined : process.env;
    expect(best).toBeLessThan(env?.['CI'] ? 300 : 100);
  });
});
