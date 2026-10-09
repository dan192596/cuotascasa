import { ChangeDetectionStrategy, Component } from '@angular/core';
import { transformedValue } from '@angular/forms/signals';
import { type Rate, rateToPercent } from '@cuotascasa/domain';
import { parseRateText } from './input-parsers.ts';
import { PARSED_TEXT_STYLES, PARSED_TEXT_TEMPLATE, ParsedTextControl } from './parsed-text-control.ts';

/** Stored fraction → percent text ('0.0126' → '1.26'); a value that is not a clean 4-decimal percent is shown as is. */
function showRateAsPercent(value: string): string {
  if (value === '') {
    return '';
  }
  try {
    return rateToPercent(value as Rate);
  } catch {
    return value;
  }
}

/**
 * Rate field as a Signal Forms control. The user types a PERCENT with up to 4 decimals ('7.25'); the model is the
 * fraction string by exact decimal shift ('0.0725', via the domain's `percentToRate`). Reused by the wizard and the
 * simulator.
 */
@Component({
  selector: 'cc-rate-input',
  template: PARSED_TEXT_TEMPLATE,
  styles: PARSED_TEXT_STYLES,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RateInputComponent extends ParsedTextControl {
  protected readonly inputMode = 'decimal';
  protected readonly raw = transformedValue(this.value, {
    parse: parseRateText,
    format: showRateAsPercent,
  });

  protected override suffix(): string {
    return '%';
  }
}
