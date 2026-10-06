import { describe, expect, it } from 'vitest';
import { expectNotImplemented } from '../../test/support/not-implemented.ts';
import { isStubHandler } from '../stub.ts';
import { DOMAIN_EVENT_TYPES } from '../types/events.ts';
import { actualPaymentHandler } from './actual-payment/index.ts';
import { advanceInstallmentsHandler } from './advance-installments/index.ts';
import { fixedChargeChangeHandler } from './fixed-charge-change/index.ts';
import { prepaymentHandler } from './prepayment/index.ts';
import { rateChangeHandler } from './rate-change/index.ts';
import { EVENT_HANDLER_OWNERS, eventHandlers } from './registry.ts';
import { reportedBalanceHandler } from './reported-balance/index.ts';

describe('event handler registry', () => {
  it('has exactly one handler per domain event type', () => {
    expect(Object.keys(eventHandlers).sort()).toEqual([...DOMAIN_EVENT_TYPES].sort());
    expect(Object.keys(EVENT_HANDLER_OWNERS).sort()).toEqual([...DOMAIN_EVENT_TYPES].sort());
  });

  it('assigns each event type to its owning card', () => {
    expect(EVENT_HANDLER_OWNERS).toEqual({
      ReportedBalance: 'W2-05',
      RateChange: 'W2-03',
      FixedChargeChange: 'W2-03',
      Prepayment: 'W2-04',
      AdvanceInstallments: 'W2-04',
      ActualPayment: 'W2-05',
    });
  });

  it('maps each type to the handler exported by its card-owned directory', () => {
    expect(eventHandlers.ReportedBalance).toBe(reportedBalanceHandler);
    expect(eventHandlers.RateChange).toBe(rateChangeHandler);
    expect(eventHandlers.FixedChargeChange).toBe(fixedChargeChangeHandler);
    expect(eventHandlers.Prepayment).toBe(prepaymentHandler);
    expect(eventHandlers.AdvanceInstallments).toBe(advanceInstallmentsHandler);
    expect(eventHandlers.ActualPayment).toBe(actualPaymentHandler);
  });

  it('every type whose card has not landed maps to a stub that throws NotImplementedError(<owner>)', () => {
    for (const type of DOMAIN_EVENT_TYPES) {
      const handler = eventHandlers[type];
      if (isStubHandler(handler)) {
        expect(handler.stubOwner).toBe(EVENT_HANDLER_OWNERS[type]);
        expectNotImplemented(() => {
          Reflect.apply(handler, undefined, []);
        }, EVENT_HANDLER_OWNERS[type]);
      } else {
        expect(typeof handler).toBe('function');
      }
    }
  });
});
