import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form, FormField, required } from '@angular/forms/signals';
import { describe, expect, it } from 'vitest';
import { DateInputComponent } from './date-input.component.ts';
import {
  DATE_FORMAT_MESSAGE,
  DATE_INVALID_MESSAGE,
  MONEY_DECIMALS_MESSAGE,
  MONEY_NOT_NUMBER_MESSAGE,
  RATE_DECIMALS_MESSAGE,
  RATE_NEGATIVE_MESSAGE,
  RATE_NOT_NUMBER_MESSAGE,
} from './input-parsers.ts';
import { MoneyInputComponent } from './money-input.component.ts';
import { RateInputComponent } from './rate-input.component.ts';

@Component({
  selector: 'cc-test-inputs-host',
  imports: [MoneyInputComponent, DateInputComponent, RateInputComponent, FormField],
  template: `
    <cc-money-input inputId="amount" currency="GTQ" [formField]="f.amount" />
    <cc-date-input inputId="due" [formField]="f.due" />
    <cc-rate-input inputId="rate" [formField]="f.rate" />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class HostComponent {
  readonly model = signal({ amount: '', due: '', rate: '' });
  readonly f = form(this.model, (path) => {
    required(path.amount, { message: 'El monto es obligatorio.' });
    required(path.due, { message: 'La fecha es obligatoria.' });
    required(path.rate, { message: 'La tasa es obligatoria.' });
  });
}

async function setup() {
  const fixture = TestBed.createComponent(HostComponent);
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  const field = (id: string) => element.querySelector<HTMLInputElement>(`input#${id}`) as HTMLInputElement;
  const type = async (id: string, text: string) => {
    const input = field(id);
    input.value = text;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
  };
  const errorsOf = (id: string) =>
    [...element.querySelectorAll(`#${id}-errors li`)].map((item) => item.textContent?.trim());
  return { fixture, host: fixture.componentInstance, element, field, type, errorsOf };
}

describe('MoneyInput', () => {
  it.each([
    ['1,234.56', '1234.56'],
    ['Q1234.5', '1234.50'],
    ['1234', '1234.00'],
  ])('accepts %j and emits %j', async (text, value) => {
    const { host, field, type } = await setup();
    await type('amount', text);
    expect(host.model().amount).toBe(value);
    expect(host.f.amount().valid()).toBe(true);
    expect(field('amount').getAttribute('aria-invalid')).toBe('false');
    expect(field('amount').getAttribute('aria-describedby')).toBeNull();
  });

  it('rejects more than 2 decimals with the exact Spanish message wired through aria-describedby', async () => {
    const { host, field, type, errorsOf } = await setup();
    await type('amount', '10');
    await type('amount', '12.345');
    expect(host.model().amount).toBe('10.00');
    expect(host.f.amount().invalid()).toBe(true);
    expect(errorsOf('amount')).toEqual([MONEY_DECIMALS_MESSAGE]);
    expect(MONEY_DECIMALS_MESSAGE).toBe('Usa como máximo 2 decimales.');
    expect(field('amount').getAttribute('aria-invalid')).toBe('true');
    expect(field('amount').getAttribute('aria-describedby')).toBe('amount-errors');
  });

  it('rejects letters with the exact Spanish message', async () => {
    const { field, type, errorsOf } = await setup();
    await type('amount', '12a');
    expect(errorsOf('amount')).toEqual([MONEY_NOT_NUMBER_MESSAGE]);
    expect(field('amount').getAttribute('aria-describedby')).toBe('amount-errors');
  });

  it('shows the required message once touched, then clears errors when the text is fixed', async () => {
    const { field, type, errorsOf } = await setup();
    await type('amount', '');
    expect(errorsOf('amount')).toEqual(['El monto es obligatorio.']);
    expect(field('amount').getAttribute('aria-required')).toBe('true');
    await type('amount', '5');
    expect(errorsOf('amount')).toEqual([]);
    expect(field('amount').getAttribute('aria-describedby')).toBeNull();
  });

  it('displays a stored value grouped and shows the currency as a decorative prefix', async () => {
    const { fixture, host, element, field } = await setup();
    host.model.update((model) => ({ ...model, amount: '1234.5' }));
    await fixture.whenStable();
    expect(field('amount').value).toBe('1,234.50');
    expect(element.querySelector('cc-money-input .affix')?.textContent?.trim()).toBe('Q');
    expect(element.querySelector('cc-money-input .affix')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('focuses the inner input from focusBoundControl()', async () => {
    const { host, field } = await setup();
    host.f.amount().focusBoundControl();
    expect(document.activeElement).toBe(field('amount'));
  });
});

describe('DateInput', () => {
  it('parses dd/mm/aaaa into a LocalDate and shows a stored LocalDate as dd/mm/aaaa', async () => {
    const { fixture, host, field, type } = await setup();
    await type('due', '05/03/2027');
    expect(host.model().due).toBe('2027-03-05');
    host.model.update((model) => ({ ...model, due: '2028-02-29' }));
    await fixture.whenStable();
    expect(field('due').value).toBe('29/02/2028');
  });

  it('rejects 31/02/2027 with the exact Spanish message', async () => {
    const { host, field, type, errorsOf } = await setup();
    await type('due', '31/02/2027');
    expect(host.model().due).toBe('');
    expect(errorsOf('due')).toEqual([DATE_INVALID_MESSAGE]);
    expect(DATE_INVALID_MESSAGE).toBe('Esa fecha no existe en el calendario.');
    expect(field('due').getAttribute('aria-invalid')).toBe('true');
    expect(field('due').getAttribute('aria-describedby')).toBe('due-errors');
  });

  it('rejects a wrong format with the exact Spanish message', async () => {
    const { errorsOf, type } = await setup();
    await type('due', '2027-03-05');
    expect(errorsOf('due')).toEqual([DATE_FORMAT_MESSAGE]);
  });
});

describe('RateInput', () => {
  it.each([
    ['7', '0.07'],
    ['7.25', '0.0725'],
    ['0.0001', '0.000001'],
  ])('percent %j emits the fraction %j', async (text, value) => {
    const { host, field, type } = await setup();
    await type('rate', text);
    expect(host.model().rate).toBe(value);
    expect(host.f.rate().valid()).toBe(true);
    expect(field('rate').getAttribute('aria-describedby')).toBeNull();
  });

  it('rejects more than 4 decimals, negatives and letters with exact Spanish messages', async () => {
    const { field, type, errorsOf } = await setup();
    await type('rate', '7.12345');
    expect(errorsOf('rate')).toEqual([RATE_DECIMALS_MESSAGE]);
    expect(field('rate').getAttribute('aria-describedby')).toBe('rate-errors');
    await type('rate', '-1');
    expect(errorsOf('rate')).toEqual([RATE_NEGATIVE_MESSAGE]);
    await type('rate', 'abc');
    expect(errorsOf('rate')).toEqual([RATE_NOT_NUMBER_MESSAGE]);
    expect(RATE_DECIMALS_MESSAGE).toBe('Usa como máximo 4 decimales.');
    expect(RATE_NEGATIVE_MESSAGE).toBe('La tasa no puede ser negativa.');
  });

  it('displays a stored 0.0126 as 1.26 with a decorative percent sign', async () => {
    const { fixture, host, element, field } = await setup();
    host.model.update((model) => ({ ...model, rate: '0.0126' }));
    await fixture.whenStable();
    expect(field('rate').value).toBe('1.26');
    expect(element.querySelector('cc-rate-input .affix')?.textContent?.trim()).toBe('%');
  });

  it('shows a derived rate with more than 4 percent decimals as an exact shift, never 100 times too large', async () => {
    const { fixture, host, field } = await setup();
    host.model.update((model) => ({ ...model, rate: '0.00583333' }));
    await fixture.whenStable();
    expect(field('rate').value).toBe('0.583333');
  });
});

describe('shared control behavior', () => {
  it('binds disabled and readonly to the inner input', async () => {
    const fixture = TestBed.createComponent(MoneyInputComponent);
    fixture.componentRef.setInput('inputId', 'x');
    fixture.componentRef.setInput('value', '');
    fixture.componentRef.setInput('disabled', true);
    fixture.componentRef.setInput('readonly', true);
    await fixture.whenStable();
    const input = (fixture.nativeElement as HTMLElement).querySelector('input') as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(input.readOnly).toBe(true);
    fixture.componentRef.setInput('disabled', false);
    fixture.componentRef.setInput('readonly', false);
    await fixture.whenStable();
    expect(input.disabled).toBe(false);
    expect(input.readOnly).toBe(false);
  });

  it('announces errors with role="alert" when they appear', async () => {
    const { element, type } = await setup();
    expect(element.querySelector('[role="alert"]')).toBeNull();
    await type('amount', '12a');
    expect(element.querySelector('#amount-errors')?.getAttribute('role')).toBe('alert');
  });
});
