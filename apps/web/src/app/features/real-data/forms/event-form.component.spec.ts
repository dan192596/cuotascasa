import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { actualPaymentSchema, loanEventSchema, type RateChangePolicy, reportedBalanceSchema } from '@cuotascasa/schema';
import { describe, expect, it } from 'vitest';
import {
  type EventFormContext,
  EventFormComponent,
  type EventFormKind,
  type EventFormValue,
} from './event-form.component.ts';

const LOAN_ID = 'a0000000-0000-4000-8000-000000000001';
const STAMP = {
  id: 'b0000000-0000-4000-8000-000000000002',
  createdAt: '2026-10-04T15:00:00.000Z',
  updatedAt: '2026-10-04T15:00:00.000Z',
  updatedByDevice: 'd0000000-0000-4000-8000-000000000001',
  deletedAt: null,
};
const CONTEXT: EventFormContext = {
  loanId: LOAN_ID,
  currency: 'GTQ',
  rateType: 'VARIABLE',
  disbursementDate: '2026-01-10',
  firstDueDate: '2026-02-15',
  paymentDay: 15,
  endDate: '2046-01-15',
};

interface Harness {
  readonly fixture: ComponentFixture<EventFormComponent>;
  readonly element: HTMLElement;
  readonly emitted: EventFormValue[];
  readonly cancelled: number[];
  input(name: string): HTMLInputElement;
  type(name: string, text: string): Promise<void>;
  choose(name: string, value: string): Promise<void>;
  click(text: string): Promise<void>;
  submit(): Promise<void>;
  describedText(name: string): string;
}

async function setup(
  kind: EventFormKind,
  options: { context?: EventFormContext; value?: EventFormValue | null } = {},
): Promise<Harness> {
  const fixture = TestBed.createComponent(EventFormComponent);
  fixture.componentRef.setInput('kind', kind);
  fixture.componentRef.setInput('context', options.context ?? CONTEXT);
  if (options.value !== undefined) {
    fixture.componentRef.setInput('value', options.value);
  }
  const emitted: EventFormValue[] = [];
  const cancelled: number[] = [];
  fixture.componentInstance.submitted.subscribe((value) => emitted.push(value));
  fixture.componentInstance.cancelled.subscribe(() => cancelled.push(1));
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  const control = (name: string) =>
    element.querySelector<HTMLInputElement>(`[id$="-${name}"]:is(input, select, textarea)`) as HTMLInputElement;
  return {
    fixture,
    element,
    emitted,
    cancelled,
    input: control,
    async type(name, text) {
      const target = control(name);
      target.value = text;
      target.dispatchEvent(new Event('input'));
      target.dispatchEvent(new Event('blur'));
      await fixture.whenStable();
    },
    async choose(name, value) {
      const target = control(name);
      target.value = value;
      // A browser fires both for a <select>.
      target.dispatchEvent(new Event('input'));
      target.dispatchEvent(new Event('change'));
      target.dispatchEvent(new Event('blur'));
      await fixture.whenStable();
    },
    async click(text) {
      const button = [...element.querySelectorAll('button')].find(
        (candidate) => candidate.textContent?.trim() === text,
      );
      button?.click();
      await fixture.whenStable();
    },
    async submit() {
      element.querySelector('form')?.requestSubmit();
      await fixture.whenStable();
    },
    describedText(name) {
      const id = control(name).getAttribute('aria-describedby');
      return id === null ? '' : (element.querySelector(`#${id}`)?.textContent?.trim() ?? '');
    },
  };
}

function stamped(value: EventFormValue): Record<string, unknown> {
  return { ...STAMP, ...value.draft };
}

function parses(value: EventFormValue): boolean {
  const record = stamped(value);
  return value.entity === 'ReportedBalance'
    ? reportedBalanceSchema.safeParse(record).success
    : value.entity === 'ActualPayment'
      ? actualPaymentSchema.safeParse(record).success
      : loanEventSchema.safeParse(record).success;
}

async function fillRequired(harness: Harness, kind: EventFormKind): Promise<void> {
  switch (kind) {
    case 'ReportedBalance':
      await harness.type('date', '15/05/2026');
      await harness.type('balance', '480,000.00');
      await harness.choose('source', 'BANK_EMAIL');
      break;
    case 'ActualPayment':
      await harness.type('date', '14/03/2026');
      await harness.type('total', '4,658.47');
      break;
    case 'RateChange':
      await harness.type('date', '15/06/2026');
      await harness.type('interestRate', '7.25');
      break;
    case 'FixedChargeChange':
      await harness.type('date', '15/06/2026');
      await harness.click('Agregar cargo');
      await harness.type('charge-label-0', 'IUSI');
      await harness.type('charge-amount-0', '350');
      break;
    case 'Prepayment':
      await harness.type('date', '15/06/2026');
      await harness.type('amount', '20000');
      await harness.choose('mode', 'REDUCE_TERM');
      break;
    case 'AdvanceInstallments':
      await harness.type('date', '15/06/2026');
      await harness.type('count', '6');
      break;
  }
}

const KINDS: readonly EventFormKind[] = [
  'ReportedBalance',
  'ActualPayment',
  'RateChange',
  'FixedChargeChange',
  'Prepayment',
  'AdvanceInstallments',
];

describe('cc-event-form: valid input', () => {
  it.each(KINDS)('%s emits a DTO that parses with its entity schema once stamped', async (kind) => {
    const harness = await setup(kind);
    await fillRequired(harness, kind);
    await harness.submit();
    expect(harness.emitted).toHaveLength(1);
    const value = harness.emitted[0] as EventFormValue;
    expect(value.entity).toBe(kind === 'ReportedBalance' || kind === 'ActualPayment' ? kind : 'LoanEvent');
    expect(parses(value)).toBe(true);
  });

  it.each(KINDS)('%s emits the optional note, trimmed, and omits it when empty', async (kind) => {
    const withNote = await setup(kind);
    await fillRequired(withNote, kind);
    await withNote.type('note', '  Revisado con el banco  ');
    await withNote.submit();
    expect((withNote.emitted[0]?.draft as { note?: string }).note).toBe('Revisado con el banco');
    const without = await setup(kind);
    await fillRequired(without, kind);
    await without.submit();
    expect('note' in (without.emitted[0]?.draft as object)).toBe(false);
  });

  it('emits money as decimal strings and no JS number besides installmentNumber and count', async () => {
    const harness = await setup('Prepayment');
    await fillRequired(harness, 'Prepayment');
    await harness.choose('commissionKind', 'FLAT');
    await harness.type('commissionAmount', '500.5');
    await harness.submit();
    const draft = harness.emitted[0]?.draft as Record<string, unknown>;
    expect(draft['amount']).toBe('20000.00');
    expect(draft['commission']).toEqual({ kind: 'FLAT', amount: '500.50' });
    const numbers = Object.entries(draft).filter(([, field]) => typeof field === 'number');
    expect(numbers).toEqual([]);
  });

  it.each([
    ['ReportedBalance', ['balance', 'totalInstallment']],
    [
      'ActualPayment',
      ['total', 'breakdown-capital', 'breakdown-interest', 'breakdown-insurance', 'breakdown-fixedCharges'],
    ],
    ['RateChange', []],
    ['Prepayment', ['amount']],
  ] as const)('%s uses cc-money-input for its money fields', async (kind, fields) => {
    const harness = await setup(kind);
    for (const name of fields) {
      const host = harness.input(name).closest('cc-money-input');
      expect(host, `${kind} ${name}`).not.toBeNull();
    }
  });

  it('keeps DTO keys equal to the W0-04 entity field names', async () => {
    const balance = await setup('ReportedBalance');
    await fillRequired(balance, 'ReportedBalance');
    await balance.submit();
    expect(Object.keys(balance.emitted[0]?.draft as object).sort()).toEqual(
      ['balance', 'date', 'loanId', 'source'].sort(),
    );
    const payment = await setup('ActualPayment');
    await fillRequired(payment, 'ActualPayment');
    await payment.submit();
    expect(Object.keys(payment.emitted[0]?.draft as object).sort()).toEqual(
      ['installmentNumber', 'loanId', 'paidDate', 'total'].sort(),
    );
    const rate = await setup('RateChange');
    await fillRequired(rate, 'RateChange');
    await rate.submit();
    expect(Object.keys(rate.emitted[0]?.draft as object).sort()).toEqual(
      ['date', 'interestRate', 'loanId', 'policy', 'type'].sort(),
    );
  });

  it('cancels without emitting a value', async () => {
    const harness = await setup('AdvanceInstallments');
    await harness.click('Cancelar');
    expect(harness.cancelled).toHaveLength(1);
    expect(harness.emitted).toEqual([]);
  });
});

describe('cc-event-form: invalid input', () => {
  it('shows exact Spanish messages through aria-describedby and emits nothing', async () => {
    const harness = await setup('ReportedBalance');
    await harness.submit();
    expect(harness.emitted).toEqual([]);
    expect(harness.input('date').getAttribute('aria-invalid')).toBe('true');
    expect(harness.describedText('date')).toBe('Escribe la fecha.');
    expect(harness.describedText('balance')).toBe('Escribe un monto.');
    expect(harness.input('source').getAttribute('aria-invalid')).toBe('true');
    expect(harness.describedText('source')).toBe('Elige de dónde viene el saldo.');
  });

  it('shows the messages of native controls and of the ui controls the same way', async () => {
    const harness = await setup('AdvanceInstallments');
    await harness.type('count', '0');
    expect(harness.describedText('count')).toBe('El número debe estar entre 1 y 1200.');
    await harness.type('count', '2.5');
    expect(harness.describedText('count')).toBe('Escribe un número entero, sin decimales.');
    await harness.type('date', '31/02/2026');
    expect(harness.describedText('date')).toBe('Esa fecha no existe en el calendario.');
  });

  it('rejects dates before the disbursement and after the loan end', async () => {
    const harness = await setup('Prepayment');
    await harness.type('date', '09/01/2026');
    expect(harness.describedText('date')).toBe(
      'La fecha no puede ser anterior al desembolso del préstamo (10/01/2026).',
    );
    await harness.type('date', '16/01/2046');
    expect(harness.describedText('date')).toBe('La fecha no puede ser posterior al fin del préstamo (15/01/2046).');
    await harness.type('amount', '100');
    await harness.choose('mode', 'REDUCE_TERM');
    await harness.submit();
    expect(harness.emitted).toEqual([]);
  });

  it('rejects dates out of range in every form that has a date', async () => {
    for (const kind of KINDS) {
      const harness = await setup(kind);
      await harness.type('date', '01/01/2020');
      expect(harness.describedText('date'), kind).toContain('anterior al desembolso');
    }
  });

  it('moves focus to the first invalid control', async () => {
    const harness = await setup('Prepayment');
    await harness.submit();
    expect(document.activeElement).toBe(harness.input('date'));
  });

  it('requires the four breakdown parts together and a positive total', async () => {
    const harness = await setup('ActualPayment');
    await fillRequired(harness, 'ActualPayment');
    await harness.type('breakdown-capital', '800');
    await harness.submit();
    expect(harness.emitted).toEqual([]);
    expect(harness.describedText('breakdown-interest')).toBe(
      'Si indicas el desglose, completa los cuatro componentes (puedes escribir 0.00).',
    );
    await harness.type('total', '0');
    expect(harness.describedText('total')).toBe('El monto debe ser mayor que cero.');
  });

  it('requires the bank installment only with the BANK_INSTALLMENT policy', async () => {
    const harness = await setup('RateChange');
    await fillRequired(harness, 'RateChange');
    expect(harness.input('bankInstallment')).toBeNull();
    (harness.element.querySelector('input[type="radio"][value="BANK_INSTALLMENT"]') as HTMLInputElement).click();
    await harness.fixture.whenStable();
    await harness.submit();
    expect(harness.emitted).toEqual([]);
    expect(harness.describedText('bankInstallment')).toBe('Escribe un monto.');
    await harness.type('bankInstallment', '4300');
    await harness.submit();
    expect(harness.emitted).toHaveLength(1);
    expect(harness.emitted[0]?.draft).toMatchObject({ policy: 'BANK_INSTALLMENT', bankInstallment: '4300.00' });
  });

  it('rejects an over-long note', async () => {
    const harness = await setup('AdvanceInstallments');
    await harness.type('note', 'x'.repeat(501));
    expect(harness.describedText('note')).toBe('La nota no puede pasar de 500 caracteres.');
  });
});

describe('cc-event-form: ReportedBalance and ActualPayment installments', () => {
  it('emits a valid ReportedBalance without installmentNumber', async () => {
    const harness = await setup('ReportedBalance');
    await fillRequired(harness, 'ReportedBalance');
    await harness.submit();
    expect('installmentNumber' in (harness.emitted[0]?.draft as object)).toBe(false);
    expect(parses(harness.emitted[0] as EventFormValue)).toBe(true);
  });

  it('keeps the optional ReportedBalance installmentNumber when typed', async () => {
    const harness = await setup('ReportedBalance');
    await fillRequired(harness, 'ReportedBalance');
    await harness.type('installmentNumber', '4');
    await harness.submit();
    expect(harness.emitted[0]?.draft).toMatchObject({ installmentNumber: 4 });
  });

  it('prefills the ActualPayment installment from paidDate and lets the user change it', async () => {
    const harness = await setup('ActualPayment');
    expect(harness.input('installmentNumber').value).toBe('');
    await harness.type('date', '14/03/2026');
    expect(harness.input('installmentNumber').value).toBe('2');
    await harness.type('date', '16/03/2026');
    expect(harness.input('installmentNumber').value).toBe('3');
    // A late payment: the user points it at installment 2 and later date changes no longer override it.
    await harness.type('installmentNumber', '2');
    await harness.type('date', '16/05/2026');
    expect(harness.input('installmentNumber').value).toBe('2');
    await harness.type('total', '4658.47');
    await harness.submit();
    expect(harness.emitted[0]?.draft).toMatchObject({ paidDate: '2026-05-16', installmentNumber: 2 });
  });

  it('requires the ActualPayment installment', async () => {
    const harness = await setup('ActualPayment');
    await harness.type('date', '14/03/2026');
    await harness.type('total', '4658.47');
    await harness.type('installmentNumber', '');
    await harness.submit();
    expect(harness.emitted).toEqual([]);
    expect(harness.describedText('installmentNumber')).toBe('Indica a qué cuota corresponde el pago.');
  });
});

describe('cc-event-form: RateChange on a FIXED loan', () => {
  it('warns in Spanish and still emits a valid DTO', async () => {
    const harness = await setup('RateChange', { context: { ...CONTEXT, rateType: 'FIXED' } });
    expect(harness.element.textContent).toContain('Este préstamo es de tasa fija');
    await fillRequired(harness, 'RateChange');
    await harness.submit();
    expect(harness.emitted).toHaveLength(1);
    expect(parses(harness.emitted[0] as EventFormValue)).toBe(true);
  });

  it('does not warn on a VARIABLE loan', async () => {
    const harness = await setup('RateChange');
    expect(harness.element.textContent).not.toContain('Este préstamo es de tasa fija');
  });

  it('explains every policy in Spanish and defaults to recalculating the installment', async () => {
    const harness = await setup('RateChange');
    const policies: RateChangePolicy[] = [
      'RECALC_INSTALLMENT_KEEP_TERM',
      'KEEP_INSTALLMENT_ADJUST_TERM',
      'BANK_INSTALLMENT',
    ];
    for (const policy of policies) {
      expect(harness.element.querySelector(`input[type="radio"][value="${policy}"]`)).not.toBeNull();
    }
    expect(
      (harness.element.querySelector('input[type="radio"][value="RECALC_INSTALLMENT_KEEP_TERM"]') as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(harness.element.textContent).toContain('El plazo restante no cambia');
  });
});

describe('cc-event-form: FixedChargeChange list', () => {
  it('adds and removes rows and emits the complete list, even empty', async () => {
    const harness = await setup('FixedChargeChange');
    await harness.type('date', '15/06/2026');
    await harness.submit();
    expect(harness.emitted[0]?.draft).toMatchObject({ type: 'FixedChargeChange', fixedCharges: [] });
    await harness.click('Agregar cargo');
    await harness.click('Agregar cargo');
    await harness.type('charge-label-0', 'IUSI');
    await harness.type('charge-amount-0', '350');
    await harness.type('charge-label-1', 'Seguro de daños');
    await harness.type('charge-amount-1', '120.5');
    await harness.click('Quitar cargo 1');
    await harness.submit();
    expect(harness.emitted[1]?.draft).toMatchObject({
      fixedCharges: [{ label: 'Seguro de daños', amount: '120.50' }],
    });
  });

  it('asks for the charge name', async () => {
    const harness = await setup('FixedChargeChange');
    await harness.type('date', '15/06/2026');
    await harness.click('Agregar cargo');
    await harness.type('charge-amount-0', '350');
    await harness.submit();
    expect(harness.emitted).toEqual([]);
    expect(harness.describedText('charge-label-0')).toBe('Escribe el nombre del cargo.');
  });
});

describe('cc-event-form: Prepayment commission', () => {
  it('emits a PERCENT commission as a fraction string', async () => {
    const harness = await setup('Prepayment');
    await fillRequired(harness, 'Prepayment');
    await harness.choose('commissionKind', 'PERCENT');
    await harness.type('commissionRate', '2');
    await harness.submit();
    expect(harness.emitted[0]?.draft).toMatchObject({ commission: { kind: 'PERCENT', rate: '0.02' } });
  });

  it('shows the commission field of the chosen kind only', async () => {
    const harness = await setup('Prepayment');
    expect(harness.input('commissionAmount')).toBeNull();
    expect(harness.input('commissionRate')).toBeNull();
    await harness.choose('commissionKind', 'FLAT');
    expect(harness.input('commissionAmount')).not.toBeNull();
    expect(harness.input('commissionRate')).toBeNull();
  });
});

describe('cc-event-form: editing an existing DTO', () => {
  it('loads the value and re-emits it with the edits', async () => {
    const value: EventFormValue = {
      entity: 'LoanEvent',
      draft: {
        loanId: LOAN_ID,
        date: '2026-06-15',
        type: 'Prepayment',
        amount: '20000.00',
        mode: 'REDUCE_INSTALLMENT',
        commission: { kind: 'FLAT', amount: '500.00' },
        note: 'Aguinaldo',
      },
    };
    const harness = await setup('Prepayment', { value });
    expect(harness.input('date').value).toBe('15/06/2026');
    expect(harness.input('amount').value).toBe('20,000.00');
    expect(harness.input('mode').value).toBe('REDUCE_INSTALLMENT');
    expect(harness.input('note').value).toBe('Aguinaldo');
    await harness.type('amount', '25000');
    await harness.submit();
    expect(harness.emitted[0]?.draft).toEqual({ ...value.draft, amount: '25000.00' });
  });

  it('does not suggest an installment over an existing payment', async () => {
    const value: EventFormValue = {
      entity: 'ActualPayment',
      draft: { loanId: LOAN_ID, paidDate: '2026-05-16', installmentNumber: 2, total: '4658.47' },
    };
    const harness = await setup('ActualPayment', { value });
    expect(harness.input('installmentNumber').value).toBe('2');
    await harness.type('date', '17/05/2026');
    expect(harness.input('installmentNumber').value).toBe('2');
  });

  it('keeps the insurance rates of an existing RateChange', async () => {
    const value: EventFormValue = {
      entity: 'LoanEvent',
      draft: {
        loanId: LOAN_ID,
        date: '2026-06-15',
        type: 'RateChange',
        policy: 'KEEP_INSTALLMENT_ADJUST_TERM',
        insuranceRates: ['0.01', '0.0026'],
      },
    };
    const harness = await setup('RateChange', { value });
    await harness.submit();
    expect(harness.emitted[0]?.draft).toEqual(value.draft);
  });
});
