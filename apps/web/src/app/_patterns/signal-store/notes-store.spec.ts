import type { Signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { NOTES_SOURCE, type NotesSource, NotesStore } from './notes-store.ts';

/** `failures`: how many of the first saves reject before the port recovers. */
function fakeSource(initial: readonly string[], failures = 0): NotesSource & { saved: (readonly string[])[] } {
  const saved: (readonly string[])[] = [];
  let remainingFailures = failures;
  return {
    saved,
    load: () => Promise.resolve(initial),
    save: (notes) => {
      if (remainingFailures > 0) {
        remainingFailures -= 1;
        return Promise.reject(new Error('disco lleno'));
      }
      saved.push(notes);
      return Promise.resolve();
    },
  };
}

function setup(source: NotesSource): NotesStore {
  TestBed.configureTestingModule({ providers: [NotesStore, { provide: NOTES_SOURCE, useValue: source }] });
  return TestBed.inject(NotesStore);
}

describe('GOLDEN PATTERN · signal store test', () => {
  it('exposes read-only signals that follow load and writes', async () => {
    const source = fakeSource(['primera']);
    const store = setup(source);
    expectTypeOf(store.notes).toEqualTypeOf<Signal<readonly string[]>>();
    expectTypeOf(store.ready).toEqualTypeOf<Signal<boolean>>();
    expectTypeOf(store.count).toEqualTypeOf<Signal<number>>();
    expect(store.ready()).toBe(false);
    await store.load();
    expect(store.ready()).toBe(true);
    expect(store.notes()).toEqual(['primera']);
    await store.add('segunda');
    expect(store.count()).toBe(2);
    expect(source.saved).toEqual([['primera', 'segunda']]);
    await Promise.all([store.add('tercera'), store.add('cuarta')]);
    expect(store.notes()).toEqual(['primera', 'segunda', 'tercera', 'cuarta']);
    expect(source.saved.at(-1)).toEqual(['primera', 'segunda', 'tercera', 'cuarta']);
  });

  it('keeps the state unchanged when the write fails and does not block the next write', async () => {
    const store = setup(fakeSource(['primera'], 1));
    await store.load();
    await expect(store.add('segunda')).rejects.toThrow('disco lleno');
    expect(store.notes()).toEqual(['primera']);
    await store.add('tercera');
    expect(store.notes()).toEqual(['primera', 'tercera']);
  });
});
