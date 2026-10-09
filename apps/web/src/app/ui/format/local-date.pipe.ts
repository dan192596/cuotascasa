import { Pipe, type PipeTransform } from '@angular/core';
import type { LocalDate } from '@cuotascasa/domain';
import { formatLocalDate } from './format.ts';

/** `{{ due | localDate }}` → 'dd/mm/aaaa'. Takes a `LocalDate` string, never a `Date`. Empty input renders ''. */
@Pipe({ name: 'localDate' })
export class LocalDatePipe implements PipeTransform {
  transform(value: LocalDate | string | null | undefined): string {
    return value === null || value === undefined || value === '' ? '' : formatLocalDate(value);
  }
}
