import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { SYNC_SERVICE } from '../tokens.ts';
import { CC_STUB, provideSync } from './provide-sync.ts';

describe('provideSync (inert W0-05 stub, W4-09)', () => {
  it("stays 'no configurado' and never connects", async () => {
    TestBed.configureTestingModule({ providers: [provideSync()] });
    const sync = TestBed.inject(SYNC_SERVICE);
    expect(CC_STUB).toBe('CC_STUB:W4-09');
    expect(sync.configured()).toBe(false);
    expect(sync.status()).toEqual({ state: 'not-configured' });
    expect(sync.statusText()).toBe('No configurado');
    await expect(sync.connect()).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
  });
});
