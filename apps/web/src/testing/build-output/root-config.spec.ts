import { ViewportScroller } from '@angular/common';
import { ApplicationRef, ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appConfig } from '../../app/app.config.ts';

/**
 * Root providers that ADR-0021 and the W2-02 card require (app.config.spec.ts is frozen for W0-05, so these live in
 * the W2-02-owned build-output suite; run with `ng test --configuration=dist`).
 */
describe('app.config.ts root providers (W2-02)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('restores the scroll position to the top on a forward navigation (withInMemoryScrolling)', async () => {
    TestBed.configureTestingModule({ providers: appConfig.providers });
    const scroller = TestBed.inject(ViewportScroller);
    vi.spyOn(scroller, 'setHistoryScrollRestoration').mockImplementation(() => undefined);
    vi.spyOn(scroller, 'getScrollPosition').mockReturnValue([0, 0]);
    // jsdom has no window.scrollTo.
    const scrollToPosition = vi.spyOn(scroller, 'scrollToPosition').mockImplementation(() => undefined);
    // The router scroller starts in the router's bootstrap listener, so bootstrap a root component for real.
    document.body.appendChild(document.createElement('cc-scroll-probe-root'));
    TestBed.inject(ApplicationRef).bootstrap(ScrollProbeRootComponent);
    await TestBed.inject(Router).navigateByUrl('/privacidad');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(scrollToPosition).toHaveBeenCalledWith([0, 0]);
  });
});

@Component({
  selector: 'cc-scroll-probe-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ScrollProbeRootComponent {}
