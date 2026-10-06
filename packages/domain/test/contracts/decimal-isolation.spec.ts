import { Decimal } from 'decimal.js';
import { describe, expect, it, vi } from 'vitest';

/**
 * [ALG.CONV] / ADR-0003: el contexto del dominio no hereda la configuración global de decimal.js. La prueba vive fuera
 * de `src/` porque es la única que toca la configuración global (y la restaura).
 */
describe('[ALG.CONV] isolated decimal context', () => {
  it('starts from the decimal.js defaults even if the global configuration changed before it loaded', async () => {
    const saved = { toExpNeg: Decimal.toExpNeg, maxE: Decimal.maxE, minE: Decimal.minE, modulo: Decimal.modulo };
    Decimal.set({ toExpNeg: -1, maxE: 10, minE: -10, modulo: Decimal.EUCLID });
    try {
      vi.resetModules();
      const { DomainDecimal } = await import('../../src/money/decimal-config.ts');
      expect(DomainDecimal.precision).toBe(34);
      expect(DomainDecimal.rounding).toBe(Decimal.ROUND_HALF_EVEN);
      expect(DomainDecimal.toExpNeg).toBe(-7);
      expect(DomainDecimal.toExpPos).toBe(21);
      expect(DomainDecimal.maxE).toBe(9e15);
      expect(DomainDecimal.minE).toBe(-9e15);
      expect(DomainDecimal.modulo).toBe(Decimal.ROUND_DOWN);
      expect(DomainDecimal.crypto).toBe(false);
    } finally {
      Decimal.set(saved);
    }
    expect(Decimal.maxE).toBe(9e15);
  });
});
