import { Injectable, signal } from '@angular/core';

/** Session memory of the unencrypted-export notice (privacy page): once shown and accepted, it does not return. */
@Injectable({ providedIn: 'root' })
export class ExportSession {
  readonly warningAccepted = signal(false);
}
