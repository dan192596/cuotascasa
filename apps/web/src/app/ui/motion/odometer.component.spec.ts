import { readFileSync } from 'node:fs';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { OdometerComponent } from './odometer.component.ts';

const SOURCE = 'apps/web/src/app/ui/motion/odometer.component.ts';

async function render(value: string) {
  const fixture = TestBed.createComponent(OdometerComponent);
  fixture.componentRef.setInput('value', value);
  await fixture.whenStable();
  return { fixture, root: fixture.nativeElement as HTMLElement };
}

describe('cc-odometer', () => {
  it('exposes the exact final text as the accessible name and hides the columns', async () => {
    const { root } = await render('Q 984,048.18');
    const host = root.querySelector('[data-testid="odometer"]') as HTMLElement;
    expect(host.getAttribute('role')).toBe('img');
    expect(host.getAttribute('aria-label')).toBe('Q 984,048.18');
    for (const part of Array.from(host.children)) expect(part.getAttribute('aria-hidden')).toBe('true');
  });

  it('renders the final text in the DOM at first render (digits as columns, other chars fixed)', async () => {
    const { root } = await render('Q 984,048.18');
    expect(root.querySelectorAll('.col').length).toBe(8);
    expect(root.querySelectorAll('.fixed').length).toBe(4);
    const shown = Array.from(root.querySelectorAll('.col, .fixed'))
      .map((el) => el.getAttribute('data-char'))
      .join('');
    expect(shown).toBe('Q 984,048.18');
    expect(root.querySelector('.text')?.textContent).toBe('Q 984,048.18');
  });

  it('points each column at its digit without converting text to a number', async () => {
    const { root } = await render('Q 407');
    const cols = Array.from(root.querySelectorAll<HTMLElement>('.col'));
    expect(cols.map((c) => c.getAttribute('data-digit'))).toEqual(['4', '0', '7']);
    expect(cols.map((c) => c.style.getPropertyValue('--cc-digit'))).toEqual(['4', '0', '7']);
  });

  it('updates when the value changes', async () => {
    const { fixture, root } = await render('Q 1');
    fixture.componentRef.setInput('value', 'Q 25');
    await fixture.whenStable();
    expect(root.querySelector('[data-testid="odometer"]')?.getAttribute('aria-label')).toBe('Q 25');
    expect(root.querySelectorAll('.col').length).toBe(2);
  });

  it('rolls only without a reduced-motion preference', () => {
    const source = readFileSync(SOURCE, 'utf8');
    const noPref = source.match(/@media \(prefers-reduced-motion: no-preference\)\s*\{[\s\S]*?\}\s*\}/)?.[0] ?? '';
    expect(noPref).toMatch(/animation:/);
    const outside = source.replace(/@media \(prefers-reduced-motion: [a-z-]+\)\s*\{[\s\S]*?\}\s*\}/g, '');
    expect(outside).not.toMatch(/animation\s*:/);
    expect(outside).not.toMatch(/transition\s*:/);
  });

  it('never goes through JS numbers (no Number(), parseFloat, parseInt or unary +)', () => {
    const source = readFileSync(SOURCE, 'utf8');
    expect(source).not.toMatch(/\bNumber\s*\(/);
    expect(source).not.toMatch(/\bparse(Float|Int)\b/);
    expect(source).not.toMatch(/(^|[=(,:?&|!*/%<>[{]|return)\s*\+\s*[A-Za-z_$(]/m);
  });
});
