import { readFileSync } from 'node:fs';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { HouseMeterComponent } from './house-meter.component.ts';

async function render(percent: string, label?: string) {
  const fixture = TestBed.createComponent(HouseMeterComponent);
  fixture.componentRef.setInput('percent', percent);
  if (label !== undefined) fixture.componentRef.setInput('label', label);
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  const meter = root.querySelector('[role="meter"]') as HTMLElement;
  const fill = root.querySelector('[data-testid="house-fill"]') as SVGElement;
  return { fixture, root, meter, fill };
}

describe('cc-house-meter', () => {
  it('exposes role=meter with aria-valuenow/min/max and a text label', async () => {
    const { meter, root } = await render('62.5');
    expect(meter).not.toBeNull();
    expect(meter.getAttribute('aria-valuemin')).toBe('0');
    expect(meter.getAttribute('aria-valuemax')).toBe('100');
    expect(meter.getAttribute('aria-valuenow')).toBe('62.5');
    expect(meter.getAttribute('aria-valuetext')).toBe('62.5 % capital pagado');
    expect(meter.getAttribute('aria-label')).toBe('capital pagado');
    expect(root.querySelector('[data-testid="house-text"]')?.textContent).toContain('62.5 %');
    expect(root.querySelector('[data-testid="house-text"]')?.textContent).toContain('capital pagado');
  });

  it('keeps the text outside the house graphic and hides the graphic from assistive tech', async () => {
    const { root } = await render('40');
    const svg = root.querySelector('svg') as SVGElement;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.textContent?.trim()).toBe('');
  });

  it.each([
    ['0', 0],
    ['25', 0.25],
    ['62.5', 0.625],
    ['100', 1],
  ])('fills the house in proportion to %s %%', async (percent, ratio) => {
    const { fill } = await render(percent);
    expect(fill.style.transform).toBe(`scaleY(${ratio})`);
  });

  it.each([
    ['-5', '0'],
    ['140', '100'],
    ['abc', '0'],
    ['', '0'],
  ])('clamps or ignores out-of-range input %j', async (input, shown) => {
    const { meter, fill } = await render(input);
    expect(meter.getAttribute('aria-valuenow')).toBe(shown);
    expect(fill.style.transform).toBe(`scaleY(${Number(shown) / 100})`);
  });

  it('accepts a custom label', async () => {
    const { meter } = await render('10', 'avance');
    expect(meter.getAttribute('aria-label')).toBe('avance');
    expect(meter.getAttribute('aria-valuetext')).toBe('10 % avance');
  });

  it('gives each instance its own clip-path id', async () => {
    const a = await render('10');
    const b = await render('20');
    const idOf = (el: HTMLElement) => el.querySelector('clipPath')?.getAttribute('id');
    expect(idOf(a.root)).toBeTruthy();
    expect(idOf(a.root)).not.toBe(idOf(b.root));
    expect(a.fill.parentElement?.getAttribute('clip-path')).toBe(`url(#${idOf(a.root)})`);
  });

  it('only animates when the user has no reduced-motion preference', () => {
    const source = readFileSync('apps/web/src/app/ui/house-meter/house-meter.component.ts', 'utf8');
    const reduced = source.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\}\s*\}/);
    expect(reduced?.[0]).toMatch(/transition:\s*none/);
    // every other transition declaration lives inside the no-preference block
    const withoutBlocks = source.replace(/@media \(prefers-reduced-motion: [a-z-]+\)\s*\{[\s\S]*?\}\s*\}/g, '');
    expect(withoutBlocks).not.toMatch(/transition\s*:/);
    expect(source).toMatch(/@media \(prefers-reduced-motion: no-preference\)/);
  });
});
