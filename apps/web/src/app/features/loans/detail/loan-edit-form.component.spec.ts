import { TestBed } from '@angular/core/testing';
import {
  assertFirstDueDateConsistent,
  type FixedCharge,
  type LoanTerms,
  parseLocalDate,
  parseMoney,
  parsePaymentDay,
  parseRate,
} from '@cuotascasa/domain';
import type { Loan, Uuid } from '@cuotascasa/schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DataError,
  type LoanDraft,
  type LoanProjectionService,
  type LoansStore,
  type LoanUpdate,
} from '../../../data/api.ts';
import { LOAN_PROJECTION_SERVICE, LOANS_STORE } from '../../../data/tokens.ts';
import { Announcer } from '../../../ui/feedback/announcer.service.ts';
import { LoanEditFormComponent } from './loan-edit-form.component.ts';

const LOAN_ID = '00000000-0000-4000-8000-0000000000aa' as Uuid;

/** Synthetic loan with round figures. */
function loan(over: Partial<Loan> = {}): Loan {
  return {
    id: LOAN_ID,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    updatedByDevice: '00000000-0000-4000-8000-0000000000bb',
    deletedAt: null,
    name: 'Casa A',
    bank: 'Banco Ficticio',
    currency: 'GTQ',
    principal: '500000.00',
    termMonths: 240,
    disbursementDate: '2026-12-15',
    firstDueDate: '2027-01-31',
    paymentDay: 'END_OF_MONTH',
    interestRate: '0.07',
    insuranceRates: ['0.01', '0.0026'],
    fixedCharges: [],
    roundingProfile: 'FHA_GT_V1',
    rateType: 'VARIABLE',
    templateRef: { id: 'fha-gt', version: 1 },
    status: 'active',
    ...over,
  } as Loan;
}

class FakeLoansStore implements Partial<LoansStore> {
  readonly updates: LoanUpdate[] = [];
  failWith: Error | null = null;

  update(update: LoanUpdate): Promise<Loan> {
    if (this.failWith) return Promise.reject(this.failWith);
    this.updates.push(update);
    return Promise.resolve({ ...loan(), ...update } as Loan);
  }
}

function toLoanTerms(draft: LoanDraft): LoanTerms {
  const paymentDay = parsePaymentDay(draft.paymentDay);
  const firstDueDate = parseLocalDate(draft.firstDueDate);
  assertFirstDueDateConsistent(firstDueDate, paymentDay);
  const fixedCharges: FixedCharge[] = draft.fixedCharges.map((charge) => ({
    label: charge.label,
    amount: parseMoney(charge.amount),
    effectiveFrom: parseLocalDate(charge.effectiveFrom),
  }));
  return {
    principal: parseMoney(draft.principal),
    termMonths: draft.termMonths,
    disbursementDate: parseLocalDate(draft.disbursementDate),
    firstDueDate,
    paymentDay,
    currency: draft.currency,
    interestRate: parseRate(draft.interestRate),
    insuranceRates: draft.insuranceRates.map((value) => parseRate(value)),
    fixedCharges,
    roundingProfile: draft.roundingProfile,
    rateType: draft.rateType,
  };
}

async function setup(options: { readonly loan?: Loan; readonly locked?: boolean } = {}) {
  const store = new FakeLoansStore();
  TestBed.configureTestingModule({
    providers: [
      { provide: LOANS_STORE, useValue: store },
      { provide: LOAN_PROJECTION_SERVICE, useValue: { toLoanTerms } as unknown as LoanProjectionService },
    ],
  });
  const announce = vi.spyOn(TestBed.inject(Announcer), 'polite').mockResolvedValue();
  const fixture = TestBed.createComponent(LoanEditFormComponent);
  fixture.componentRef.setInput('loan', options.loan ?? loan());
  fixture.componentRef.setInput('currencyLocked', options.locked ?? false);
  const saved = vi.fn();
  const cancelled = vi.fn();
  fixture.componentInstance.saved.subscribe(saved);
  fixture.componentInstance.cancelled.subscribe(cancelled);
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector);
  const field = (id: string) =>
    q<HTMLInputElement & HTMLSelectElement>(`#${id}`) as HTMLInputElement & HTMLSelectElement;
  const settle = () => fixture.whenStable();
  const type = async (id: string, text: string) => {
    const input = field(id);
    input.value = text;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    await settle();
  };
  const click = async (label: string) => {
    const target = [...root.querySelectorAll('button')].find((candidate) => candidate.textContent?.includes(label));
    if (!target) throw new Error(`No button «${label}»`);
    target.click();
    await settle();
  };
  const submit = async () => {
    q<HTMLFormElement>('form')?.requestSubmit();
    await settle();
    await settle();
  };
  return { fixture, store, root, q, field, type, click, submit, settle, saved, cancelled, announce };
}

beforeEach(() => TestBed.resetTestingModule());

describe('LoanEditFormComponent', () => {
  it('shows the stored values in the reused step components', async () => {
    const { field, root } = await setup();
    expect(field('name').value).toBe('Casa A');
    expect(field('bank').value).toBe('Banco Ficticio');
    expect(field('principal').value).toBe('500,000.00');
    expect(field('termMonths').value).toBe('240');
    expect(field('interestRate').value).toBe('7');
    expect(field('paymentDay').value).toBe('END_OF_MONTH');
    expect(field('firstDueDate').value).toBe('31/01/2027');
    expect(field('insurance-1-rate').value).toBe('0.26');
    expect(root.querySelector('label[for="insurance-1-rate"]')?.textContent).toContain('Desgravamen');
  });

  it('saving an untouched form writes the same terms, with the same id and status', async () => {
    const { submit, store, saved } = await setup({ loan: loan({ status: 'paid' }) });
    await submit();
    expect(store.updates).toHaveLength(1);
    const update = store.updates[0] as LoanUpdate;
    expect(update).toMatchObject({
      id: LOAN_ID,
      status: 'paid',
      name: 'Casa A',
      principal: '500000.00',
      termMonths: 240,
      interestRate: '0.07',
      insuranceRates: ['0.01', '0.0026'],
      paymentDay: 'END_OF_MONTH',
      firstDueDate: '2027-01-31',
      fixedCharges: [],
      templateRef: { id: 'fha-gt', version: 1 },
    });
    expect(saved).toHaveBeenCalledTimes(1);
  });

  it('editing the principal saves the new figure and announces it politely', async () => {
    const { type, submit, store, announce } = await setup();
    await type('principal', '600000');
    await submit();
    expect((store.updates[0] as LoanUpdate).principal).toBe('600000.00');
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce.mock.calls[0]?.[0]).toContain('Cambios guardados');
  });

  it('keeps fixed charges when the principal changes: the bank total follows the new level', async () => {
    const charges = [
      { label: 'IUSI', amount: '250.00', effectiveFrom: '2027-01-31' },
      { label: 'Seguro de daños', amount: '145.00', effectiveFrom: '2027-01-31' },
    ] as Loan['fixedCharges'];
    const { type, submit, store, q } = await setup({ loan: loan({ fixedCharges: charges }) });
    await type('principal', '600000');
    expect(q('[data-testid="fixed-error"]')).toBeNull();
    await submit();
    const update = store.updates[0] as LoanUpdate;
    expect(update.fixedCharges.map((charge) => [charge.label, charge.amount])).toEqual([
      ['IUSI', '250.00'],
      ['Seguro de daños', '145.00'],
    ]);
  });

  it('a blank alias blocks saving, shows the Spanish message and focuses the field', async () => {
    const { type, submit, store, q, field } = await setup();
    await type('name', '');
    await submit();
    expect(store.updates).toHaveLength(0);
    expect(q('#name-errors')?.textContent).toContain('Escribe un alias');
    expect(document.activeElement).toBe(field('name'));
  });

  it('an invalid first due date for the payment day blocks saving', async () => {
    const { type, submit, store, q } = await setup();
    await type('firstDueDate', '15/01/2027');
    await submit();
    expect(store.updates).toHaveLength(0);
    expect(q('#firstDueDate-errors, [data-testid="engine-error"], .cc-wiz-errors')).not.toBeNull();
  });

  it('shows the currency as a select while the loan has no child records', async () => {
    const { field } = await setup({ locked: false });
    expect(field('currency').tagName).toBe('SELECT');
  });

  it('shows the currency as fixed text with its reason once the loan has child records', async () => {
    const { q } = await setup({ locked: true });
    expect(q('select#currency')).toBeNull();
    expect(q('[data-testid="currency-locked"]')?.textContent).toContain('Quetzales (GTQ)');
    expect(q('[data-testid="currency-locked"]')?.textContent).toContain('no se puede cambiar');
  });

  it('a failed write shows a Spanish error from the code, does not emit saved and keeps the form', async () => {
    const { type, submit, store, q, saved, field } = await setup();
    store.failWith = new DataError('CURRENCY_LOCKED', 'secret 123.45');
    await type('principal', '600000');
    await submit();
    expect(saved).not.toHaveBeenCalled();
    const alert = q('[data-testid="save-error"]');
    expect(alert?.textContent).toContain('moneda');
    expect(alert?.textContent).not.toContain('123.45');
    expect(field('principal').value).toMatch(/^600,?000/);
  });

  it('cancel emits cancelled and writes nothing', async () => {
    const { click, store, cancelled } = await setup();
    await click('Cancelar');
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(store.updates).toHaveLength(0);
  });

  it('recomputes the level preview when the conditions change', async () => {
    const { type, q } = await setup({
      loan: loan({
        fixedCharges: [{ label: 'IUSI', amount: '250.00', effectiveFrom: '2027-01-31' }] as Loan['fixedCharges'],
      }),
    });
    const before = q('[data-testid="level"]')?.textContent;
    await type('principal', '600000');
    expect(q('[data-testid="level"]')?.textContent).not.toBe(before);
  });
});
