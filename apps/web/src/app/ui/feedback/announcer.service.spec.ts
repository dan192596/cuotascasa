import { LiveAnnouncer } from '@angular/cdk/a11y';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Announcer } from './announcer.service.ts';

describe('Announcer', () => {
  const live = { announce: vi.fn(() => Promise.resolve()), clear: vi.fn() };
  let announcer: Announcer;

  beforeEach(() => {
    live.announce.mockClear();
    live.clear.mockClear();
    TestBed.configureTestingModule({ providers: [{ provide: LiveAnnouncer, useValue: live }] });
    announcer = TestBed.inject(Announcer);
  });

  it('announces politely by default', async () => {
    await announcer.announce('Cuota recalculada');
    expect(live.announce).toHaveBeenCalledWith('Cuota recalculada', 'polite');
  });

  it('polite() and assertive() set the politeness', async () => {
    await announcer.polite('a');
    await announcer.assertive('b');
    expect(live.announce).toHaveBeenNthCalledWith(1, 'a', 'polite');
    expect(live.announce).toHaveBeenNthCalledWith(2, 'b', 'assertive');
  });

  it('ignores blank messages', async () => {
    await announcer.announce('   ');
    expect(live.announce).not.toHaveBeenCalled();
  });

  it('clear() clears the live region', () => {
    announcer.clear();
    expect(live.clear).toHaveBeenCalledTimes(1);
  });
});
