/**
 * Shapes of the landing example (W8-07). Types only: the generated data files import them with `import type`, so they
 * add nothing to any bundle. Every string is already formatted for display ('Q 1,234.56', '12.3 %', 'dd/mm/aaaa').
 */

/** The board at installment k of one path: balance after paying k, share of the principal paid, and the due date. */
export interface LandingExampleRow {
  readonly k: number;
  readonly balance: string;
  readonly paidPercent: string;
  readonly dueDate: string;
}

export interface LandingExampleSummary {
  readonly synthetic: true;
  /** Level installment of the example ('Q 4,263.47'). */
  readonly level: string;
  readonly prepayment: { readonly installment: 60; readonly amount: string };
  /** Installments without the prepayment (240). */
  readonly baseCount: number;
  /** Installments with the REDUCE_TERM prepayment. */
  readonly prepaidCount: number;
  readonly monthsSaved: number;
  /** Interest and insurance saved by the prepayment, formatted. */
  readonly costSaved: string;
  /** Initial state of the board. */
  readonly at60: LandingExampleRow;
  /** Breakdown of installment 1. */
  readonly first: {
    readonly interest: string;
    readonly insurance: string;
    readonly capital: string;
    readonly total: string;
  };
}

export interface LandingExampleRows {
  readonly base: readonly LandingExampleRow[];
  readonly prepaid: readonly LandingExampleRow[];
}
