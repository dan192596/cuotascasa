import { describe, expect, it } from 'vitest';
import { loadPending } from './pending.ts';
import { CI_SEED, PROPERTIES, runProperty } from './properties.ts';

const seed = CI_SEED;
const pending = new Map(loadPending().map((entry) => [entry.property, entry]));

describe(`engine invariants (fast-check, fixed CI seed): ${String(PROPERTIES.length - pending.size)} active, ${String(pending.size)} quarantined`, () => {
  for (const definition of PROPERTIES) {
    const label = `[${definition.rules.join(', ')}] ${definition.title}`;
    const entry = pending.get(definition.id);
    if (entry) {
      // Cuarentena: si la propiedad empieza a pasar, `it.fails` falla y obliga a sacarla de properties-pending.json.
      it.fails(`QUARANTINED ${label}`, { timeout: 120_000 }, () => {
        runProperty(definition, entry.seed);
      });
    } else {
      it(label, { timeout: 120_000 }, () => {
        runProperty(definition, seed);
      });
    }
  }

  it('lists every property exactly once', () => {
    const ids = PROPERTIES.map((definition) => definition.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
