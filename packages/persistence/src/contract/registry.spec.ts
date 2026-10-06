import type { LoanEvent } from '@cuotascasa/schema';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { Clock, DataStore, IdGenerator, LoanChildRepository, Repository, SettingsRepository } from '../ports.ts';
import { CONTRACT_CASES } from './cases.ts';
import { PORT_METHODS, PORT_METHOD_IDS } from './registry.ts';

/** Names of the function-valued members of T (properties such as `loans` are excluded). */
type MethodKeys<T> = { [K in keyof T]-?: T[K] extends (...args: never[]) => unknown ? K : never }[keyof T] & string;

describe('covered-method registry (meta-test)', () => {
  it('PORT_METHODS lists exactly the methods declared in ports.ts, per interface', () => {
    expectTypeOf<(typeof PORT_METHODS)['Clock'][number]>().toEqualTypeOf<MethodKeys<Clock>>();
    expectTypeOf<(typeof PORT_METHODS)['IdGenerator'][number]>().toEqualTypeOf<MethodKeys<IdGenerator>>();
    expectTypeOf<(typeof PORT_METHODS)['Repository'][number]>().toEqualTypeOf<MethodKeys<Repository<LoanEvent>>>();
    expectTypeOf<(typeof PORT_METHODS)['LoanChildRepository'][number]>().toEqualTypeOf<
      Exclude<MethodKeys<LoanChildRepository<LoanEvent>>, MethodKeys<Repository<LoanEvent>>>
    >();
    expectTypeOf<(typeof PORT_METHODS)['SettingsRepository'][number]>().toEqualTypeOf<MethodKeys<SettingsRepository>>();
    expectTypeOf<(typeof PORT_METHODS)['DataStore'][number]>().toEqualTypeOf<MethodKeys<DataStore>>();
    expect(PORT_METHOD_IDS).toHaveLength(26);
  });

  it('the union of covers over CONTRACT_CASES equals every port method', () => {
    const covered = new Set(CONTRACT_CASES.flatMap((contractCase) => contractCase.covers));
    expect([...covered].sort()).toEqual([...PORT_METHOD_IDS].sort());
  });

  it('every case covers at least one method and names are unique', () => {
    expect(CONTRACT_CASES.every((contractCase) => contractCase.covers.length > 0)).toBe(true);
    const names = CONTRACT_CASES.map((contractCase) => contractCase.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
