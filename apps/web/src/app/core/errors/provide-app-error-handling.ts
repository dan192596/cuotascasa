import {
  type EnvironmentProviders,
  ErrorHandler,
  Injectable,
  InjectionToken,
  inject,
  isDevMode,
  makeEnvironmentProviders,
} from '@angular/core';
import { AppToastService } from './app-toast.service.ts';

/** When true (development only) the full error is also logged. Production never logs messages, stacks or data. */
export const CC_ERROR_LOG_VERBOSE = new InjectionToken<boolean>('CC_ERROR_LOG_VERBOSE', {
  providedIn: 'root',
  factory: () => isDevMode(),
});

export const GENERIC_ERROR_MESSAGE =
  'Algo salió mal. Tus datos siguen guardados en este dispositivo. Recarga la página e inténtalo de nuevo.';

/** Domain error codes (e.g. E_LOAN) and Error class names (e.g. LoanError); anything else may carry data. */
const SAFE_CODE = /^[A-Z][A-Z0-9_]{1,40}$/;
const SAFE_NAME = /^[A-Z][A-Za-z]{0,63}Error$/;

function safeToken(value: unknown, pattern: RegExp): string | undefined {
  return typeof value === 'string' && pattern.test(value) ? value : undefined;
}

/** Only the error class name and an optional machine code survive; messages, stacks and payloads are dropped. */
function sanitize(error: unknown): { name: string; code?: string } {
  if (error instanceof Error) {
    const code = safeToken((error as { code?: unknown }).code, SAFE_CODE);
    return { name: safeToken(error.name, SAFE_NAME) ?? 'UnknownError', ...(code ? { code } : {}) };
  }
  return { name: 'UnknownError' };
}

@Injectable()
export class AppErrorHandler implements ErrorHandler {
  private readonly toast = inject(AppToastService);
  private readonly verbose = inject(CC_ERROR_LOG_VERBOSE);

  handleError(error: unknown): void {
    if (this.verbose) {
      console.error('[CuotasCasa]', error);
    } else {
      console.error('[CuotasCasa] Error no controlado', sanitize(error));
    }
    this.toast.show(GENERIC_ERROR_MESSAGE);
  }
}

/** Global ErrorHandler: Spanish toast and sanitized production logs (ADR-0021: no stack traces or financial data). */
export function provideAppErrorHandling(): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: ErrorHandler, useClass: AppErrorHandler }]);
}
