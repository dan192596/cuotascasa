import { DOCUMENT, Injectable, inject } from '@angular/core';

export type AnnouncerPoliteness = 'polite' | 'assertive';

/** Delay between emptying a region and writing the message, so screen readers announce a repeated text again. */
const ANNOUNCE_DELAY_MS = 100;

/**
 * Screen-reader announcements: results politely, errors may interrupt. Two visually hidden `aria-live` regions,
 * written with `textContent` only. No CDK `LiveAnnouncer`: it pulls Angular's HTML sanitizer into the shared core
 * chunk that the landing loads (ADR-0025).
 */
@Injectable({ providedIn: 'root' })
export class Announcer {
  private readonly document = inject(DOCUMENT);
  private readonly regions = new Map<AnnouncerPoliteness, HTMLElement>();
  private readonly timers = new Map<AnnouncerPoliteness, ReturnType<typeof setTimeout>>();

  announce(message: string, politeness: AnnouncerPoliteness = 'polite'): Promise<void> {
    if (message.trim() === '') return Promise.resolve();
    const region = this.region(politeness);
    region.textContent = '';
    clearTimeout(this.timers.get(politeness));
    return new Promise((resolve) => {
      this.timers.set(
        politeness,
        setTimeout(() => {
          region.textContent = message;
          resolve();
        }, ANNOUNCE_DELAY_MS),
      );
    });
  }

  polite(message: string): Promise<void> {
    return this.announce(message, 'polite');
  }

  assertive(message: string): Promise<void> {
    return this.announce(message, 'assertive');
  }

  clear(): void {
    for (const region of this.regions.values()) {
      region.textContent = '';
    }
  }

  private region(politeness: AnnouncerPoliteness): HTMLElement {
    let region = this.regions.get(politeness);
    if (region === undefined) {
      region = this.document.createElement('div');
      region.setAttribute('aria-live', politeness);
      region.setAttribute('aria-atomic', 'true');
      region.dataset['ccAnnouncer'] = politeness;
      // Visually hidden through the CSSOM (allowed by the CSP, unlike a style attribute in markup).
      Object.assign(region.style, {
        position: 'absolute',
        width: '1px',
        height: '1px',
        margin: '-1px',
        padding: '0',
        overflow: 'hidden',
        clip: 'rect(0 0 0 0)',
        whiteSpace: 'nowrap',
        border: '0',
      });
      this.regions.set(politeness, region);
    }
    // An open modal dialog hides everything outside it from assistive technology, so announce inside it.
    const modals = this.document.querySelectorAll<HTMLElement>('[aria-modal="true"]');
    const host = modals.item(modals.length - 1) ?? this.document.body;
    if (region.parentElement !== host) host.append(region);
    return region;
  }
}
