import { DestroyRef, inject, type Signal, signal } from '@angular/core';

/** How long the «Listo» banner of a save stays on screen when nothing else hides it first. */
export const SAVE_NOTICE_MS = 5000;

/** State of the success banner shown after a save that keeps the user on the same screen (ADR-0026 §5.6). */
export interface SaveNotice {
  /** The message of the banner; null while it is hidden. */
  readonly message: Signal<string | null>;
  /** Shows the banner (replacing any previous message) and hides it after `SAVE_NOTICE_MS`. */
  show(message: string): void;
  /** Hides it at once: the user started the next edit, or closed it. */
  hide(): void;
}

/**
 * Creates the state of a save banner; call it in an injection context (a field initializer). The screen reader already
 * hears the save through the Announcer, so the banner that renders this is `[live]="false"`.
 */
export function createSaveNotice(ms = SAVE_NOTICE_MS): SaveNotice {
  const message = signal<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const hide = (): void => {
    clearTimeout(timer);
    timer = undefined;
    message.set(null);
  };
  inject(DestroyRef).onDestroy(() => clearTimeout(timer));
  return {
    message: message.asReadonly(),
    show(text: string): void {
      clearTimeout(timer);
      message.set(text);
      timer = setTimeout(hide, ms);
    },
    hide,
  };
}
