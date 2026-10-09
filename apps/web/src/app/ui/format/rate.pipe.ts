import { Pipe, type PipeTransform } from '@angular/core';
import type { Rate } from '@cuotascasa/domain';
import { formatPercent } from './format.ts';

/** `{{ rate | rate }}` shows a stored fraction as a percent: '0.0126' → '1.26 %'. Empty input renders ''. */
@Pipe({ name: 'rate' })
export class RatePipe implements PipeTransform {
  transform(value: Rate | string | null | undefined): string {
    return value === null || value === undefined || value === '' ? '' : `${formatPercent(value)} %`;
  }
}
