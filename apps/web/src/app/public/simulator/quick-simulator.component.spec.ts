import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeLocalDate } from '@cuotascasa/domain';
import { PUBLIC_CLOCK } from '../public-clock.ts';
import { QuickSimulatorComponent } from './quick-simulator.component.ts';

/** Controllable IntersectionObserver: the test decides when the placeholder "enters the viewport". */
class FakeObserver {
  static instances: FakeObserver[] = [];
  private readonly callback: (entries: { isIntersecting: boolean }[]) => void;
  constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
    this.callback = callback;
    FakeObserver.instances.push(this);
  }
  observe(): void {}
  disconnect(): void {}
  fire(): void {
    this.callback([{ isIntersecting: true }]);
  }
}

describe('cc-quick-simulator host', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeObserver.instances = [];
  });

  async function setup() {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    TestBed.configureTestingModule({
      providers: [{ provide: PUBLIC_CLOCK, useValue: { today: () => makeLocalDate(2026, 1, 15) } }],
    });
    const fixture = TestBed.createComponent(QuickSimulatorComponent);
    await fixture.whenStable();
    return fixture;
  }

  it('shows a light static form with the legend and no results until the placeholder nears the viewport', async () => {
    const fixture = await setup();
    const root = fixture.nativeElement as HTMLElement;
    for (const id of ['sim-principal', 'sim-rate', 'sim-years', 'sim-prepay-toggle']) {
      expect(root.querySelector(`input#${id}`), id).toBeTruthy();
    }
    expect(root.querySelector('[data-testid="sim-rate-legend"]')?.textContent?.trim()).toBe('+ 1.26 % seguros FHA');
    expect(root.querySelector('[data-testid="sim-results"]')).toBeNull();
    expect(root.querySelector('cc-quick-simulator-form')).toBeNull();
  });

  it('swaps the placeholder for the interactive form when it enters the viewport', async () => {
    const fixture = await setup();
    const root = fixture.nativeElement as HTMLElement;
    FakeObserver.instances[0]?.fire();
    await vi.waitFor(() => expect(root.querySelector('cc-quick-simulator-form')).toBeTruthy(), { timeout: 10000 });
    await fixture.whenStable();
    expect(root.querySelector('[data-testid="sim-placeholder"]')).toBeNull();
    expect(root.querySelectorAll('cc-quick-simulator-form').length).toBe(1);
  });

  it('loads at once when IntersectionObserver is unavailable', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    TestBed.configureTestingModule({
      providers: [{ provide: PUBLIC_CLOCK, useValue: { today: () => makeLocalDate(2026, 1, 15) } }],
    });
    const fixture = TestBed.createComponent(QuickSimulatorComponent);
    await fixture.whenStable();
    await vi.waitFor(() =>
      expect(
        (fixture.nativeElement.parentElement as HTMLElement).querySelector('cc-quick-simulator-form'),
      ).toBeTruthy(),
    );
  });
});
