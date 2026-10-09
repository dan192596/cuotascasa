/**
 * Registro de propiedades del motor (W3-02). Cada entrada cita la regla [ALG.*] que prueba. `invariants.spec.ts` las
 * ejecuta con la semilla fija de CI; las que figuran en `properties-pending.json` corren como `it.fails`.
 */
import fc from 'fast-check';
import { expect } from 'vitest';
import {
  actualPaymentsArbitrary,
  basisPointsToRate,
  centsToMoney,
  dueDateOf,
  eventsArbitrary,
  loanCaseArbitrary,
  loanTermsArbitrary,
  moneyToCents,
  reportedBalanceArbitrary,
} from './arbitraries.ts';
import { attempt, deepFreeze, expectRowConsistency } from './support.ts';
import {
  buildPaths,
  buildSchedule,
  compareMoney,
  compareSchedules,
  CurrencyMismatchError,
  type DomainEvent,
  moneyAdd,
  moneySub,
  moneySum,
  NegativeAmortizationError,
  PathKind,
  type PrepaymentEvent,
  runSchedule,
  type Schedule,
  yearlySubtotals,
  ZERO_MONEY,
} from '../../src/index.ts';

export interface PropertyDefinition {
  readonly id: string;
  readonly title: string;
  /** Reglas de docs/algorithm.md que respalda la propiedad. */
  readonly rules: readonly string[];
  readonly numRuns: number;
  readonly build: () => fc.IPropertyWithHooks<unknown[]>;
}

const NOT_ANCHORED = ['Prepayment', 'AdvanceInstallments', 'RateChange', 'FixedChargeChange'] as const;

const definitions: PropertyDefinition[] = [];

function define(
  id: string,
  title: string,
  rules: readonly string[],
  numRuns: number,
  build: () => fc.IPropertyWithHooks<unknown[]>,
): void {
  definitions.push({ id, title, rules, numRuns, build });
}

const isPositive = (value: Parameters<typeof compareMoney>[0]) => compareMoney(value, ZERO_MONEY) > 0;

// 1. Conservación del capital -------------------------------------------------------------------------------------
define(
  'capital-conservation',
  'without anchors, sum(capital) + sum(prepayments) equals the principal exactly',
  ['ALG.LAST', 'ALG.PREPAY.CAP'],
  300,
  () =>
    fc.property(loanCaseArbitrary({ kinds: NOT_ANCHORED }), ({ terms, events }) => {
      const result = attempt(terms, events);
      fc.pre(result.kind === 'ok');
      if (result.kind !== 'ok') {
        return;
      }
      const { totals } = result.schedule;
      expect(moneyAdd(totals.capital, totals.prepayments)).toBe(terms.principal);
    }) as fc.IPropertyWithHooks<unknown[]>,
);

// 2. Saldo no negativo y que no crece -------------------------------------------------------------------------------
define(
  'balance-monotone',
  'without anchors, the balance is never negative and never increases from period to period',
  ['ALG.PERIOD.FHA_GT_V1', 'ALG.LAST', 'ALG.PREPAY.CAP'],
  300,
  () =>
    fc.property(loanCaseArbitrary({ kinds: NOT_ANCHORED }), ({ terms, events }) => {
      const result = attempt(terms, events);
      fc.pre(result.kind === 'ok');
      if (result.kind !== 'ok') {
        return;
      }
      let previous = terms.principal;
      for (const row of result.schedule.rows) {
        expect(compareMoney(row.opening, previous)).toBe(0);
        expect(compareMoney(row.closing, ZERO_MONEY)).toBeGreaterThanOrEqual(0);
        expect(compareMoney(row.closing, row.opening)).toBeLessThanOrEqual(0);
        expect(compareMoney(row.closingAfterPrepayment, ZERO_MONEY)).toBeGreaterThanOrEqual(0);
        expect(compareMoney(row.closingAfterPrepayment, row.closing)).toBeLessThanOrEqual(0);
        previous = row.closingAfterPrepayment;
      }
    }) as fc.IPropertyWithHooks<unknown[]>,
);

// 3. Coherencia de filas y totales --------------------------------------------------------------------------------
define(
  'rows-sum-and-chain',
  'rows add up, balances chain, the terminal row is unique and totals equal the sums of rows',
  ['ALG.PERIOD', 'ALG.LAST', 'ALG.METRICS', 'ALG.PERIOD.SPLIT'],
  200,
  () =>
    fc.property(loanCaseArbitrary({ kinds: NOT_ANCHORED }), ({ terms, events }) => {
      const result = attempt(terms, events);
      fc.pre(result.kind === 'ok');
      if (result.kind === 'ok') {
        expectRowConsistency(result.schedule, terms);
      }
    }) as fc.IPropertyWithHooks<unknown[]>,
);

// 4. Subtotales anuales -------------------------------------------------------------------------------------------
define(
  'yearly-subtotals-sum',
  'yearly subtotals add up to the schedule totals',
  ['ALG.YEARLY'],
  100,
  () =>
    fc.property(loanCaseArbitrary({ kinds: NOT_ANCHORED }), ({ terms, events }) => {
      const result = attempt(terms, events);
      fc.pre(result.kind === 'ok');
      if (result.kind !== 'ok') {
        return;
      }
      const yearly = yearlySubtotals(result.schedule);
      const { totals } = result.schedule;
      expect(moneySum(yearly.map((y) => y.capital))).toBe(totals.capital);
      expect(moneySum(yearly.map((y) => y.interest))).toBe(totals.interest);
      expect(moneySum(yearly.map((y) => y.insurance))).toBe(totals.insurance);
      expect(moneySum(yearly.map((y) => y.fixedCharges))).toBe(totals.fixedCharges);
      expect(moneySum(yearly.map((y) => y.prepayments))).toBe(totals.prepayments);
      expect(moneySum(yearly.map((y) => y.commissions))).toBe(totals.commissions);
      expect(moneySum(yearly.map((y) => y.total))).toBe(totals.total);
      expect(yearly.map((y) => y.year)).toEqual([...new Set(yearly.map((y) => y.year))].sort((a, b) => a - b));
    }) as fc.IPropertyWithHooks<unknown[]>,
);

// 5. Adelantar N cuotas -------------------------------------------------------------------------------------------
const advanceCase = loanCaseArbitrary({ kinds: NOT_ANCHORED, maxEvents: 3 }).chain(({ terms, events }) => {
  const base = attempt(terms, events);
  const rowsCount = base.kind === 'ok' ? base.schedule.rows.length : 0;
  return fc
    .record({ k: fc.integer({ min: 1, max: Math.max(1, rowsCount) }), n: fc.integer({ min: 1, max: 6 }) })
    .map(({ k, n }) => ({ terms, events, k, n, base }));
});

define(
  'advance-reduces-term-by-n',
  'AdvanceInstallments(n) reduces the remaining term by exactly n',
  ['ALG.ADVANCE', 'ALG.TERM'],
  300,
  () =>
    fc.property(advanceCase, ({ terms, events, k, n, base }) => {
      fc.pre(base.kind === 'ok' && k + n <= base.schedule.rows.length);
      if (base.kind !== 'ok') {
        return;
      }
      // Solo los eventos anteriores a k: ningún evento posterior puede alterar el resto del calendario.
      const earlier = events.filter((event) => !isLaterThan(terms, event, k));
      const before = attempt(terms, earlier);
      fc.pre(before.kind === 'ok' && k + n <= before.schedule.rows.length);
      if (before.kind !== 'ok') {
        return;
      }
      const advance: DomainEvent = {
        type: 'AdvanceInstallments',
        id: 'evt-advance',
        date: dueDateOf(terms, k),
        count: n,
      };
      const after = attempt(terms, [...earlier, advance]);
      expect(after.kind).toBe('ok');
      if (after.kind !== 'ok') {
        return;
      }
      expect(compareSchedules(before.schedule, after.schedule).monthsSaved).toBe(n);
      expect(after.schedule.rows.length).toBe(before.schedule.rows.length - n);
    }) as fc.IPropertyWithHooks<unknown[]>,
);

define(
  'advance-rest-identical',
  'after AdvanceInstallments(n) the rest of the schedule equals the current one from installment k + n + 1',
  ['ALG.ADVANCE'],
  200,
  () =>
    fc.property(advanceCase, ({ terms, events, k, n, base }) => {
      fc.pre(base.kind === 'ok');
      const earlier = events.filter((event) => !isLaterThan(terms, event, k));
      const before = attempt(terms, earlier);
      fc.pre(before.kind === 'ok' && k + n <= before.schedule.rows.length);
      if (before.kind !== 'ok') {
        return;
      }
      const advance: DomainEvent = {
        type: 'AdvanceInstallments',
        id: 'evt-advance',
        date: dueDateOf(terms, k),
        count: n,
      };
      const after = attempt(terms, [...earlier, advance]);
      if (after.kind !== 'ok') {
        expect(after.kind).toBe('ok');
        return;
      }
      const applied = after.schedule.rows[k - 1]?.prepayment ?? ZERO_MONEY;
      // Caso límite de [ALG.ADVANCE]: con projectCapital ≤ 0 el abono aplicado es 0.00 y el resto no es idéntico.
      fc.pre(isPositive(applied));
      after.schedule.rows.slice(k).forEach((row, index) => {
        const original = before.schedule.rows[k + n + index];
        expect(original).toBeDefined();
        expect(row.opening).toBe(original?.opening);
        expect(row.capital).toBe(original?.capital);
        expect(row.interest).toBe(original?.interest);
        expect(row.insurance).toBe(original?.insurance);
        expect(row.level).toBe(original?.level);
        expect(row.closing).toBe(original?.closing);
      });
    }) as fc.IPropertyWithHooks<unknown[]>,
);

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isLaterThan(terms: Parameters<typeof dueDateOf>[0], event: DomainEvent, k: number): boolean {
  for (let candidate = 1; candidate <= terms.termMonths; candidate += 1) {
    if (dueDateOf(terms, candidate) >= event.date) {
      return candidate >= k;
    }
  }
  return true;
}

// 6. Un abono válido nunca aumenta el interés total -----------------------------------------------------------------
/** Monto de un abono extra: centavos sueltos (el caso borde) o una fracción del principal. */
const extraAmountArbitrary = fc.oneof(
  fc.integer({ min: 1, max: 5_000 }).map((cents) => ({ cents, permille: 0 })),
  fc.integer({ min: 1, max: 600 }).map((permille) => ({ cents: 0, permille })),
);

const prepayCase = (maxEvents: number) =>
  loanCaseArbitrary({ kinds: NOT_ANCHORED, maxEvents }).chain(({ terms, events }) =>
    fc
      .record({ k: fc.integer({ min: 1, max: terms.termMonths }), amount: extraAmountArbitrary })
      .map(({ k, amount }) => ({ terms, events, k, amount })),
  );

function extraPrepayment(
  terms: Parameters<typeof dueDateOf>[0],
  k: number,
  amount: { readonly cents: number; readonly permille: number },
  mode: PrepaymentEvent['mode'],
): PrepaymentEvent {
  const cents =
    amount.cents > 0
      ? amount.cents
      : Math.max(1, Math.floor((moneyToCents(terms.principal) * amount.permille) / 1_000));
  return { type: 'Prepayment', id: 'evt-extra', date: dueDateOf(terms, k), amount: centsToMoney(cents), mode };
}

for (const mode of ['REDUCE_TERM', 'REDUCE_INSTALLMENT'] as const) {
  define(
    `prepayment-never-increases-interest-${mode.toLowerCase().replace('_', '-')}`,
    `adding a ${mode} prepayment never increases total interest (interest + insurance)`,
    ['ALG.PREPAY', 'ALG.METRICS'],
    300,
    () =>
      fc.property(prepayCase(3), ({ terms, events, k, amount }) => {
        const before = attempt(terms, events);
        const after = attempt(terms, [...events, extraPrepayment(terms, k, amount, mode)]);
        fc.pre(before.kind === 'ok' && after.kind === 'ok');
        if (before.kind !== 'ok' || after.kind !== 'ok') {
          return;
        }
        expect(
          compareMoney(compareSchedules(before.schedule, after.schedule).interestSaved, ZERO_MONEY),
        ).toBeGreaterThanOrEqual(0);
      }) as fc.IPropertyWithHooks<unknown[]>,
  );
}

define(
  'prepayment-reduce-term-saves-interest-if-no-month-lost',
  'on a plan without events, a REDUCE_TERM prepayment that does not lengthen the schedule never increases total interest',
  ['ALG.PREPAY.REDUCE_TERM', 'ALG.METRICS'],
  300,
  () =>
    fc.property(prepayCase(0), ({ terms, k, amount }) => {
      const before = attempt(terms, []);
      const after = attempt(terms, [extraPrepayment(terms, k, amount, 'REDUCE_TERM')]);
      fc.pre(before.kind === 'ok' && after.kind === 'ok');
      if (before.kind !== 'ok' || after.kind !== 'ok') {
        return;
      }
      const metrics = compareSchedules(before.schedule, after.schedule);
      fc.pre(metrics.monthsSaved >= 0);
      expect(compareMoney(metrics.interestSaved, ZERO_MONEY)).toBeGreaterThanOrEqual(0);
    }) as fc.IPropertyWithHooks<unknown[]>,
);

define(
  'prepayment-reduce-installment-interest-within-rounding',
  'on a plan without events, a REDUCE_INSTALLMENT prepayment never increases total interest by more than one cent per installment',
  ['ALG.PREPAY.REDUCE_INSTALLMENT', 'ALG.LEVEL', 'ALG.METRICS'],
  300,
  () =>
    fc.property(prepayCase(0), ({ terms, k, amount }) => {
      const before = attempt(terms, []);
      const after = attempt(terms, [extraPrepayment(terms, k, amount, 'REDUCE_INSTALLMENT')]);
      fc.pre(before.kind === 'ok' && after.kind === 'ok');
      if (before.kind !== 'ok' || after.kind !== 'ok') {
        return;
      }
      const metrics = compareSchedules(before.schedule, after.schedule);
      // `level` se redondea a centavos en cada recálculo: la diferencia cabe en un centavo por cuota.
      const tolerance = centsToMoney(before.schedule.rows.length);
      expect(compareMoney(moneyAdd(metrics.interestSaved, tolerance), ZERO_MONEY)).toBeGreaterThanOrEqual(0);
    }) as fc.IPropertyWithHooks<unknown[]>,
);

// 7. Reglas de monthsSaved -----------------------------------------------------------------------------------------
define(
  'months-saved-rules',
  'a single prepayment saves at least -1 month; -1 only when the base last installment exceeds the level; REDUCE_INSTALLMENT keeps the term',
  ['ALG.PREPAY.REDUCE_TERM', 'ALG.PREPAY.REDUCE_INSTALLMENT', 'ALG.METRICS'],
  300,
  () =>
    fc.property(
      loanTermsArbitrary({ fixedCharges: false }),
      fc.integer({ min: 0, max: 100_000 }),
      extraAmountArbitrary,
      fc.constantFrom('REDUCE_TERM', 'REDUCE_INSTALLMENT'),
      (terms, kSeed, amount, mode) => {
        const k = 1 + (kSeed % terms.termMonths);
        const before = attempt(terms, []);
        const after = attempt(terms, [extraPrepayment(terms, k, amount, mode)]);
        fc.pre(before.kind === 'ok' && after.kind === 'ok');
        if (before.kind !== 'ok' || after.kind !== 'ok') {
          return;
        }
        const { monthsSaved } = compareSchedules(before.schedule, after.schedule);
        expect(monthsSaved).toBeGreaterThanOrEqual(-1);
        if (monthsSaved === -1) {
          expect(mode).toBe('REDUCE_TERM');
          const last = before.schedule.rows[before.schedule.rows.length - 1];
          expect(last).toBeDefined();
          if (last) {
            const lastPayment = moneySum([last.capital, last.interest, last.insurance]);
            expect(compareMoney(lastPayment, last.level)).toBeGreaterThan(0);
          }
        }
        if (mode === 'REDUCE_INSTALLMENT') {
          expect(monthsSaved).toBeGreaterThanOrEqual(0);
        }
      },
    ) as fc.IPropertyWithHooks<unknown[]>,
);

// 8. Subida de tasa con KEEP_INSTALLMENT_ADJUST_TERM ------------------------------------------------------------------
define(
  'rate-increase-keep-installment',
  'a rate increase under KEEP_INSTALLMENT_ADJUST_TERM either throws NegativeAmortizationError or keeps the balance decreasing',
  ['ALG.RATE.KEEP_INSTALLMENT', 'ALG.TERM'],
  300,
  () =>
    fc.property(
      loanTermsArbitrary(),
      fc.integer({ min: 0, max: 100_000 }),
      fc.integer({ min: 1, max: 4_000 }),
      (terms, kSeed, extraBp) => {
        const k = 1 + (kSeed % terms.termMonths);
        const increased = addBasisPoints(terms.interestRate, extraBp);
        const event: DomainEvent = {
          type: 'RateChange',
          id: 'evt-rate',
          date: dueDateOf(terms, k),
          interestRate: increased,
          policy: 'KEEP_INSTALLMENT_ADJUST_TERM',
        };
        const result = attempt(terms, [event]);
        if (result.kind === 'negative-amortization') {
          expect(result.error).toBeInstanceOf(NegativeAmortizationError);
          expect(['ALG.RATE.KEEP_INSTALLMENT', 'ALG.TERM']).toContain(result.error.rule);
          expect(result.error.k).toBeGreaterThanOrEqual(k);
          return;
        }
        expect(result.kind).toBe('ok');
        if (result.kind !== 'ok') {
          return;
        }
        for (const row of result.schedule.rows) {
          expect(compareMoney(row.closing, row.opening)).toBeLessThan(0);
        }
        expectRowConsistency(result.schedule, terms);
      },
    ) as fc.IPropertyWithHooks<unknown[]>,
);

/** Suma exacta en puntos básicos: las tasas generadas tienen a lo sumo 4 decimales. */
function addBasisPoints(rate: string, extraBp: number) {
  const [whole = '0', fraction = ''] = rate.split('.');
  return basisPointsToRate(Number(`${whole}${fraction.padEnd(4, '0')}`) + extraBp);
}

// 9. Determinismo, idempotencia, orden de eventos y no mutación ---------------------------------------------------
define(
  'deterministic-and-pure',
  'building twice gives the same result, the input order of events does not matter, and inputs are never mutated',
  ['ALG.EVENTS.ORDER'],
  200,
  () =>
    fc.property(loanCaseArbitrary({ kinds: NOT_ANCHORED }), fc.integer(), ({ terms, events }, rotation) => {
      const frozenTerms = deepFreeze(cloneJson(terms));
      const frozenEvents = deepFreeze(cloneJson(events));
      const snapshot = JSON.stringify({ frozenTerms, frozenEvents });
      const first = attempt(frozenTerms, frozenEvents);
      const second = attempt(frozenTerms, frozenEvents);
      expect(second).toEqual(first);
      expect(JSON.stringify({ frozenTerms, frozenEvents })).toBe(snapshot);
      if (events.length > 1) {
        const shift = Math.abs(rotation) % events.length;
        const rotated = [...events.slice(shift), ...events.slice(0, shift)];
        expect(attempt(terms, rotated)).toEqual(attempt(terms, events));
        expect(attempt(terms, [...events].reverse())).toEqual(attempt(terms, events));
      }
    }) as fc.IPropertyWithHooks<unknown[]>,
);

// 10. Pagos reales: solo comparan ---------------------------------------------------------------------------------
define(
  'actual-payments-do-not-alter-path',
  'ActualPayment events only mark rows as paid and never change an amount',
  ['ALG.ACTUAL'],
  150,
  () =>
    fc.property(
      loanTermsArbitrary().chain((terms) => actualPaymentsArbitrary(terms).map((payments) => ({ terms, payments }))),
      ({ terms, payments }) => {
        const plain = buildSchedule(terms, []);
        const paid = buildSchedule(terms, payments);
        expect(paid.rows.length).toBe(plain.rows.length);
        paid.rows.forEach((row, index) => {
          expect({ ...row, paid: false }).toEqual({ ...plain.rows[index], paid: false });
          expect(row.paid).toBe(payments.some((p) => p.installmentNumber === row.k));
        });
        expect(paid.totals).toEqual(plain.totals);
      },
    ) as fc.IPropertyWithHooks<unknown[]>,
);

// 11. Anclas ------------------------------------------------------------------------------------------------------
define(
  'anchor-reanchors-opening',
  'a ReportedBalance becomes the opening of its installment and reports realDelta = reported - projected opening',
  ['ALG.ANCHOR', 'ALG.EVENTS.ORDER'],
  200,
  () =>
    fc.property(
      loanTermsArbitrary().chain((terms) => reportedBalanceArbitrary(terms).map((anchor) => ({ terms, anchor }))),
      ({ terms, anchor }) => {
        const plain = buildSchedule(terms, []);
        const k = anchor.installmentNumber ?? 1;
        // El ancla va a la cuota k: si el plan original liquidó antes, la regla 1 de [ALG.EVENTS.ANCHOR] la rechaza.
        fc.pre(k <= plain.rows.length);
        const run = attempt2(terms, anchor);
        if (run === null) {
          return;
        }
        const row = run.schedule.rows[k - 1];
        expect(row?.opening).toBe(anchor.balance);
        const delta = run.realDelta.perAnchor[0];
        expect(delta?.k).toBe(k);
        expect(delta?.reported).toBe(anchor.balance);
        expect(delta?.projected).toBe(plain.rows[k - 1]?.opening);
        expect(delta?.realDelta).toBe(moneySub(anchor.balance, plain.rows[k - 1]?.opening ?? ZERO_MONEY));
        // Antes del ancla el camino coincide con el plan original.
        run.schedule.rows.slice(0, k - 1).forEach((r, index) => {
          expect(r).toEqual(plain.rows[index]);
        });
        expectRowConsistencyAnchored(run.schedule);
      },
    ) as fc.IPropertyWithHooks<unknown[]>,
);

function attempt2(terms: Parameters<typeof dueDateOf>[0], anchor: DomainEvent) {
  try {
    return runSchedule(terms, [anchor]);
  } catch (error) {
    if (error instanceof NegativeAmortizationError) {
      return null;
    }
    throw error;
  }
}

function expectRowConsistencyAnchored(schedule: Schedule): void {
  // Con ancla no rige la conservación del principal, pero sí la cadena de saldos (salvo en la fila re-anclada).
  expect(schedule.rows[schedule.rows.length - 1]?.closingAfterPrepayment).toBe(ZERO_MONEY);
  for (const row of schedule.rows) {
    expect(compareMoney(row.closing, ZERO_MONEY)).toBeGreaterThanOrEqual(0);
    expect(row.closing).toBe(moneySub(row.opening, row.capital));
  }
}

// 12. Caminos y monedas -------------------------------------------------------------------------------------------
define(
  'paths-and-currency',
  'the original path ignores events, an empty scenario equals the real path, and currencies are never mixed',
  ['ALG.PATHS', 'ALG.PATHS.CUTOFF', 'ALG.METRICS', 'ALG.TERMS'],
  150,
  () =>
    fc.property(
      loanTermsArbitrary().chain((terms) =>
        eventsArbitrary(terms, { kinds: ['Prepayment', 'RateChange', 'FixedChargeChange'], maxEvents: 3 }).map(
          (events) => ({ terms, events }),
        ),
      ),
      ({ terms, events }) => {
        const real = attempt(terms, events);
        fc.pre(real.kind === 'ok');
        if (real.kind !== 'ok') {
          return;
        }
        const paths = buildPaths({ terms, realEvents: events, scenarioEvents: null });
        expect(paths.scenario).toBeNull();
        expect(paths.original).toEqual(buildSchedule(terms, []));
        expect(paths.real).toEqual(real.schedule);
        const metrics = compareSchedules(paths.original, paths.real);
        expect(metrics.currency).toBe(terms.currency);
        expect(metrics.netSaving).toBe(moneySub(paths.original.totals.totalPaid, paths.real.totals.totalPaid));
        expect(PathKind.ORIGINAL).toBe('ORIGINAL');
        // Una moneda distinta nunca se mezcla.
        const other = { ...paths.real, currency: terms.currency === 'GTQ' ? ('USD' as const) : ('GTQ' as const) };
        expect(() => compareSchedules(paths.original, other)).toThrow(CurrencyMismatchError);
      },
    ) as fc.IPropertyWithHooks<unknown[]>,
);

export const PROPERTIES: readonly PropertyDefinition[] = definitions;

/** Semilla fija de CI. Una falla se reproduce con la semilla que imprime fast-check (`runProperty(definition, seed)`). */
export const CI_SEED = 20_261_009;

export function runProperty(definition: PropertyDefinition, seed: number = CI_SEED): void {
  fc.assert(definition.build(), { seed, numRuns: definition.numRuns, verbose: 0 });
}

/** Resultado de correr una propiedad en cuarentena: `PASSING` obliga a sacarla de `properties-pending.json`. */
export function quarantineStatus(definition: PropertyDefinition, seed: number): 'FAILING' | 'PASSING' {
  return fc.check(definition.build(), { seed, numRuns: definition.numRuns }).failed ? 'FAILING' : 'PASSING';
}
