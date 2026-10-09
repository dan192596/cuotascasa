import { describe, expect, it } from 'vitest';
import { BUILD_VARIANTS, addProbeListener, patchAngularJson, summarizeBuildFailure } from './builds.mjs';

const ANGULAR_JSON = JSON.stringify({
  projects: { web: { architect: { build: { options: { server: 'main.server.ts', outputMode: 'static' } } } } },
});
const optionsOf = (json) => JSON.parse(json).projects.web.architect.build.options;
const variant = (id) => BUILD_VARIANTS.find((candidate) => candidate.id === id);

describe('patchAngularJson', () => {
  it('leaves the plain variants as they are', () => {
    expect(optionsOf(patchAngularJson(ANGULAR_JSON, variant('plain')))).toEqual({
      server: 'main.server.ts',
      outputMode: 'static',
    });
  });

  it('turns autoCsp on and keeps SSR for the variant that is expected to be refused', () => {
    expect(optionsOf(patchAngularJson(ANGULAR_JSON, variant('autocsp-ssr')))).toEqual({
      server: 'main.server.ts',
      outputMode: 'static',
      security: { autoCsp: true },
    });
  });

  it('turns autoCsp on and drops the server for the CSR-only variant', () => {
    expect(optionsOf(patchAngularJson(ANGULAR_JSON, variant('autocsp-csr')))).toEqual({ security: { autoCsp: true } });
  });
});

describe('addProbeListener', () => {
  const SOURCE = [
    "  template: '<h1>CuotasCasa</h1><cc-quick-simulator />',",
    'export class LandingPageComponent {}',
  ].join('\n');

  it('adds a click listener, so that withEventReplay() emits its inline scripts', () => {
    const patched = addProbeListener(SOURCE);
    expect(patched).toContain('(click)="probe()"');
    expect(patched).toContain('probe(): void {}');
  });

  it('refuses to patch a landing page whose template changed', () => {
    expect(() => addProbeListener('export class LandingPageComponent {}')).toThrow(/template changed/);
  });
});

describe('summarizeBuildFailure', () => {
  it('quotes the Angular CLI reason without machine paths', () => {
    const output = '✖ Building... [FAILED: Cannot set both SSR and auto-CSP at the same time.]\nSee "/private/x/log"';
    expect(summarizeBuildFailure(output)).toBe('Cannot set both SSR and auto-CSP at the same time.');
  });

  it('falls back to the first esbuild error, then to a generic message', () => {
    expect(summarizeBuildFailure('✘ [ERROR] Could not resolve "x"\n more')).toBe('Could not resolve "x"');
    expect(summarizeBuildFailure('boom')).toBe('ng build failed');
  });
});
