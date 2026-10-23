import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { describe, expect, it } from 'vitest';
import { LANDING_EXAMPLE_SUMMARY as S } from './example/example-summary.generated.ts';
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

  it('has one h1 «Calcula tus cuotas, mes a mes.» with «mes a mes.» emphasised, and h2 sections below it', () => {
    const root = render();
    const h1 = root.querySelectorAll('h1');
    expect(h1).toHaveLength(1);
    expect(h1[0]?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Calcula tus cuotas, mes a mes.');
    expect(h1[0]?.querySelector('em')?.textContent).toBe('mes a mes.');
    expect(root.querySelectorAll('main h2').length).toBeGreaterThanOrEqual(2);
  });

  it('opens with a mosaic of six blocks: the example level installment and the «Sin cuenta» promise', () => {
    const root = render();
    const blocks = root.querySelectorAll('[data-testid="mosaic-block"]');
    expect(blocks).toHaveLength(6);
    const text = root.querySelector('.mosaic')?.textContent ?? '';
    expect(text).toContain('Q 4,263.47');
    expect(text).toContain('Q 500,000 · 20 años · 7.00 % + 1.26 %');
    expect(text).toContain('Sin cuenta. Tus números se quedan en tu navegador.');
    expect(text).toContain('Calcular mi cuota');
  });

  it('has the «240 cuotas. Muévelas.» section with the board at installment 60', () => {
    const root = render();
    const section = root.querySelector('#juego');
    expect(section?.querySelector('h2')?.textContent).toContain('240 cuotas. Muévelas.');
    expect(section?.textContent).toContain('Arrastra el círculo amarillo por los 20 años del préstamo.');
    const board = section?.querySelector('cc-landing-board');
    expect(board?.querySelectorAll('.tiles i')).toHaveLength(240);
    expect(board?.querySelector('[role="slider"]')?.getAttribute('aria-valuenow')).toBe('60');
    expect(board?.textContent).toContain('Cuota 60 de 240');
    expect(board?.textContent).toContain(S.at60.balance);
  });

  it('shows every example figure from the engine-generated summary', () => {
    const root = render();
    expect(root.querySelector('.mosaic .big')?.textContent?.trim()).toBe(S.level);
    const rows = Array.from(root.querySelectorAll('.c0 .row')).map((row) =>
      Array.from(row.querySelectorAll('span')).map((span) => span.textContent?.trim()),
    );
    expect(rows).toEqual([
      ['Interés', S.first.interest],
      ['Seguros', S.first.insurance],
      ['Capital', S.first.capital],
      ['Cuota 1', S.first.total],
    ]);
  });

  it('lets «Calcular mi cuota» move focus to the simulator (focusable wrapper, no extra landmark name)', () => {
    const root = render();
    const target = root.querySelector('#simulador');
    expect(target?.getAttribute('tabindex')).toBe('-1');
    expect(target?.hasAttribute('aria-labelledby')).toBe(false);
  });

  it('has the four stacking cards with the prototype titles', () => {
    const titles = Array.from(render().querySelectorAll('.card h3')).map((h) => h.textContent?.trim());
    expect(titles).toEqual([
      'Mira a dónde va cada quetzal.',
      'Prueba un abono antes de hacerlo.',
      '¿Cuadra con tu estado de cuenta?',
      'Sin cuenta, sin servidor.',
    ]);
  });

  it('renders the four counters with their final values (complete at rest)', () => {
    const stats = Array.from(render().querySelectorAll('[data-testid="stat"]'));
    expect(stats.map((s) => s.querySelector('b')?.textContent?.trim())).toEqual([
      '240',
      S.prepayment.amount,
      String(S.monthsSaved),
      S.costSaved,
    ]);
    expect(stats.map((s) => s.querySelector('span')?.textContent?.trim())).toEqual([
      'cuotas del ejemplo',
      'de abono en la cuota 60',
      'meses menos',
      'de intereses y seguros ahorrados',
    ]);
  });

  it('links to /app and /privacidad', () => {
    const hrefs = Array.from(render().querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/app');
    expect(hrefs).toContain('/privacidad');
  });

  it('hosts the quick simulator inside main', () => {
    expect(render().querySelector('main cc-quick-simulator')).not.toBeNull();
  });

  it('never scrambles the headline: only the h2 titles carry data-scramble', () => {
    const root = render();
    expect(root.querySelector('h1')?.hasAttribute('data-scramble')).toBe(false);
    expect(root.querySelectorAll('h2[data-scramble]')).toHaveLength(2);
  });

  it('leaves modified or non-primary clicks on in-page links to the browser (open in a new tab)', () => {
    const link = render().querySelector<HTMLAnchorElement>('a[href="#como"]');
    for (const init of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
      const click = new MouseEvent('click', { ...init, bubbles: true, cancelable: true });
      link?.dispatchEvent(click);
      expect(click.defaultPrevented).toBe(false);
    }
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
