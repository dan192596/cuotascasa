import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import {
  assertFirstDueDateConsistent,
  type FixedCharge,
  InvalidInputError,
  listTemplates,
  type LoanTerms,
  type Money,
  moneyAdd,
  moneySub,
  parseLocalDate,
  parseMoney,
  parsePaymentDay,
  parseRate,
} from '@cuotascasa/domain';
import type { Loan, ReportedBalance, Uuid } from '@cuotascasa/schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type AnchorDraft,
  DataError,
  type LoanDraft,
  type LoanProjectionService,
  type LoansStore,
} from '../../../data/api.ts';
import { LOAN_PROJECTION_SERVICE, LOANS_STORE } from '../../../data/tokens.ts';
import { LoanWizardPageComponent } from './loan-wizard-page.component.ts';

const LOAN_ID = '00000000-0000-4000-8000-0000000000aa' as Uuid;
const STAMPS = {
  id: LOAN_ID,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  updatedByDevice: '00000000-0000-4000-8000-0000000000bb' as Uuid,
  deletedAt: null,
} as const;

/**
 * LoansStore double with a real two-phase `createWithAnchor`: the loan is written, then the anchor write may fail,
 * and the whole transaction rolls back (ADR-0005). `loans()` is what a reader of the store would see. (The real
 * store cannot be mounted from a feature spec: the lint matrix forbids data/ implementations there.)
 */
class FakeLoansStore implements Partial<LoansStore> {
  readonly ready = signal(true).asReadonly();
  private readonly stored = signal<readonly Loan[]>([]);
  readonly loans = this.stored.asReadonly();
  readonly written: { readonly loan: LoanDraft; readonly anchor: AnchorDraft | null }[] = [];
  /** Fails the first write phase (the loan). */
  failWith: Error | null = null;
  /** Fails the second phase (the anchor) after the loan was written. */
  failAnchorWith: Error | null = null;

  create(draft: LoanDraft): Promise<Loan> {
    if (this.failWith) return Promise.reject(this.failWith);
    const loan = { ...draft, ...STAMPS } as Loan;
    this.stored.update((current) => [...current, loan]);
    this.written.push({ loan: draft, anchor: null });
    return Promise.resolve(loan);
  }

  createWithAnchor(draft: LoanDraft, anchor: AnchorDraft) {
    if (this.failWith) return Promise.reject(this.failWith);
    const loan = { ...draft, ...STAMPS } as Loan;
    this.stored.update((current) => [...current, loan]);
    if (this.failAnchorWith) {
      const failure = this.failAnchorWith;
      this.stored.update((current) => current.filter((candidate) => candidate !== loan));
      return Promise.reject(failure);
    }
    this.written.push({ loan: draft, anchor });
    return Promise.resolve({ loan, anchor: { ...anchor, ...STAMPS, loanId: LOAN_ID } as ReportedBalance });
  }
}

/** Test double of the facade's toLoanTerms (data/ is off limits to features): the same domain parsers. */
function toLoanTerms(loan: LoanDraft): LoanTerms {
  const paymentDay = parsePaymentDay(loan.paymentDay);
  const firstDueDate = parseLocalDate(loan.firstDueDate);
  assertFirstDueDateConsistent(firstDueDate, paymentDay);
  const fixedCharges: FixedCharge[] = loan.fixedCharges.map((charge) => ({
    label: charge.label,
    amount: parseMoney(charge.amount),
    effectiveFrom: parseLocalDate(charge.effectiveFrom),
  }));
  return {
    principal: parseMoney(loan.principal),
    termMonths: loan.termMonths,
    disbursementDate: parseLocalDate(loan.disbursementDate),
    firstDueDate,
    paymentDay,
    currency: loan.currency,
    interestRate: parseRate(loan.interestRate),
    insuranceRates: loan.insuranceRates.map((value) => parseRate(value)),
    fixedCharges,
    roundingProfile: loan.roundingProfile,
    rateType: loan.rateType,
  };
}

/** 'Q 1,234.50' → '1234.50' (string work only). */
const plain = (shown: string): Money => parseMoney(shown.replace(/[^\d.]/g, ''));

function projectionOf(convert: typeof toLoanTerms): LoanProjectionService {
  return { toLoanTerms: convert } as unknown as LoanProjectionService;
}

async function setup(options: { readonly toLoanTerms?: typeof toLoanTerms } = {}) {
  const store = new FakeLoansStore();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: LOANS_STORE, useValue: store },
      { provide: LOAN_PROJECTION_SERVICE, useValue: projectionOf(options.toLoanTerms ?? toLoanTerms) },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(LoanWizardPageComponent);
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector);
  const field = (id: string) =>
    q<HTMLInputElement & HTMLSelectElement>(`#${id}`) as HTMLInputElement & HTMLSelectElement;
  const heading = () => q('h2')?.textContent ?? '';
  const settle = () => fixture.whenStable();
  const type = async (id: string, text: string) => {
    const input = field(id);
    input.value = text;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    await settle();
  };
  const choose = async (id: string, value: string) => {
    const select = field(id);
    select.value = value;
    select.dispatchEvent(new Event('input'));
    select.dispatchEvent(new Event('change'));
    select.dispatchEvent(new Event('blur'));
    await settle();
  };
  const button = (label: string) =>
    [...root.querySelectorAll('button')].find((candidate) => candidate.textContent?.includes(label)) as
      HTMLButtonElement | undefined;
  const click = async (label: string) => {
    const target = button(label);
    if (!target) throw new Error(`No button «${label}»`);
    target.click();
    await settle();
  };
  const errors = (id: string) => [...root.querySelectorAll(`#${id}-errors li`)].map((li) => li.textContent?.trim());
  const text = (testId: string) => q(`[data-testid="${testId}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const step1 = async () => {
    await type('name', 'Casa de prueba');
    await click('Siguiente');
  };
  const step2 = async (overrides: { term?: string; rate?: string } = {}) => {
    await type('principal', '500000');
    await type('termMonths', overrides.term ?? '240');
    await type('interestRate', overrides.rate ?? '7');
    await type('firstDueDate', '31/01/2027');
    await type('disbursementDate', '15/12/2026');
    await click('Siguiente');
  };
  const toStep3 = async () => {
    await step1();
    await step2();
  };
  const toStep4 = async () => {
    await toStep3();
    await click('Siguiente');
  };
  return {
    fixture,
    store,
    navigate,
    root,
    q,
    field,
    heading,
    type,
    choose,
    click,
    button,
    errors,
    text,
    settle,
    step1,
    step2,
    toStep3,
    toStep4,
  };
}

beforeEach(() => TestBed.resetTestingModule());

describe('LoanWizardPageComponent · shell', () => {
  it('keeps the page test id and has no stub marker', async () => {
    const { root } = await setup();
    expect(root.getAttribute('data-testid')).toBe('page-loan-new');
    expect(root.hasAttribute('data-cc-stub')).toBe(false);
  });

  it('starts on step 1 without moving focus, then focuses the heading on every step change', async () => {
    const { heading, root, type, click } = await setup();
    expect(heading()).toContain('Paso 1 de 4');
    expect(document.activeElement).not.toBe(root.querySelector('h2'));
    await type('name', 'Casa de prueba');
    await click('Siguiente');
    expect(heading()).toContain('Paso 2 de 4');
    // The focused heading is the announcement: no live region repeats «Paso N de 4».
    expect([...root.querySelectorAll('[aria-live]')].some((node) => node.textContent?.includes('Paso'))).toBe(false);
    expect(document.activeElement).toBe(root.querySelector('h2'));
  });

  it('marks the step container with the direction of travel and slides it ±24 px', async () => {
    const { root, q, type, click } = await setup();
    const container = () => q('[data-testid="wizard-step"]');
    expect(container()?.getAttribute('data-direction')).toBe('forward');
    await type('name', 'Casa de prueba');
    await click('Siguiente');
    expect(container()?.getAttribute('data-direction')).toBe('forward');
    await click('Atrás');
    expect(container()?.getAttribute('data-direction')).toBe('back');
    const css = [...document.head.querySelectorAll('style')].map((s) => s.textContent).join('\n');
    expect(css).toContain('translateX(24px)');
    expect(css).toContain('translateX(-24px)');
    expect(root.querySelector('[data-testid="wizard-step"] form')).not.toBeNull();
  });

  it('an invalid step blocks advancing, shows Spanish messages and focuses the first invalid field', async () => {
    const { heading, click, errors, field } = await setup();
    await click('Siguiente');
    expect(heading()).toContain('Paso 1 de 4');
    expect(errors('name')).toEqual(['Escribe un alias para identificar el préstamo.']);
    expect(field('name').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(field('name'));
  });

  it('Enter in a field of an intermediate step runs that step «Siguiente»', async () => {
    const { heading, field, type, settle } = await setup();
    await type('name', 'Casa de prueba');
    field('name').form?.requestSubmit();
    await settle();
    expect(heading()).toContain('Paso 2 de 4');
  });

  it('going back keeps what was typed in every step', async () => {
    const { field, click, heading, toStep3, type } = await setup();
    await toStep3();
    await type('bankTotal', '4271.49');
    await click('Atrás');
    expect(heading()).toContain('Paso 2 de 4');
    expect(field('principal').value).toBe('500,000.00');
    expect(field('termMonths').value).toBe('240');
    expect(field('interestRate').value).toBe('7');
    expect(field('firstDueDate').value).toBe('31/01/2027');
    await click('Siguiente');
    expect(field('bankTotal').value).toBe('4,271.49');
    await click('Atrás');
    await click('Atrás');
    expect(field('name').value).toBe('Casa de prueba');
  });
});

describe('step 1 · template and bank', () => {
  it('bank is free text (no preloaded list) and the template select offers the catalog', async () => {
    const { root, field } = await setup();
    expect(field('bank').tagName).toBe('INPUT');
    expect(root.querySelector('datalist')).toBeNull();
    const options = [...field('template').querySelectorAll('option')].map((option) => option.textContent?.trim());
    expect(options).toEqual(listTemplates().map((template) => template.name));
  });

  it('copies the template into step 2 (fha-gt@1: rows, profile, end of month, VARIABLE) and stores the templateRef', async () => {
    const { toStep3, click, field, store, root } = await setup();
    await toStep3();
    await click('Atrás');
    expect(field('insurance-0-rate').value).toBe('1');
    expect(field('insurance-1-rate').value).toBe('0.26');
    expect(root.querySelector('label[for="insurance-0-rate"]')?.textContent).toContain(
      'Seguro FHA / seguro de hipoteca',
    );
    expect(root.querySelector('label[for="insurance-1-rate"]')?.textContent).toContain('Desgravamen');
    expect(field('roundingProfile').value).toBe('FHA_GT_V1');
    expect(field('paymentDay').value).toBe('END_OF_MONTH');
    expect(field('rateType').value).toBe('VARIABLE');
    await click('Siguiente');
    await click('Siguiente');
    await click('Guardar préstamo');
    expect(store.written[0]?.loan.templateRef).toEqual({ id: 'fha-gt', version: 1 });
  });

  it('editing the copy leaves the template unchanged', async () => {
    const { toStep3, click, type, store } = await setup();
    const before = JSON.stringify(listTemplates());
    await toStep3();
    await click('Atrás');
    await type('insurance-0-rate', '2');
    expect(JSON.stringify(listTemplates())).toBe(before);
    await click('Siguiente');
    await click('Siguiente');
    await click('Guardar préstamo');
    expect(store.written[0]?.loan.insuranceRates).toEqual(['0.02', '0.0026']);
  });

  it('choosing the simple template swaps the copied values and leaves rateType to the user', async () => {
    const { choose, type, click, field, heading } = await setup();
    await type('name', 'Casa de prueba');
    await choose('template', 'simple@1');
    await click('Siguiente');
    expect(heading()).toContain('Paso 2 de 4');
    expect(field('roundingProfile').value).toBe('SIMPLE');
    expect(field('rateType').value).toBe('VARIABLE');
    expect(field('insurance-0-rate')).toBeNull();
  });
});

describe('step 2 · original conditions', () => {
  async function atStep2() {
    const ctx = await setup();
    await ctx.step1();
    return ctx;
  }

  it.each([
    ['', true],
    ['0', true],
    ['-1', true],
    ['0.01', false],
  ])('principal %j blocked=%s', async (typed, blocked) => {
    const { type, errors, field } = await atStep2();
    await type('principal', typed);
    if (blocked) {
      expect(errors('principal').length).toBe(1);
      expect(errors('principal')[0]).toMatch(/monto/i);
    } else {
      expect(field('principal').getAttribute('aria-invalid')).toBe('false');
    }
  });

  it.each([
    ['0', true],
    ['1.5', true],
    ['abc', true],
    ['1', false],
    ['360', false],
  ])('termMonths %j blocked=%s', async (typed, blocked) => {
    const { type, errors, field } = await atStep2();
    await type('termMonths', typed);
    expect(field('termMonths').getAttribute('aria-invalid')).toBe(String(blocked));
    if (blocked) expect(errors('termMonths')[0]).toContain('número entero de meses');
  });

  it('interestRate: negative rejected; 0 and a positive decimal accepted; the rate is typed as a percent', async () => {
    const { type, errors, field } = await atStep2();
    await type('interestRate', '-1');
    expect(errors('interestRate')).toEqual(['La tasa no puede ser negativa.']);
    await type('interestRate', '0');
    expect(field('interestRate').getAttribute('aria-invalid')).toBe('false');
    await type('interestRate', '7.25');
    expect(field('interestRate').getAttribute('aria-invalid')).toBe('false');
    await type('interestRate', '7.12345');
    expect(errors('interestRate')).toEqual(['Usa como máximo 4 decimales.']);
  });

  it('stores 7.25 as 0.0725 and 1.26 as 0.0126 by exact shift', async () => {
    const { toStep3, click, type, store } = await setup();
    await toStep3();
    await click('Atrás');
    await type('interestRate', '7.25');
    await type('insurance-0-rate', '1.26');
    await click('Siguiente');
    await click('Siguiente');
    await click('Guardar préstamo');
    expect(store.written[0]?.loan.interestRate).toBe('0.0725');
    expect(store.written[0]?.loan.insuranceRates[0]).toBe('0.0126');
  });

  it('rateType is required: without FIXED or VARIABLE the step does not advance; simple leaves it empty', async () => {
    const { choose, type, click, heading, errors } = await setup();
    await type('name', 'Casa de prueba');
    await choose('template', 'simple@1');
    await click('Siguiente');
    // simple@1 keeps the VARIABLE that fha-gt@1 had preloaded; clear it as a user would.
    await choose('rateType', '');
    await type('principal', '500000');
    await type('termMonths', '240');
    await type('interestRate', '7');
    await type('firstDueDate', '31/01/2027');
    await type('disbursementDate', '15/12/2026');
    await click('Siguiente');
    expect(heading()).toContain('Paso 2 de 4');
    expect(errors('rateType')).toEqual(['Elige si la tasa es fija o variable.']);
    await choose('rateType', 'FIXED');
    await click('Siguiente');
    expect(heading()).toContain('Paso 3 de 4');
  });

  it('firstDueDate: an impossible date is rejected; a valid one is stored as AAAA-MM-DD', async () => {
    const { type, errors, click, store, field, heading } = await atStep2();
    await type('principal', '500000');
    await type('termMonths', '240');
    await type('interestRate', '7');
    await type('disbursementDate', '15/12/2026');
    await type('firstDueDate', '31/02/2027');
    expect(errors('firstDueDate')).toEqual(['Esa fecha no existe en el calendario.']);
    await click('Siguiente');
    expect(heading()).toContain('Paso 2 de 4');
    await type('firstDueDate', '31/01/2027');
    expect(field('firstDueDate').getAttribute('aria-invalid')).toBe('false');
    await click('Siguiente');
    await click('Siguiente');
    await click('Guardar préstamo');
    expect(store.written[0]?.loan.firstDueDate).toBe('2027-01-31');
  });

  it('disbursementDate: after firstDueDate is rejected, equal accepted, and it does not change the schedule', async () => {
    const { type, errors, field, text, toStep3, click } = await setup();
    await toStep3();
    const level = text('level');
    await click('Atrás');
    await type('disbursementDate', '01/02/2027');
    expect(errors('disbursementDate')).toEqual(['La fecha de desembolso no puede ser posterior a la primera cuota.']);
    await type('disbursementDate', '31/01/2027');
    expect(field('disbursementDate').getAttribute('aria-invalid')).toBe('false');
    await type('disbursementDate', '01/01/2020');
    await click('Siguiente');
    expect(text('level')).toBe(level);
  });

  it('insurance rows: negative and non-numeric rejected, 0 accepted, rows removable, «otro seguro %» addable', async () => {
    const { type, errors, field, click, root, toStep3, heading } = await setup();
    await toStep3();
    await click('Atrás');
    await type('insurance-0-rate', '-1');
    expect(errors('insurance-0-rate')).toEqual(['La tasa no puede ser negativa.']);
    await type('insurance-0-rate', 'abc');
    expect(errors('insurance-0-rate')[0]).toContain('solo con números');
    await type('insurance-0-rate', '0');
    expect(field('insurance-0-rate').getAttribute('aria-invalid')).toBe('false');
    (root.querySelector('[data-testid="insurance-remove-1"]') as HTMLButtonElement).click();
    await click('Agregar otro seguro %');
    expect(field('insurance-1-rate')).not.toBeNull();
    expect(root.querySelector('label[for="insurance-1-rate"]')?.textContent).toContain('Otro seguro %');
    await type('insurance-1-rate', '0.5');
    await click('Siguiente');
    expect(heading()).toContain('Paso 3 de 4');
  });

  it('an added insurance row left empty blocks «Siguiente» and shows its message after the attempt', async () => {
    const { toStep3, click, errors, heading, field } = await setup();
    await toStep3();
    await click('Atrás');
    await click('Agregar otro seguro %');
    await click('Siguiente');
    expect(heading()).toContain('Paso 2 de 4');
    expect(errors('insurance-2-rate')).toEqual(['Escribe la tasa del seguro. Escribe 0 si no aplica.']);
    expect(document.activeElement).toBe(field('insurance-2-rate'));
  });

  it('hints are linked to their controls with aria-describedby', async () => {
    const { root } = await atStep2Page();
    for (const id of ['interestRate', 'firstDueDate']) {
      const hint = root.querySelector(`#${id}-hint`);
      expect(hint?.textContent?.trim().length).toBeGreaterThan(0);
      const group = root.querySelector(`[aria-describedby~="${id}-hint"]`);
      expect(group, id).not.toBeNull();
      expect(group?.querySelector(`#${id}`)).not.toBeNull();
    }
  });

  it('roundingProfile offers exactly FHA_GT_V1 and SIMPLE, preloaded from the template, and is required', async () => {
    const { field, choose, click, heading, errors } = await atStep2Page();
    const values = [...field('roundingProfile').querySelectorAll('option')].map((option) => option.value);
    expect(values).toEqual(['FHA_GT_V1', 'SIMPLE']);
    expect(field('roundingProfile').value).toBe('FHA_GT_V1');
    await choose('roundingProfile', '');
    await click('Siguiente');
    expect(heading()).toContain('Paso 2 de 4');
    expect(errors('roundingProfile')).toEqual(['Elige el perfil de redondeo.']);
  });

  it('changing paymentDay re-derives the day of firstDueDate in both directions ([ALG.DATES])', async () => {
    const { type, choose, field } = await atStep2Page();
    await choose('paymentDay', '15');
    await type('firstDueDate', '15/03/2027');
    await choose('paymentDay', 'END_OF_MONTH');
    expect(field('firstDueDate').value).toBe('31/03/2027');
    await choose('paymentDay', '15');
    expect(field('firstDueDate').value).toBe('15/03/2027');
  });

  it('an inconsistent paymentDay/firstDueDate pair is rejected with a Spanish message and blocks advancing', async () => {
    const { type, errors, click, heading } = await atStep2Page();
    await type('principal', '500000');
    await type('termMonths', '240');
    await type('interestRate', '7');
    await type('disbursementDate', '15/12/2026');
    await type('firstDueDate', '15/03/2027');
    expect(errors('firstDueDate')[0]).toContain('no coincide con el día de pago');
    await click('Siguiente');
    expect(heading()).toContain('Paso 2 de 4');
  });

  it('interestRate 0 with every insurance rate at 0 is allowed ([ALG.ZERO])', async () => {
    const { type, click, heading, text } = await atStep2Page();
    await type('principal', '120000');
    await type('termMonths', '120');
    await type('interestRate', '0');
    await type('insurance-0-rate', '0');
    await type('insurance-1-rate', '0');
    await type('firstDueDate', '31/01/2027');
    await type('disbursementDate', '15/12/2026');
    await click('Siguiente');
    expect(heading()).toContain('Paso 3 de 4');
    expect(text('level')).toBe('Q 1,000.00');
  });

  it('shows a typed engine error by code (never its message) and blocks the step', async () => {
    const { step1, type, click, text, heading } = await setup({
      toLoanTerms: () => {
        throw new InvalidInputError('INVALID_TERMS', 'principal Q 999,999.99 is wrong');
      },
    });
    await step1();
    await type('principal', '500000');
    await type('termMonths', '240');
    await type('interestRate', '7');
    await type('firstDueDate', '31/01/2027');
    await type('disbursementDate', '15/12/2026');
    expect(text('engine-error')).toContain('Las condiciones del préstamo no son válidas');
    expect(text('engine-error')).not.toContain('999');
    await click('Siguiente');
    expect(heading()).toContain('Paso 2 de 4');
  });
});

async function atStep2Page() {
  const ctx = await setup();
  await ctx.step1();
  return ctx;
}

describe('step 3 · fixed charges', () => {
  it('shows the level from levelPayment and recalculates fixed charges live', async () => {
    const { toStep3, type, text, root } = await setup();
    await toStep3();
    const levelText = text('level');
    expect(levelText).toMatch(/^Q [\d,]+\.\d{2}$/);
    expect(text('fixed-total')).toBe('Q 0.00');
    await type('bankTotal', '5,000');
    const expected = moneySub('5000.00' as Money, plain(levelText));
    expect(plain(text('fixed-total'))).toBe(expected);
    expect(root.querySelector('[data-testid="fixed-error"]')).toBeNull();
  });

  it('a bank total below the level shows an error and blocks advancing', async () => {
    const { toStep3, type, text, click, heading, root } = await setup();
    await toStep3();
    await type('bankTotal', '100');
    expect(text('fixed-error')).toContain('menor que la cuota nivelada');
    await click('Siguiente');
    expect(heading()).toContain('Paso 3 de 4');
    expect(root.querySelector('[data-testid="fixed-total"]')).not.toBeNull();
  });

  it('an empty bank total stores no fixed charges', async () => {
    const { toStep4, click, store } = await setup();
    await toStep4();
    await click('Guardar préstamo');
    expect(store.written[0]?.loan.fixedCharges).toEqual([]);
  });

  it('stores the derived charges with effectiveFrom = firstDueDate (one «Cargos fijos» line without a breakdown)', async () => {
    const { toStep3, type, text, click, store } = await setup();
    await toStep3();
    await type('bankTotal', moneyAdd(plain(text('level')), '395.00' as Money));
    expect(text('fixed-total')).toBe('Q 395.00');
    await click('Siguiente');
    await click('Guardar préstamo');
    expect(store.written[0]?.loan.fixedCharges).toEqual([
      { label: 'Cargos fijos', amount: '395.00', effectiveFrom: '2027-01-31' },
    ]);
  });

  it('named lines must sum to total − level: a Spanish error blocks advancing, then they are stored', async () => {
    const { toStep3, type, text, click, heading, store, root } = await setup();
    await toStep3();
    await type('bankTotal', moneyAdd(plain(text('level')), '395.00' as Money));
    await click('Agregar concepto');
    await type('charge-0-label', 'IUSI');
    await type('charge-0-amount', '350');
    expect(text('fixed-error')).toContain('deben sumar');
    await click('Siguiente');
    expect(heading()).toContain('Paso 3 de 4');
    await click('Agregar concepto');
    await type('charge-1-label', 'Seguro de daños');
    await type('charge-1-amount', '45');
    expect(root.querySelector('[data-testid="fixed-error"]')).toBeNull();
    await click('Siguiente');
    expect(heading()).toContain('Paso 4 de 4');
    await click('Guardar préstamo');
    expect(store.written[0]?.loan.fixedCharges).toEqual([
      { label: 'IUSI', amount: '350.00', effectiveFrom: '2027-01-31' },
      { label: 'Seguro de daños', amount: '45.00', effectiveFrom: '2027-01-31' },
    ]);
  });
});

describe('step 4 · optional anchor and validation', () => {
  it('is optional: without a balance the loan is created with create(), no ReportedBalance, chip «Sin validar»', async () => {
    const { toStep4, text, click, store, navigate } = await setup();
    await toStep4();
    expect(text('chip-status')).toContain('Sin validar');
    await click('Guardar préstamo');
    expect(store.written).toHaveLength(1);
    expect(store.written[0]?.anchor).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/app', 'prestamos', LOAN_ID]);
  });

  it('entering a balance requires the installment number', async () => {
    const { toStep4, type, click, errors, store } = await setup();
    await toStep4();
    await type('anchorBalance', '500000');
    await click('Guardar préstamo');
    expect(errors('anchorK')).toEqual(['Indica la cuota a la que corresponde el saldo (antes de pagarla).']);
    expect(store.written).toHaveLength(0);
  });

  it.each(['0', '241'])('k = %s shows the Spanish message of the typed domain error and blocks saving', async (k) => {
    const { toStep4, type, click, text, store } = await setup();
    await toStep4();
    await type('anchorBalance', '500000');
    await type('anchorK', k);
    expect(text('anchor-error')).toBe('La cuota debe estar entre 1 y 240.');
    await click('Guardar préstamo');
    expect(store.written).toHaveLength(0);
  });

  it('the date defaults to the due date of k and stays editable', async () => {
    const { toStep4, type, field } = await setup();
    await toStep4();
    await type('anchorBalance', '500000');
    await type('anchorK', '2');
    expect(field('anchorDate').value).toBe('28/02/2027');
    await type('anchorDate', '05/03/2027');
    await type('anchorK', '3');
    expect(field('anchorDate').value).toBe('05/03/2027');
  });

  it('a matching balance shows GREEN with the modeled balance and a zero difference, and saves with createWithAnchor', async () => {
    const { toStep4, type, text, click, store, navigate, choose } = await setup();
    await toStep4();
    await type('anchorBalance', '500000');
    await type('anchorK', '1');
    await choose('anchorSource', 'BANK_EMAIL');
    expect(text('chip-status')).toContain('Coincide');
    expect(text('anchor-modeled')).toBe('Q 500,000.00');
    expect(text('anchor-difference')).toContain('Q 0.00');
    await click('Guardar préstamo');
    expect(store.written[0]?.anchor).toEqual({
      date: '2027-01-31',
      installmentNumber: 1,
      balance: '500000.00',
      source: 'BANK_EMAIL',
    });
    expect(navigate).toHaveBeenCalledWith(['/app', 'prestamos', LOAN_ID]);
  });

  it('the source defaults to OTHER and offers the schema sources', async () => {
    const { toStep4, type, click, store, field } = await setup();
    await toStep4();
    expect([...field('anchorSource').querySelectorAll('option')].map((o) => o.value)).toEqual([
      'BANK_EMAIL',
      'ONLINE_BANKING',
      'BANK_SCHEDULE',
      'OTHER',
    ]);
    await type('anchorBalance', '500000');
    await type('anchorK', '1');
    await click('Guardar préstamo');
    expect(store.written[0]?.anchor?.source).toBe('OTHER');
  });

  it('AMBER shows «Diferencia pequeña» with the suggested cause and does not block saving', async () => {
    const { toStep4, type, text, click, store } = await setup();
    await toStep4();
    await type('anchorBalance', '500060');
    await type('anchorK', '1');
    expect(text('chip-status')).toContain('Diferencia pequeña');
    expect(text('anchor-cause')).toBe('Diferencia sin causa identificada: revisa tasa, seguros o cargos');
    await click('Guardar préstamo');
    expect(store.written).toHaveLength(1);
  });

  it('RED with a balance that matches the previous installment suggests INSTALLMENT_MISALIGNMENT and still saves', async () => {
    const { toStep4, type, text, click, store, navigate } = await setup();
    await toStep4();
    await type('anchorBalance', '500000');
    await type('anchorK', '2');
    expect(text('chip-status')).toContain('Diferencia grande');
    expect(text('anchor-cause')).toBe('El saldo parece corresponder a otra cuota (¿la anterior o la siguiente?)');
    await click('Guardar préstamo');
    expect(store.written[0]?.anchor?.installmentNumber).toBe(2);
    expect(navigate).toHaveBeenCalled();
  });

  it('RED with an unrelated balance suggests the UNKNOWN cause', async () => {
    const { toStep4, type, text } = await setup();
    await toStep4();
    await type('anchorBalance', '650000');
    await type('anchorK', '1');
    expect(text('chip-status')).toContain('Diferencia grande');
    expect(text('anchor-cause')).toBe('Diferencia sin causa identificada: revisa tasa, seguros o cargos');
  });
});

describe('saving', () => {
  it('a failed save writes nothing, stays on step 4, shows a Spanish message and does not navigate', async () => {
    const { toStep4, type, click, store, navigate, text, heading } = await setup();
    await toStep4();
    await type('anchorBalance', '500000');
    await type('anchorK', '1');
    store.failAnchorWith = new DataError('STORAGE', 'quota Q 1,234.56');
    await click('Guardar préstamo');
    expect(store.loans()).toEqual([]);
    expect(store.written).toHaveLength(0);
    expect(navigate).not.toHaveBeenCalled();
    expect(heading()).toContain('Paso 4 de 4');
    expect(text('save-error')).toContain('No se escribió nada');
    expect(text('save-error')).not.toContain('1,234');
    store.failAnchorWith = null;
    await click('Guardar préstamo');
    expect(store.loans()).toHaveLength(1);
    expect(store.written).toHaveLength(1);
    expect(navigate).toHaveBeenCalledOnce();
  });

  it('a USD loan displays US$ amounts', async () => {
    const { type, choose, click, text } = await setup();
    await type('name', 'Casa en dólares');
    await choose('currency', 'USD');
    await click('Siguiente');
    await type('principal', '100000');
    await type('termMonths', '120');
    await type('interestRate', '6');
    await type('firstDueDate', '31/01/2027');
    await type('disbursementDate', '15/12/2026');
    await click('Siguiente');
    expect(text('level')).toMatch(/^US\$ [\d,]+\.\d{2}$/);
  });
});
