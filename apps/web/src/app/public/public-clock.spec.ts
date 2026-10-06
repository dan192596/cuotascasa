import { TestBed } from '@angular/core/testing';
import { isLocalDate, makeLocalDate } from '@cuotascasa/domain';
import { describe, expect, it } from 'vitest';
import { PUBLIC_CLOCK } from './public-clock.ts';

describe('PUBLIC_CLOCK', () => {
  it("defaults to the browser's local date as a LocalDate", () => {
    const today = TestBed.inject(PUBLIC_CLOCK).today();
    const now = new Date();
    expect(isLocalDate(today)).toBe(true);
    expect(today).toBe(makeLocalDate(now.getFullYear(), now.getMonth() + 1, now.getDate()));
  });

  it('can be replaced in tests (W4-03 injects 2026-01-15)', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: PUBLIC_CLOCK, useValue: { today: () => makeLocalDate(2026, 1, 15) } }],
    });
    expect(TestBed.inject(PUBLIC_CLOCK).today()).toBe('2026-01-15');
  });
});
