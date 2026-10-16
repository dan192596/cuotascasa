import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { makeLocalDate, parseMoney, percentToRate, type PrepaymentMode } from '@cuotascasa/domain';
import { formatLocalDate, formatMoney } from '../../ui/format/format.ts';
import { PUBLIC_CLOCK } from '../public-clock.ts';
import { DISCLAIMER, SIMULATOR_MESSAGES } from './simulator-messages.ts';
import { QuickSimulatorFormComponent } from './quick-simulator-form.component.ts';
import { simulate } from './quick-simulation.ts';

const TODAY = makeLocalDate(2026, 1, 15);

async function setup() {
  TestBed.configureTestingModule({ providers: [{ provide: PUBLIC_CLOCK, useValue: { today: () => TODAY } }] });
  const fixture = TestBed.createComponent(QuickSimulatorFormComponent);
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  const control = (id: string) => root.querySelector<HTMLInputElement>(`input#${id}`) as HTMLInputElement;
  const type = async (id: string, text: string) => {
    const input = control(id);
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
  };
  const click = async (id: string) => {
    control(id).click();
    await fixture.whenStable();
  };
  const text = (testId: string) => root.querySelector(`[data-testid="${testId}"]`)?.textContent?.trim() ?? null;
  const errorsOf = (id: string) =>
    [...root.querySelectorAll(`#${id}-errors li, #${id}-errors p`)].map((item) => item.textContent?.trim());
  const fill = async (principal: string, rate: string, years: string) => {
    await type('sim-principal', principal);
    await type('sim-rate', rate);
    await type('sim-years', years);
  };
  const prepay = async (amount: string, k: string, mode: PrepaymentMode = 'REDUCE_TERM') => {
    await click('sim-prepay-toggle');
    await type('sim-prepay-amount', amount);
    await type('sim-prepay-k', k);
    await click(mode === 'REDUCE_TERM' ? 'sim-mode-term' : 'sim-mode-installment');
  };
  return { fixture, root, control, type, click, text, errorsOf, fill, prepay };
}

/** Waits past the 600 ms debounce of the live region, then lets the view update. */
async function settle(fixture: { whenStable(): Promise<unknown> }): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 700));
  await fixture.whenStable();
}

const gtq = (value: string | null | undefined) => formatMoney(value ?? '', 'GTQ');

describe('cc-quick-simulator-form', () => {
  it('renders the form without results before any interaction', async () => {
    const { root, text, control } = await setup();
    expect(control('sim-principal')).toBeTruthy();
    expect(control('sim-rate')).toBeTruthy();
    expect(control('sim-years')).toBeTruthy();
    expect(text('sim-level')).toBeNull();
    expect(root.querySelector('[data-testid="sim-results"]')).toBeNull();
    expect(root.textContent).not.toContain(DISCLAIMER);
    expect(root.querySelector('[data-testid="sim-prepay-fields"]')).toBeNull();
  });

  it('shows the legend next to the rate field', async () => {
    const { root } = await setup();
    const legend = root.querySelector('[data-testid="sim-rate-legend"]');
    expect(legend?.textContent?.trim()).toBe('+ 1.26 % seguros FHA');
    const row = legend?.closest('.row');
    expect(row?.querySelector('input#sim-rate')).toBeTruthy();
  });

  it('500000.00, 20 years, 7 %: level 4263.47, installment 1, totals, count and end date', async () => {
    const { fill, text } = await setup();
    await fill('500000', '7', '20');
    expect(text('sim-level')).toBe(gtq('4263.47'));
    expect(text('sim-first-interest')).toBe(gtq('2916.67'));
    expect(text('sim-first-insurance')).toBe(gtq('525.00'));
    expect(text('sim-first-capital')).toBe(gtq('821.80'));
    expect(text('sim-total')).toBe(gtq('523231.11'));
    expect(text('sim-count')).toBe('240');
    expect(text('sim-end')).toBe(formatLocalDate('2046-01-31'));
    expect(text('sim-saved')).toBeNull();
  });

  it('shows the disclaimer under the results', async () => {
    const { root, fill } = await setup();
    await fill('500000', '7', '20');
    const results = root.querySelector('[data-testid="sim-results"]') as HTMLElement;
    const disclaimer = results.querySelector('[data-testid="sim-disclaimer"]');
    expect(disclaimer?.textContent?.trim()).toBe(
      'Cifras estimadas; el banco tiene la última palabra. No es asesoría financiera.',
    );
    expect(results.lastElementChild).toBe(disclaimer);
  });

  it('prepayment REDUCE_TERM after installment 12: 220 installments, interestSaved 69172.80', async () => {
    const { fill, prepay, text } = await setup();
    await fill('500000', '7', '20');
    await prepay('20000', '12');
    expect(text('sim-saved')).toBe(gtq('69172.80'));
    expect(text('sim-months-saved')).toBe('20');
    expect(text('sim-new-count')).toBe('220');
    expect(text('sim-new-end')).toBe(formatLocalDate('2044-05-31'));
    expect(text('sim-new-level')).toBeNull();
  });

  it('prepayment REDUCE_INSTALLMENT shows the new level 4089.36', async () => {
    const { fill, prepay, text } = await setup();
    await fill('500000', '7', '20');
    await prepay('20000', '12', 'REDUCE_INSTALLMENT');
    expect(text('sim-new-level')).toBe(gtq('4089.36'));
    expect(text('sim-saved')).toBe(gtq('19694.91'));
    expect(text('sim-months-saved')).toBe('0');
  });

  it.each([
    ['250000.50', '8.5', '15', null, { level: '2649.93', total: '226987.35', count: '180', end: '2041-01-31' }],
    [
      '1200000',
      '6.25',
      '30',
      { amount: '50000', k: '60', mode: 'REDUCE_TERM' as const },
      { level: '8398.79', total: '1823568.15', count: '360', end: '2056-01-31', saved: '241898.05', newCount: '326' },
    ],
    [
      '75000',
      '10',
      '1',
      { amount: '5000', k: '6', mode: 'REDUCE_INSTALLMENT' as const },
      { level: '6637.72', total: '4652.68', count: '12', end: '2027-01-31', saved: '165.49', newLevel: '5776.81' },
    ],
  ])('shows the engine results for %s at %s %% over %s years', async (principal, rate, years, extra, expected) => {
    const { fill, prepay, text } = await setup();
    await fill(principal, rate, years);
    if (extra !== null) await prepay(extra.amount, extra.k, extra.mode);
    expect(text('sim-level')).toBe(gtq(expected.level));
    expect(text('sim-total')).toBe(gtq(expected.total));
    expect(text('sim-count')).toBe(expected.count);
    expect(text('sim-end')).toBe(formatLocalDate(expected.end));
    if ('saved' in expected) expect(text('sim-saved')).toBe(gtq(expected.saved));
    if ('newCount' in expected) expect(text('sim-new-count')).toBe(expected.newCount);
    if ('newLevel' in expected) expect(text('sim-new-level')).toBe(gtq(expected.newLevel));
  });

  it.each([
    ['250000.50', '8.5', '15', null],
    ['1200000', '6.25', '30', { amount: '50000', k: '60', mode: 'REDUCE_TERM' as const }],
    ['75000', '10', '1', { amount: '5000', k: '6', mode: 'REDUCE_INSTALLMENT' as const }],
  ])('outputs equal the domain results for %s at %s %% over %s years', async (principal, rate, years, extra) => {
    const { fill, prepay, text } = await setup();
    await fill(principal, rate, years);
    if (extra !== null) await prepay(extra.amount, extra.k, extra.mode);
    const expected = simulate({
      principal: parseMoney(principal),
      annualRate: percentToRate(rate),
      termMonths: Number(years) * 12,
      today: TODAY,
      prepayment:
        extra === null
          ? null
          : { amount: parseMoney(extra.amount), afterInstallment: Number(extra.k), mode: extra.mode },
    });
    expect(text('sim-level')).toBe(gtq(expected.level));
    expect(text('sim-first-interest')).toBe(gtq(expected.firstInstallment.interest));
    expect(text('sim-first-insurance')).toBe(gtq(expected.firstInstallment.insurance));
    expect(text('sim-first-capital')).toBe(gtq(expected.firstInstallment.capital));
    if (expected.prepayment !== null) {
      expect(text('sim-saved')).toBe(gtq(expected.prepayment.interestSaved));
      expect(text('sim-months-saved')).toBe(String(expected.prepayment.monthsSaved));
      expect(text('sim-new-end')).toBe(formatLocalDate(expected.prepayment.endDate));
    }
  });

  describe('validation', () => {
    it.each([
      ['0', SIMULATOR_MESSAGES.yearsRange],
      ['31', SIMULATOR_MESSAGES.yearsRange],
      ['1.5', SIMULATOR_MESSAGES.yearsInteger],
      ['abc', SIMULATOR_MESSAGES.yearsInteger],
      ['', SIMULATOR_MESSAGES.yearsRequired],
    ])('rejects years %j with a Spanish error and no results', async (years, message) => {
      const { fill, errorsOf, root } = await setup();
      await fill('500000', '7', years);
      expect(errorsOf('sim-years')).toEqual([message]);
      expect(root.querySelector('[data-testid="sim-results"]')).toBeNull();
    });

    it.each([
      ['1', 12],
      ['30', 360],
    ])('accepts %s years as termMonths %i', async (years, months) => {
      const { fill, text, errorsOf } = await setup();
      await fill('500000', '7', years);
      expect(errorsOf('sim-years')).toEqual([]);
      expect(text('sim-count')).toBe(String(months));
    });

    it('rejects an empty or zero amount and an out-of-range rate', async () => {
      const { fill, errorsOf, root } = await setup();
      await fill('', '7', '20');
      expect(errorsOf('sim-principal')).toEqual([SIMULATOR_MESSAGES.principalRequired]);
      await fill('0', '7', '20');
      expect(errorsOf('sim-principal')).toEqual([SIMULATOR_MESSAGES.principalPositive]);
      await fill('500000', '101', '20');
      expect(errorsOf('sim-rate')).toEqual([SIMULATOR_MESSAGES.rateRange]);
      await fill('500000', '', '20');
      expect(errorsOf('sim-rate')).toEqual([SIMULATOR_MESSAGES.rateRequired]);
      expect(root.querySelector('[data-testid="sim-results"]')).toBeNull();
    });

    it('accepts a 0 % rate', async () => {
      const { fill, text } = await setup();
      await fill('120000', '0', '10');
      expect(text('sim-level')).not.toBeNull();
    });

    it.each(['0', '240', '241', '1.5', 'x'])('rejects k=%s with a Spanish error and hides every result', async (k) => {
      const { fill, prepay, errorsOf, root } = await setup();
      await fill('500000', '7', '20');
      await prepay('20000', k);
      expect(errorsOf('sim-prepay-k').length).toBe(1);
      expect(errorsOf('sim-prepay-k')[0]).toMatch(/^La cuota/);
      expect(root.querySelector('[data-testid="sim-results"]')).toBeNull();
    });

    it('accepts k=1 and k=239 for 240 installments', async () => {
      const { fill, prepay, type, text } = await setup();
      await fill('500000', '7', '20');
      await prepay('20000', '1');
      expect(text('sim-saved')).not.toBeNull();
      await type('sim-prepay-k', '239');
      expect(text('sim-saved')).not.toBeNull();
    });

    it('rejects a zero prepayment amount', async () => {
      const { fill, prepay, errorsOf, root } = await setup();
      await fill('500000', '7', '20');
      await prepay('0', '12');
      expect(errorsOf('sim-prepay-amount')).toEqual([SIMULATOR_MESSAGES.prepayAmountPositive]);
      expect(root.querySelector('[data-testid="sim-results"]')).toBeNull();
    });

    it('keeps the base results while the prepayment fields are still empty, and drops the prepayment block', async () => {
      const { fill, click, text } = await setup();
      await fill('500000', '7', '20');
      await click('sim-prepay-toggle');
      expect(text('sim-level')).toBe(gtq('4263.47'));
      expect(text('sim-saved')).toBeNull();
    });

    it('does not show raw domain messages: a domain error maps to a fixed Spanish text', async () => {
      const { fill, prepay, root } = await setup();
      await fill('500000', '7', '20');
      await prepay('20000', '12');
      expect(root.textContent).not.toMatch(/prepayment|installment|Invalid/i);
    });
  });

  describe('announcement', () => {
    it('has no assertive role="alert" of its own, even with errors showing', async () => {
      const { root, fill, prepay } = await setup();
      await fill('500000', '7', '99');
      await prepay('20000', '0');
      // The ui/ controls (cc-money-input, cc-rate-input) keep an internal role="alert" on their error lists:
      // tracked as an Opus follow-up, so they are excluded here.
      const own = [...root.querySelectorAll('[role="alert"]')].filter(
        (element) => element.closest('cc-money-input, cc-rate-input') === null,
      );
      expect(own).toEqual([]);
      expect(root.querySelectorAll('[aria-live]').length).toBe(1);
    });

    it('has a single polite live region, debounced, with the level and the total', async () => {
      const { root, fill, fixture } = await setup();
      const regions = root.querySelectorAll('[aria-live]');
      expect(regions.length).toBe(1);
      const region = regions[0] as HTMLElement;
      expect(region.getAttribute('aria-live')).toBe('polite');
      expect(region.textContent?.trim()).toBe('');
      await fill('500000', '7', '20');
      expect(region.textContent?.trim()).toBe('');
      await settle(fixture);
      const message = region.textContent ?? '';
      expect(message).toContain(gtq('4263.47'));
      expect(message).toContain(gtq('523231.11'));
      expect(root.querySelectorAll('[aria-live]').length).toBe(1);
    });

    it('clears the announcement when the input becomes invalid', async () => {
      const { root, fill, type, fixture } = await setup();
      await fill('500000', '7', '20');
      await settle(fixture);
      await fixture.whenStable();
      await type('sim-years', '99');
      await fixture.whenStable();
      expect(root.querySelector('[aria-live]')?.textContent?.trim()).toBe('');
    });
  });
});
