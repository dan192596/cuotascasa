import { Injectable, signal } from '@angular/core';

/** In-memory (never persisted) collapse state: folded for the session, back on the next visit. */
@Injectable({ providedIn: 'root' })
export class SafariBannerState {
  readonly collapsed = signal(false);

  toggle(): void {
    this.collapsed.update((value) => !value);
  }
}
