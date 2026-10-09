import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { StatusChipComponent, type ValidationStatus } from './status-chip.component.ts';

async function render(status: ValidationStatus) {
  const fixture = TestBed.createComponent(StatusChipComponent);
  fixture.componentRef.setInput('status', status);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('cc-status-chip', () => {
  it.each([
    ['GREEN', 'Coincide', '●'],
    ['AMBER', 'Diferencia pequeña', '▲'],
    ['RED', 'Diferencia grande', '■'],
    ['UNVALIDATED', 'Sin validar', '○'],
  ] as const)('%s shows text and an icon, not only colour', async (status, text, icon) => {
    const root = await render(status);
    expect(root.querySelector('[data-testid="chip-label"]')?.textContent?.trim()).toBe(text);
    const iconEl = root.querySelector('[data-testid="chip-icon"]');
    expect(iconEl?.textContent?.trim()).toBe(icon);
    expect(iconEl?.getAttribute('aria-hidden')).toBe('true');
    expect(root.querySelector('[data-testid="chip"]')?.getAttribute('data-status')).toBe(status);
  });

  it('is announced as a status to screen readers', async () => {
    const root = await render('AMBER');
    expect(root.querySelector('[role="status"]')).not.toBeNull();
  });

  it('reflects a status change', async () => {
    const fixture = TestBed.createComponent(StatusChipComponent);
    fixture.componentRef.setInput('status', 'GREEN');
    await fixture.whenStable();
    fixture.componentRef.setInput('status', 'RED');
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Diferencia grande');
  });
});
