import { readFileSync } from 'node:fs';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { PRIVACY_LAST_UPDATED, PrivacyPageComponent } from './privacy-page.component.ts';

/** Required headings come from the frozen spec (cwd = repository root), exactly as W4-05 must read them. */
const DOC = readFileSync('docs/specs/privacy-requirements.md', 'utf8');
const SECTION = DOC.split('## Encabezados obligatorios')[1]?.split('\n## ')[0] ?? '';
const HEADINGS = [...SECTION.matchAll(/^- `([^`]+)`/gm)].map((match) => match[1] ?? '');

async function render(issuesUrl: string): Promise<HTMLElement> {
  const fixture = TestBed.createComponent(PrivacyPageComponent);
  fixture.componentRef.setInput('issuesUrl', issuesUrl);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('cc-privacy-page', () => {
  it('reads the 11 required headings from the spec', () => {
    expect(HEADINGS.length).toBe(11);
  });

  it('renders every required heading as an <h2>, in order', async () => {
    const root = await render('');
    const h2s = [...root.querySelectorAll('h2')].map((h) => h.textContent?.trim());
    expect(h2s).toEqual(HEADINGS);
  });

  it('wraps the content in <main> with one <h1> and keeps the page test id', async () => {
    const root = await render('');
    expect(root.getAttribute('data-testid')).toBe('page-privacy');
    expect(root.querySelectorAll('main').length).toBe(1);
    expect(root.querySelectorAll('h1').length).toBe(1);
    expect(root.hasAttribute('data-cc-stub')).toBe(false);
  });

  it('shows the last update as dd/mm/aaaa', async () => {
    const root = await render('');
    expect(PRIVACY_LAST_UPDATED).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(root.querySelector('[data-testid="privacy-updated"]')?.textContent).toContain(PRIVACY_LAST_UPDATED);
  });

  it('renders the contact link only when issuesUrl is non-empty', async () => {
    expect((await render('')).querySelector('[data-testid="privacy-contact-link"]')).toBeNull();
    TestBed.resetTestingModule();
    const link = (await render('https://example.test/repo/issues')).querySelector<HTMLAnchorElement>(
      '[data-testid="privacy-contact-link"]',
    );
    expect(link?.getAttribute('href')).toBe('https://example.test/repo/issues');
    expect(link?.getAttribute('rel')).toContain('noopener');
  });

  it('contains no email address and loads no external resource', async () => {
    const html = (await render('https://example.test/repo/issues')).innerHTML;
    expect(html).not.toMatch(/[^\s@]+@[^\s@]+/);
    expect(html).not.toMatch(/<(img|script|iframe|link)\b/i);
  });

  it('states the facts: drive.appdata, appDataFolder, AES-256-GCM, PBKDF2 and no analytics', async () => {
    const text = (await render('')).textContent ?? '';
    for (const term of [
      'drive.appdata',
      'appDataFolder',
      'AES-256-GCM',
      'PBKDF2',
      '600,000',
      'IndexedDB',
      'cuotascasa.json',
    ]) {
      expect(text, term).toContain(term);
    }
  });

  it('links the Google API User Data Policy as a plain anchor and the injected Issues URL passes the allowlist', async () => {
    // Same anchor allowlist as build-output.spec.ts (Opus, PR #53).
    const allowed = [
      /^https:\/\/developers\.google\.com\/terms\/api-services-user-data-policy$/,
      /^https:\/\/policies\.google\.com\/privacy$/,
      /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues$/,
    ];
    const root = await render('https://github.com/example-owner/example-repo/issues');
    const policy = root.querySelector<HTMLAnchorElement>('[data-testid="privacy-google-policy-link"]');
    expect(policy?.getAttribute('href')).toBe('https://developers.google.com/terms/api-services-user-data-policy');
    expect(policy?.getAttribute('rel')).toBe('noopener noreferrer');
    const hrefs = [...root.querySelectorAll('a')]
      .map((a) => a.getAttribute('href') ?? '')
      .filter((href) => /^https?:/.test(href));
    expect(hrefs.length).toBe(2);
    expect(hrefs.filter((href) => !allowed.some((re) => re.test(href)))).toEqual([]);
    expect(root.querySelectorAll('script, img, iframe, link, [src]').length).toBe(0);
  });
});
