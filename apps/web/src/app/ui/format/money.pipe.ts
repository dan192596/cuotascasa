import { Pipe, type PipeTransform } from '@angular/core';
import type { Currency, Money } from '@cuotascasa/domain';
import { formatMoney } from './format.ts';

/** `{{ amount | money: 'GTQ' }}` → 'Q 1,234.50'; `'USD'` → 'US$ 1,234.50'. Empty input renders ''. */
@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  transform(value: Money | string | null | undefined, currency: Currency): string {
    return value === null || value === undefined || value === '' ? '' : formatMoney(value, currency);
  }
}
