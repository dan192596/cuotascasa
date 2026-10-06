import type { ActualPayment, BaseRecord, Loan, LoanEvent, ReportedBalance, Scenario, Uuid } from '@cuotascasa/schema';
import type { DataStoreRepositories, GetOptions, ListOptions, NewRecord } from '../ports.ts';

/*
 * Synthetic inputs for the contract suite. Values come from docs/algorithm.md [ALG.EXAMPLE]; names are invented.
 */
export function sampleLoan(): NewRecord<Loan> {
  return {
    name: 'Casa A',
    bank: 'Banco Ficticio',
    currency: 'GTQ',
    principal: '500000.00',
    termMonths: 240,
    disbursementDate: '2025-01-31',
    firstDueDate: '2025-02-28',
    paymentDay: 'END_OF_MONTH',
    interestRate: '0.07',
    rateType: 'VARIABLE',
    insuranceRates: ['0.01', '0.0026'],
    fixedCharges: [
      { label: 'IUSI', amount: '350.00', effectiveFrom: '2025-02-28' },
      { label: 'Seguro de daños', amount: '45.00', effectiveFrom: '2025-02-28' },
    ],
    roundingProfile: 'FHA_GT_V1',
    templateRef: { id: 'fha-gt', version: 1 },
    status: 'active',
  };
}

export function sampleEvent(loanId: Uuid): NewRecord<LoanEvent> {
  return { loanId, type: 'Prepayment', date: '2026-01-15', amount: '20000.00', mode: 'REDUCE_TERM' };
}

export function sampleReportedBalance(loanId: Uuid): NewRecord<ReportedBalance> {
  return { loanId, date: '2025-03-05', installmentNumber: 2, balance: '499178.20', source: 'BANK_EMAIL' };
}

export function samplePayment(loanId: Uuid): NewRecord<ActualPayment> {
  return { loanId, paidDate: '2025-02-27', installmentNumber: 1, total: '4658.47' };
}

export function sampleScenario(loanId: Uuid): NewRecord<Scenario> {
  return { loanId, name: 'Abono de enero', events: [] };
}

export type AnyRecord = BaseRecord & { readonly [field: string]: unknown };

/** Repository seen through `unknown` inputs so one case body can exercise every collection. */
export interface UntypedRepository {
  get(id: Uuid, options?: GetOptions): Promise<AnyRecord | undefined>;
  list(options?: ListOptions): Promise<AnyRecord[]>;
  create(input: unknown): Promise<AnyRecord>;
  update(input: unknown): Promise<AnyRecord>;
  delete(id: Uuid): Promise<AnyRecord>;
  listByLoan?(loanId: Uuid, options?: ListOptions): Promise<AnyRecord[]>;
}

export type RecordCollection = 'loans' | 'events' | 'reportedBalances' | 'payments' | 'scenarios';

export interface EntityDescriptor {
  readonly key: RecordCollection;
  readonly isLoanChild: boolean;
  repo(repositories: DataStoreRepositories): UntypedRepository;
  sample(loanId: Uuid): Record<string, unknown>;
  /** A sample with a number-typed money field; every write must reject it. */
  invalid(loanId: Uuid): Record<string, unknown>;
  /** The edit Repository.update receives: user fields of `record` with one field changed. */
  edit(record: AnyRecord): Record<string, unknown>;
}

export function userFields(record: AnyRecord): Record<string, unknown> {
  const { createdAt, updatedAt, updatedByDevice, deletedAt, ...rest } = record;
  void createdAt;
  void updatedAt;
  void updatedByDevice;
  void deletedAt;
  return rest;
}

function untyped(repository: object): UntypedRepository {
  return repository as UntypedRepository;
}

export const ENTITY_DESCRIPTORS: readonly EntityDescriptor[] = [
  {
    key: 'loans',
    isLoanChild: false,
    repo: (r) => untyped(r.loans),
    sample: () => sampleLoan(),
    invalid: () => ({ ...sampleLoan(), principal: 500000 }),
    edit: (record) => ({ ...userFields(record), name: 'Casa B' }),
  },
  {
    key: 'events',
    isLoanChild: true,
    repo: (r) => untyped(r.events),
    sample: (loanId) => sampleEvent(loanId),
    invalid: (loanId) => ({ ...sampleEvent(loanId), amount: 20000 }),
    edit: (record) => ({ ...userFields(record), note: 'Editado' }),
  },
  {
    key: 'reportedBalances',
    isLoanChild: true,
    repo: (r) => untyped(r.reportedBalances),
    sample: (loanId) => sampleReportedBalance(loanId),
    invalid: (loanId) => ({ ...sampleReportedBalance(loanId), balance: 499178.2 }),
    edit: (record) => ({ ...userFields(record), balance: '499000.00' }),
  },
  {
    key: 'payments',
    isLoanChild: true,
    repo: (r) => untyped(r.payments),
    sample: (loanId) => samplePayment(loanId),
    invalid: (loanId) => ({ ...samplePayment(loanId), total: 4658.47 }),
    edit: (record) => ({ ...userFields(record), total: '4700.00' }),
  },
  {
    key: 'scenarios',
    isLoanChild: true,
    repo: (r) => untyped(r.scenarios),
    sample: (loanId) => sampleScenario(loanId),
    invalid: (loanId) => ({
      ...sampleScenario(loanId),
      events: [{ id: 'x', type: 'Prepayment', date: '2026-01-31', amount: 1, mode: 'REDUCE_TERM', deletedAt: null }],
    }),
    edit: (record) => ({ ...userFields(record), name: 'Escenario editado' }),
  },
];
