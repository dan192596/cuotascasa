import { InjectionToken } from '@angular/core';
import { type LocalDate, makeLocalDate } from '@cuotascasa/domain';

/** Landing-safe clock (spec §9 «Simulador»): public/ cannot use data/'s Clock. Tests override PUBLIC_CLOCK. */
export interface PublicClock {
  /** Today in the browser's local time zone. Call it on interaction, never during prerender. */
  today(): LocalDate;
}

export const PUBLIC_CLOCK = new InjectionToken<PublicClock>('PublicClock', {
  providedIn: 'root',
  factory: () => ({
    today: () => {
      const now = new Date();
      return makeLocalDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
    },
  }),
});
