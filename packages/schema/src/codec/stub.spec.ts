import { describe, expect, it } from 'vitest';
import { NotImplementedError } from '../errors.ts';
import { parseBackup, serializeBackup } from './index.ts';

describe('codec stub (owned by W1-03, deleted when implemented)', () => {
  it('parseBackup throws NotImplementedError naming W1-03', () => {
    expect(() => parseBackup('{}')).toThrow(NotImplementedError);
    expect(() => parseBackup('{}')).toThrow(/W1-03/);
  });

  it('serializeBackup throws NotImplementedError naming W1-03', () => {
    const call = (): string => serializeBackup({} as never);
    expect(call).toThrow(NotImplementedError);
    expect(call).toThrow(/W1-03/);
  });
});
