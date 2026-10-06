import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form, FormField, required } from '@angular/forms/signals';
import { describe, expect, it } from 'vitest';
import { DigitsInputComponent } from './digits-input.component.ts';

@Component({
  selector: 'cc-pattern-digits-host',
  imports: [DigitsInputComponent, FormField],
  template: '<cc-pattern-digits-input inputId="months" [formField]="months" />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class DigitsHostComponent {
  readonly model = signal({ months: '' });
  readonly months = form(this.model, (path) => {
    required(path.months, { message: 'El plazo es obligatorio.' });
  }).months;
}

async function setup() {
  const fixture = TestBed.createComponent(DigitsHostComponent);
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  const input = element.querySelector('input') as HTMLInputElement;
  const type = async (text: string) => {
    input.value = text;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
  };
  return { fixture, host: fixture.componentInstance, element, input, type };
}

describe('GOLDEN PATTERN · Signal Forms custom control', () => {
  it('parses the raw text into the canonical string model', async () => {
    const { fixture, host, element, input, type } = await setup();
    expect(element.querySelector('#months-errors')).toBeNull();
    expect(input.getAttribute('aria-describedby')).toBeNull();
    expect(input.getAttribute('aria-invalid')).toBe('false');
    expect(input.getAttribute('aria-required')).toBe('true');
    await type('1,234');
    expect(host.model().months).toBe('1234');
    expect(host.months().valid()).toBe(true);
    expect(input.getAttribute('aria-invalid')).toBe('false');
    host.model.set({ months: '360' });
    await fixture.whenStable();
    expect(input.value).toBe('360');
  });

  it('reports a Spanish parse error through aria-describedby and keeps the last valid model', async () => {
    const { host, element, input, type } = await setup();
    await type('12');
    await type('12a');
    expect(host.model().months).toBe('12');
    expect(host.months().invalid()).toBe(true);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('months-errors');
    expect(element.querySelector('#months-errors')?.textContent).toContain(
      'Escribe solo dígitos, sin letras ni signos.',
    );
  });

  it('shows the required message once touched', async () => {
    const { host, element, input, type } = await setup();
    await type('');
    expect(element.querySelector('#months-errors')?.textContent).toContain('El plazo es obligatorio.');
    await type('abc');
    expect([...element.querySelectorAll('#months-errors li')].map((item) => item.textContent)).toEqual([
      'Escribe solo dígitos, sin letras ni signos.',
    ]);
    host.months().focusBoundControl();
    expect(document.activeElement).toBe(input);
  });
});
