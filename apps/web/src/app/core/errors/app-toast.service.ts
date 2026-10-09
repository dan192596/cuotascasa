import { Injectable, signal } from '@angular/core';

/** Holds the single visible toast of the app. Messages are fixed Spanish copy: never user data or error text. */
@Injectable({ providedIn: 'root' })
export class AppToastService {
  private readonly current = signal<string | null>(null);
  readonly message = this.current.asReadonly();

  show(message: string): void {
    this.current.set(message);
  }

  dismiss(): void {
    this.current.set(null);
  }
}
