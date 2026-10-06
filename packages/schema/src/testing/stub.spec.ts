import { describe, expect, it } from 'vitest';
import { NotImplementedError } from '../errors.ts';
import { entityArbitraries } from './index.ts';

describe('testing stub (owned by W1-03, deleted when implemented)', () => {
  it('entityArbitraries throws NotImplementedError naming W1-03', () => {
    expect(() => entityArbitraries()).toThrow(NotImplementedError);
    expect(() => entityArbitraries()).toThrow(/W1-03/);
  });
});
