import { ErrorHandler } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { CC_STUB, provideAppErrorHandling } from './provide-app-error-handling.ts';

describe('provideAppErrorHandling (inert W0-05 stub, W3-09)', () => {
  it('only installs its CC_STUB marker and keeps the default ErrorHandler', () => {
    TestBed.configureTestingModule({ providers: [provideAppErrorHandling()] });
    expect(CC_STUB).toBe('CC_STUB:W3-09');
    expect(TestBed.inject(ErrorHandler).constructor).toBe(ErrorHandler);
  });
});
