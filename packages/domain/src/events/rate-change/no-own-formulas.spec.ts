import { describe, expect, it } from 'vitest';

declare global {
  interface ImportMeta {
    glob(
      pattern: string | string[],
      options: { eager: true; query: '?raw'; import: 'default' },
    ): Record<string, string>;
  }
}

const files = import.meta.glob(['../fixed-charge-change/index.ts', './index.ts'], {
  eager: true,
  query: '?raw',
  import: 'default',
});
const fixedChargeChangeSource = files['../fixed-charge-change/index.ts'] ?? '';
const rateChangeSource = files['./index.ts'] ?? '';

/** El código sin comentarios de bloque ni de línea. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const sources = { 'rate-change/index.ts': rateChangeSource, 'fixed-charge-change/index.ts': fixedChargeChangeSource };

describe('owned handlers call the EngineContext helpers instead of implementing level/term math', () => {
  it.each(Object.entries(sources))('%s has no level/term formula', (_name, source) => {
    expect(code(source)).not.toMatch(
      /decimal\.js|\bDecimal\b|\bdec\(|\bdecInt\(|halfUp2|Math\.(log|pow)|\*\*|\.pow\(|\.ln\(|moneyMul|moneyDiv/,
    );
    expect(code(source)).not.toMatch(/\b(for|while)\s*\(/);
    expect(code(source)).not.toMatch(/from '\.\.\/\.\.\/schedule\//);
  });

  it('reads both sources', () => {
    expect(rateChangeSource).not.toBe('');
    expect(fixedChargeChangeSource).not.toBe('');
  });

  it('RateChange delegates level and term to ctx.levelPayment and ctx.remainingTerm', () => {
    expect(code(rateChangeSource)).toContain('ctx.levelPayment(');
    expect(code(rateChangeSource)).toContain('ctx.remainingTerm(');
  });
});
