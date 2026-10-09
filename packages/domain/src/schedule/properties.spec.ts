import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createEngineContext } from '../engine-context.ts';
import { moneySub, moneySum, parseMoney, parseRate } from '../money/index.ts';
import type { RoundingProfile } from '../types/primitives.ts';
import { buildSchedule } from './index.ts';
import { shortTerms } from './testing/builders.ts';

const ctx = createEngineContext();

const loanArbitrary = fc.record({
  cents: fc.integer({ min: 1_000, max: 50_000_000 }),
  termMonths: fc.integer({ min: 1, max: 60 }),
  interestBasisPoints: fc.integer({ min: 0, max: 2_500 }),
  insuranceBasisPoints: fc.array(fc.integer({ min: 0, max: 300 }), { maxLength: 3 }),
  roundingProfile: fc.constantFrom<RoundingProfile>('FHA_GT_V1', 'SIMPLE'),
});

function basisPointsToRate(basisPoints: number) {
  return parseRate((basisPoints / 10_000).toFixed(4));
}

describe('schedule invariants (generated synthetic loans)', () => {
  it('capital adds up to the principal, balances chain, and every row adds up', () => {
    fc.assert(
      fc.property(loanArbitrary, (loan) => {
        const principal = parseMoney((loan.cents / 100).toFixed(2));
        const terms = shortTerms({
          principal,
          termMonths: loan.termMonths,
          interestRate: basisPointsToRate(loan.interestBasisPoints),
          insuranceRates: loan.insuranceBasisPoints.map(basisPointsToRate),
          roundingProfile: loan.roundingProfile,
        });
        const { rows, totals, installmentCount } = buildSchedule(terms, [], ctx);
        expect(installmentCount).toBe(rows.length);
        expect(rows.length).toBeLessThanOrEqual(loan.termMonths);
        expect(rows.length).toBeGreaterThanOrEqual(1);
        expect(totals.capital).toBe(principal);
        expect(rows[rows.length - 1]?.closing).toBe('0.00');
        rows.forEach((row, index) => {
          expect(row.k).toBe(index + 1);
          expect(row.isLast).toBe(index === rows.length - 1);
          expect(row.opening).toBe(index === 0 ? principal : rows[index - 1]?.closing);
          expect(row.closing).toBe(moneySub(row.opening, row.capital));
          expect(row.insurance).toBe(moneySum(row.insuranceComponents));
          expect(row.insuranceComponents).toHaveLength(terms.insuranceRates.length);
          expect(row.total).toBe(moneySum([row.capital, row.interest, row.insurance, row.fixedCharges]));
          if (!row.isLast) {
            expect(moneySum([row.capital, row.interest, row.insurance])).toBe(row.level);
          }
        });
        expect(totals.interest).toBe(moneySum(rows.map((row) => row.interest)));
        expect(totals.totalPaid).toBe(totals.total);
      }),
      { numRuns: 60 },
    );
  }, 30_000);
});
