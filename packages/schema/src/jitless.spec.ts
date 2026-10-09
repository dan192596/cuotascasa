import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { loanSchema } from './index.ts';

describe('zod runs without eval (ADR-0021)', () => {
  it('sets jitless before any schema parses', () => {
    expect(loanSchema).toBeDefined();
    expect(z.config().jitless).toBe(true);
  });
});
