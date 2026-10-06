import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { TwoStepFormComponent, type TwoStepValue } from './two-step-form.component.ts';

async function setup() {
  const fixture = TestBed.createComponent(TwoStepFormComponent);
  const saved: TwoStepValue[] = [];
  fixture.componentInstance.saved.subscribe((value) => saved.push(value));
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  const field = (id: string) => element.querySelector(`#${id}`) as HTMLInputElement;
  const heading = () => element.querySelector('h2') as HTMLHeadingElement;
  const announcement = () => element.querySelector('[aria-live="polite"]')?.textContent?.trim();
  const button = (text: string) =>
    [...element.querySelectorAll('button')].find(
      (candidate) => candidate.textContent?.trim() === text,
    ) as HTMLButtonElement;
  const type = async (id: string, text: string) => {
    field(id).value = text;
    field(id).dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };
  const click = async (text: string) => {
    button(text).click();
    await fixture.whenStable();
  };
  // Enter: the browser submits the field's form through its default (first submit) button.
  const pressEnter = async (id: string) => {
    field(id).form?.requestSubmit();
    await fixture.whenStable();
  };
  return { element, field, heading, announcement, button, type, click, pressEnter, saved };
}

describe('GOLDEN PATTERN · two-step form', () => {
  it('blocks «Siguiente» on an invalid step, shows the Spanish message and focuses the field', async () => {
    const { element, field, heading, announcement, click } = await setup();
    expect(field('alias').getAttribute('aria-invalid')).toBe('false');
    await click('Siguiente');
    expect(heading().textContent).toContain('Paso 1 de 2');
    expect(field('alias').getAttribute('aria-invalid')).toBe('true');
    expect(field('alias').getAttribute('aria-describedby')).toBe('alias-errors');
    expect(document.activeElement).toBe(field('alias'));
    expect(announcement()).toBe('');
    expect(element.querySelector('#alias-errors')?.textContent).toContain(
      'Escribe un alias para identificar el préstamo.',
    );
  });

  it('treats Enter on step 1 as «Siguiente»: it validates only that step', async () => {
    const { element, field, heading, type, pressEnter } = await setup();
    // jsdom does not navigate: read the flag after next() ran (its listener was registered first) to pin preventDefault.
    const defaultPrevented: boolean[] = [];
    field('alias').form?.addEventListener('submit', (event) => defaultPrevented.push(event.defaultPrevented));
    await pressEnter('alias');
    expect(heading().textContent).toContain('Paso 1 de 2');
    expect(element.querySelector('#alias-errors')?.textContent).toContain(
      'Escribe un alias para identificar el préstamo.',
    );
    await type('alias', 'Préstamo casa');
    await pressEnter('alias');
    expect(defaultPrevented).toEqual([true, true]);
    expect(heading().textContent).toContain('Paso 2 de 2');
    expect(element.querySelector('#months-errors')).toBeNull();
    expect(field('months').getAttribute('aria-invalid')).toBe('false');
  });

  it('moves focus to the step heading and announces the step on every change', async () => {
    const { heading, announcement, button, type, click } = await setup();
    expect(document.activeElement).not.toBe(heading());
    await type('alias', 'Préstamo casa');
    await click('Siguiente');
    expect(heading().getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(heading());
    expect(heading().textContent).toContain('Paso 2 de 2');
    expect(announcement()).toBe('Paso 2 de 2');
    // A real click leaves focus on «Atrás», which the step change removes: the heading must take it back.
    button('Atrás').focus();
    await click('Atrás');
    expect(document.activeElement).toBe(heading());
    expect(announcement()).toBe('Paso 1 de 2');
  });

  it('keeps the values when going back', async () => {
    const { heading, field, type, click } = await setup();
    await type('alias', 'Préstamo casa');
    await click('Siguiente');
    expect(heading().textContent).toContain('Paso 2 de 2');
    await click('Atrás');
    expect(field('alias').value).toBe('Préstamo casa');
  });

  it('validates step 2 on «Guardar», focuses the invalid field and emits the value once valid', async () => {
    const { element, field, type, click, saved } = await setup();
    await type('alias', 'Préstamo casa');
    await click('Siguiente');
    await type('months', '1.5');
    await click('Guardar');
    expect(saved).toEqual([]);
    expect(field('months').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(field('months'));
    expect(element.querySelector('#months-errors')?.textContent).toContain(
      'El plazo debe ser un número entero de meses mayor que 0.',
    );
    await type('months', '240');
    await click('Guardar');
    expect(saved).toEqual([{ alias: 'Préstamo casa', months: '240' }]);
  });
});
