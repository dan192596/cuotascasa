import { ChangeDetectionStrategy, Component } from '@angular/core';
import { transformedValue } from '@angular/forms/signals';
import { formatLocalDate } from '../format/format.ts';
import { parseDateText } from './input-parsers.ts';
import { PARSED_TEXT_STYLES, PARSED_TEXT_TEMPLATE, ParsedTextControl } from './parsed-text-control.ts';

/**
 * Date field as a Signal Forms control. The user types 'dd/mm/aaaa'; the model is a `LocalDate` ('AAAA-MM-DD'),
 * never a `Date`. Dates that do not exist (31/02/2027) are rejected in Spanish.
 */
@Component({
  selector: 'cc-date-input',
  template: PARSED_TEXT_TEMPLATE,
  styles: PARSED_TEXT_STYLES,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DateInputComponent extends ParsedTextControl {
  protected readonly inputMode = 'numeric';
  protected readonly raw = transformedValue(this.value, {
    parse: parseDateText,
    format: (value: string) => (value === '' ? '' : formatLocalDate(value)),
  });
}
