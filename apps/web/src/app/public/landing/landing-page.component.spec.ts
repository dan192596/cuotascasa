import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { describe, expect, it } from 'vitest';
import { LandingPageComponent } from './landing-page.component.ts';

function render(): HTMLElement {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(LandingPageComponent);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('LandingPageComponent (HU-01, R1)', () => {
  it('keeps the page test id and a single main landmark', () => {
    const root = render();
    expect(root.getAttribute('data-testid')).toBe('page-landing');
    expect(root.querySelectorAll('main')).toHaveLength(1);
  });

  it('has one h1 with the hero promise and h2 sections below it', () => {
    const root = render();
    const h1 = root.querySelectorAll('h1');
    expect(h1).toHaveLength(1);
    expect(h1[0]?.textContent).toContain('Tu casa se va llenando');
    expect(root.querySelectorAll('main h2').length).toBeGreaterThanOrEqual(2);
  });

  it('shows the privacy call to action', () => {
    expect(render().textContent).toContain('Tus datos se quedan en tu navegador');
  });

  it('links to /app and /privacidad', () => {
    const hrefs = Array.from(render().querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/app');
    expect(hrefs).toContain('/privacidad');
  });

  it('hosts the quick simulator inside main', () => {
    expect(render().querySelector('main cc-quick-simulator')).not.toBeNull();
  });

  it('has a decorative house labelled as illustrative paid principal', () => {
    const root = render();
    const svg = root.querySelector('svg.house');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(root.querySelector('.house-caption')?.textContent).toContain('capital pagado (ilustrativo)');
  });

  it('ends with a footer: repository link, no tracking note and the disclaimer', () => {
    const footer = render().querySelector('footer');
    expect(footer?.textContent).toContain(
      'Cifras estimadas; el banco tiene la última palabra. No es asesoría financiera.',
    );
    const repo = footer?.querySelector('a[href^="https://github.com/"]');
    expect(repo?.textContent).toContain('Repositorio');
    expect(repo?.getAttribute('rel')).toContain('noopener');
  });
});
