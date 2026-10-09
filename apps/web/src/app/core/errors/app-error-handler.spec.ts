import { ErrorHandler } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppToastService } from './app-toast.service.ts';
import { CC_ERROR_LOG_VERBOSE, provideAppErrorHandling } from './provide-app-error-handling.ts';

/** A synthetic loan that must never reach a production log. */
const SYNTHETIC_LOAN = { id: 'loan-synthetic-1', principal: '123456.78', rate: '7.25', synthetic: true };

class LoanFailure extends Error {
  readonly code = 'E_LOAN';
  constructor() {
    super(`Cannot project ${JSON.stringify(SYNTHETIC_LOAN)}`);
    this.name = 'LoanFailure';
  }
}

function setup(verbose: boolean): { handler: ErrorHandler; toast: AppToastService; logged: () => string } {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  TestBed.configureTestingModule({
    providers: [provideAppErrorHandling(), { provide: CC_ERROR_LOG_VERBOSE, useValue: verbose }],
  });
  return {
    handler: TestBed.inject(ErrorHandler),
    toast: TestBed.inject(AppToastService),
    logged: () =>
      JSON.stringify(spy.mock.calls, (_key, value: unknown) =>
        value instanceof Error ? { m: value.message, s: value.stack } : value,
      ),
  };
}

describe('provideAppErrorHandling', () => {
  beforeEach(() => TestBed.resetTestingModule());
  afterEach(() => vi.restoreAllMocks());

  it('shows a Spanish toast without leaking the error text', () => {
    const { handler, toast } = setup(false);
    handler.handleError(new LoanFailure());
    expect(toast.message()).toBe(
      'Algo salió mal. Tus datos siguen guardados en este dispositivo. Recarga la página e inténtalo de nuevo.',
    );
    expect(toast.message()).not.toContain('loan-synthetic-1');
  });

  it('logs no entity data, message or stack in production', () => {
    const { handler, logged } = setup(false);
    handler.handleError(new LoanFailure());
    const output = logged();
    expect(output).toContain('LoanFailure');
    expect(output).toContain('E_LOAN');
    for (const secret of ['loan-synthetic-1', '123456.78', '7.25', 'Cannot project', 'at ']) {
      expect(output).not.toContain(secret);
    }
  });

  it('logs a generic entry for non-Error values (strings, entities)', () => {
    const { handler, logged } = setup(false);
    handler.handleError(SYNTHETIC_LOAN);
    handler.handleError('loan-synthetic-1 failed');
    expect(logged()).not.toContain('loan-synthetic-1');
    expect(logged()).not.toContain('123456.78');
  });

  it('keeps the full error only in verbose (development) mode', () => {
    const { handler, logged } = setup(true);
    handler.handleError(new LoanFailure());
    expect(logged()).toContain('Cannot project');
  });

  it('toast can be dismissed and does not stack duplicates', () => {
    const { handler, toast } = setup(false);
    handler.handleError(new Error('a'));
    handler.handleError(new Error('b'));
    expect(toast.message()).not.toBeNull();
    toast.dismiss();
    expect(toast.message()).toBeNull();
  });
});
