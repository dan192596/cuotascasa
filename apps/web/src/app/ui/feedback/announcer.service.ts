import { LiveAnnouncer } from '@angular/cdk/a11y';
import { Injectable, inject } from '@angular/core';

export type AnnouncerPoliteness = 'polite' | 'assertive';

/** Thin wrapper over the CDK `LiveAnnouncer`: results are announced politely, errors may interrupt. */
@Injectable({ providedIn: 'root' })
export class Announcer {
  private readonly live = inject(LiveAnnouncer);

  announce(message: string, politeness: AnnouncerPoliteness = 'polite'): Promise<void> {
    if (message.trim() === '') return Promise.resolve();
    return this.live.announce(message, politeness);
  }

  polite(message: string): Promise<void> {
    return this.announce(message, 'polite');
  }

  assertive(message: string): Promise<void> {
    return this.announce(message, 'assertive');
  }

  clear(): void {
    this.live.clear();
  }
}
