import { describe, expect, it } from 'vitest';
import fixedChargeChangeSource from '../fixed-charge-change/index.ts?raw';
import rateChangeSource from './index.ts?raw';

/** El código sin comentarios de bloque ni de línea. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const sources = { 'rate-change/index.ts': rateChangeSource, 'fixed-charge-change/index.ts': fixedChargeChangeSource };

describe('owned handlers call the EngineContext helpers instead of implementing level/term math', () => {
  it.each(Object.entries(sources))('%s has no level/term formula', (_name, source) => {
    expect(code(source)).not.toMatch(
      /decimal\.js|\bDecimal\b|\bdec\(|\bdecInt\(|halfUp2|Math\.(log|pow)|\*\*|\.pow\(|\.ln\(/,
    );
    expect(code(source)).not.toMatch(/from '\.\.\/\.\.\/schedule\//);
  });

  it('RateChange delegates level and term to ctx.levelPayment and ctx.remainingTerm', () => {
    expect(code(rateChangeSource)).toContain('ctx.levelPayment(');
    expect(code(rateChangeSource)).toContain('ctx.remainingTerm(');
  });
});
