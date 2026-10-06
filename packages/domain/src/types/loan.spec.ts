import { describe, expect, it } from 'vitest';
import { TEMPLATE_IDS } from './loan.ts';

describe('[ALG.TEMPLATES] template ids', () => {
  it('lists the two v1 templates', () => {
    expect(TEMPLATE_IDS).toEqual(['fha-gt', 'simple']);
  });
});
