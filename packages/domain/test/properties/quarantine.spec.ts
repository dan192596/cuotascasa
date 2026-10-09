import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { loadPending, parsePending } from './pending.ts';
import { type PropertyDefinition, PROPERTIES, quarantineStatus } from './properties.ts';

const valid = {
  property: PROPERTIES[0]?.id ?? '',
  seed: 7,
  rule: 'ALG.LAST',
  counterexample: 'synthetic',
  reasoning: 'synthetic',
};

describe('properties-pending.json (visible quarantine)', () => {
  const pending = loadPending();

  it(`holds ${String(pending.length)} quarantined properties, each with seed, rule, counterexample and reasoning`, () => {
    expect(pending.length).toBeLessThanOrEqual(PROPERTIES.length);
    for (const entry of pending) {
      expect(Number.isInteger(entry.seed)).toBe(true);
      expect(entry.rule).toMatch(/^ALG\./);
      // Cero datos reales: los contraejemplos son sintéticos y nunca llevan correos ni rutas.
      expect(`${entry.counterexample} ${entry.reasoning}`).not.toMatch(/@|\/Users\//);
    }
  });

  it('rejects an unknown property, a duplicate, a non-integer seed and empty fields', () => {
    expect(() => parsePending({ entries: [{ ...valid, property: 'does-not-exist' }] })).toThrow(/unknown property/);
    expect(() => parsePending({ entries: [valid, valid] })).toThrow(/duplicate/);
    expect(() => parsePending({ entries: [{ ...valid, seed: 1.5 }] })).toThrow(/seed/);
    expect(() => parsePending({ entries: [{ ...valid, reasoning: ' ' }] })).toThrow(/reasoning/);
    expect(() => parsePending({ entries: [{ ...valid, counterexample: '' }] })).toThrow(/counterexample/);
    expect(parsePending({ entries: [valid] })).toHaveLength(1);
    expect(parsePending({ entries: [] })).toEqual([]);
  });
});

describe('quarantine mechanism', () => {
  const always = (holds: boolean): PropertyDefinition => ({
    id: holds ? 'always-holds' : 'never-holds',
    title: 'synthetic',
    rules: ['ALG.CONV'],
    numRuns: 20,
    build: () => fc.property(fc.integer(), () => holds) as ReturnType<PropertyDefinition['build']>,
  });

  it('reports a failing property as FAILING (stays quarantined)', () => {
    expect(quarantineStatus(always(false), 1)).toBe('FAILING');
  });

  it('reports a property that starts passing as PASSING (it.fails then turns the suite red)', () => {
    expect(quarantineStatus(always(true), 1)).toBe('PASSING');
  });
});
