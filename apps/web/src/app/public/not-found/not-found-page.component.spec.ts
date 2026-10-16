import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { NotFoundPageComponent } from './not-found-page.component.ts';

describe('cc-not-found-page', () => {
  it('renders a <main> with the heading, a way home and the page test id', async () => {
    const fixture = TestBed.createComponent(NotFoundPageComponent);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.getAttribute('data-testid')).toBe('page-not-found');
    expect(root.hasAttribute('data-cc-stub')).toBe(false);
    expect(root.querySelectorAll('main').length).toBe(1);
    expect(root.querySelector('h1')?.textContent?.trim()).toBe('Página no encontrada');
    expect([...root.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(['/', '/app']);
  });
});
