import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { EmptyStateComponent } from './empty-state.component.ts';

@Component({
  imports: [EmptyStateComponent],
  template: `
    <cc-empty-state heading="Aún no tienes préstamos">
      Crea uno, restaura un respaldo o conecta Drive.
      <button ccEmptyActions type="button">Crear préstamo</button>
    </cc-empty-state>
  `,
})
class HostComponent {}

describe('cc-empty-state', () => {
  it('shows the heading, the projected description and the projected actions', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('h2')?.textContent?.trim()).toBe('Aún no tienes préstamos');
    expect(root.textContent).toContain('Crea uno, restaura un respaldo');
    expect(root.querySelector('[data-testid="empty-actions"] button')?.textContent).toContain('Crear préstamo');
  });
});
