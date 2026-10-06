import { ErrorHandler } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { CC_STUB, provideAppPwa } from './provide-app-pwa.ts';

describe('provideAppPwa (inert W0-05 stub, W3-14)', () => {
  it('only installs its CC_STUB marker and keeps the default ErrorHandler', () => {
    TestBed.configureTestingModule({ providers: [provideAppPwa()] });
    expect(CC_STUB).toBe('CC_STUB:W3-14');
    expect(TestBed.inject(ErrorHandler).constructor).toBe(ErrorHandler);
  });
});
