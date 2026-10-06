import { ErrorHandler } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { CC_STUB, provideAppTheme } from './provide-app-theme.ts';

describe('provideAppTheme (inert W0-05 stub, W3-05)', () => {
  it('only installs its CC_STUB marker and keeps the default ErrorHandler', () => {
    TestBed.configureTestingModule({ providers: [provideAppTheme()] });
    expect(CC_STUB).toBe('CC_STUB:W3-05');
    expect(TestBed.inject(ErrorHandler).constructor).toBe(ErrorHandler);
  });
});
