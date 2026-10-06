import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { InstallmentCounterComponent } from './installment-counter.component.ts';

describe('GOLDEN PATTERN · zoneless component test', () => {
  it('runs without zone.js', () => {
    expect(typeof (globalThis as { Zone?: unknown }).Zone).toBe('undefined');
  });

  it('renders inputs and reacts to events through signals and whenStable()', async () => {
    const fixture = TestBed.createComponent(InstallmentCounterComponent);
    fixture.componentRef.setInput('total', 240);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const text = (testId: string) => element.querySelector(`[data-testid="${testId}"]`)?.textContent?.trim();
    expect(text('summary')).toBe('Quedan 240 de 240 cuotas');

    element.querySelector('button')?.click();
    await fixture.whenStable();
    expect(text('summary')).toBe('Quedan 239 de 240 cuotas');
    expect(text('announcement')).toBe('Adelantaste 1 cuota(s).');

    fixture.componentRef.setInput('total', 12);
    await fixture.whenStable();
    expect(text('summary')).toBe('Quedan 11 de 12 cuotas');

    fixture.componentRef.setInput('total', 1);
    element.querySelector('button')?.click();
    await fixture.whenStable();
    expect(text('summary')).toBe('Quedan 0 de 1 cuotas');
  });
});
