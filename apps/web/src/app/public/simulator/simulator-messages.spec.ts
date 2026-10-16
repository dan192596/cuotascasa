import { describe, expect, it } from 'vitest';
import { InvalidInputError, NegativeAmortizationError, parseMoney } from '@cuotascasa/domain';
import { describeSimulationError, installmentRangeMessage, SIMULATOR_MESSAGES } from './simulator-messages.ts';

describe('describeSimulationError', () => {
  it('maps INSTALLMENT_OUT_OF_RANGE by code and never shows the error message', () => {
    const error = new InvalidInputError('INSTALLMENT_OUT_OF_RANGE', 'secret amount 123456.78', { k: 5 });
    const text = describeSimulationError(error);
    expect(text).toBe(SIMULATOR_MESSAGES.prepayOutOfRange);
    expect(text).not.toContain('123456');
  });

  it('maps any other domain error and unknown throwables to the generic text', () => {
    expect(describeSimulationError(new InvalidInputError('INVALID_TERMS', 'x'))).toBe(
      SIMULATOR_MESSAGES.calculationFailed,
    );
    expect(
      describeSimulationError(new NegativeAmortizationError('ALG.TERM', 3, parseMoney('1.00'), parseMoney('2.00'))),
    ).toBe(SIMULATOR_MESSAGES.calculationFailed);
    expect(describeSimulationError('boom')).toBe(SIMULATOR_MESSAGES.calculationFailed);
  });

  it('builds the installment range text', () => {
    expect(installmentRangeMessage(239)).toContain('1 y 239');
  });
});
