import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { transformedValue } from '@angular/forms/signals';
import type { Currency } from '@cuotascasa/domain';
import { formatMoneyPlain } from '../format/format.ts';
import { parseMoneyText } from './input-parsers.ts';
import { PARSED_TEXT_STYLES, PARSED_TEXT_TEMPLATE, ParsedTextControl } from './parsed-text-control.ts';

/**
 * Money field as a Signal Forms control. The user types '1,234.56', 'Q1234.5' or '1234'; the model is the canonical
 * `Money` string ('1234.56', '1234.50', '1234.00'). Up to 2 decimals; letters are rejected in Spanish.
 */
@Component({
  selector: 'cc-money-input',
  template: PARSED_TEXT_TEMPLATE,
  styles: PARSED_TEXT_STYLES,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MoneyInputComponent extends ParsedTextControl {
  /** Optional decorative currency symbol before the field; the host label should name the currency too. */
  readonly currency = input<Currency | null>(null);

  protected readonly inputMode = 'decimal';
  protected readonly raw = transformedValue(this.value, {
    parse: parseMoneyText,
    format: (value: string) => (value === '' ? '' : formatMoneyPlain(value)),
  });

  protected override prefix(): string {
    const currency = this.currency();
    return currency === null ? '' : currency === 'USD' ? 'US$' : 'Q';
  }
}
