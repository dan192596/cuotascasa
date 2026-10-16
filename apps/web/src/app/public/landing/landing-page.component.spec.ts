import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { describe, expect, it } from 'vitest';
import { LandingPageComponent } from './landing-page.component.ts';

function render(issuesUrl?: string | undefined): HTMLElement {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(LandingPageComponent);
  if (issuesUrl !== undefined) fixture.componentRef.setInput('issuesUrl', issuesUrl);
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

  it('ends with a footer with the disclaimer', () => {
    expect(render().querySelector('footer')?.textContent).toContain(
      'Cifras estimadas; el banco tiene la última palabra. No es asesoría financiera.',
    );
  });

  it('renders no repository link when the issues URL is empty (dev build)', () => {
    const footer = render().querySelector('footer');
    expect(footer?.querySelector('a')).toBeNull();
    expect(footer?.textContent).not.toContain('Repositorio');
  });

  it('derives the repository link from the injected issues URL', () => {
    const repo = render('https://example.test/owner/repo/issues').querySelector('footer a');
    expect(repo?.textContent).toContain('Repositorio');
    expect(repo?.getAttribute('href')).toBe('https://example.test/owner/repo');
    expect(repo?.getAttribute('rel')).toContain('noopener');
  });

  it('keeps a URL that does not end in /issues as is, and ignores a trailing slash', () => {
    expect(render('https://example.test/o/r/').querySelector('footer a')?.getAttribute('href')).toBe(
      'https://example.test/o/r',
    );
  });

  it('treats an unbound (undefined) issues URL as empty', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(LandingPageComponent);
    fixture.componentRef.setInput('issuesUrl', undefined);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('footer a')).toBeNull();
  });

  it('ignores non-https issues URLs', () => {
    expect(render('javascript:alert(1)').querySelector('footer a')).toBeNull();
  });

  it('has no literal github.com URL in the landing sources', () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
      .filter((f) => readFileSync(join(dir, f), 'utf8').includes('github.com/'));
    expect(offenders).toEqual([]);
  });
});
