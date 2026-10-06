import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { CLOCK, DATA_STORE, ID_GENERATOR } from '../data-layer.tokens.ts';
import { CC_STUB, provideDataStores } from './provide-data-stores.ts';

describe('provideDataStores (inert W0-05 stub, W3-10)', () => {
  it('carries the CC_STUB marker of its owner card', () => {
    expect(CC_STUB).toBe('CC_STUB:W3-10');
  });

  it('provides no data-layer token yet', () => {
    TestBed.configureTestingModule({ providers: [provideDataStores()] });
    expect(TestBed.inject(DATA_STORE, null)).toBeNull();
    expect(TestBed.inject(CLOCK, null)).toBeNull();
    expect(TestBed.inject(ID_GENERATOR, null)).toBeNull();
  });
});
