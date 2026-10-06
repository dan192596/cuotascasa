import { computed, inject, Injectable, InjectionToken, signal } from '@angular/core';

/** Port the store reads from; data/ stores read the DataStore the same way (data-layer.tokens.ts). */
export interface NotesSource {
  load(): Promise<readonly string[]>;
  save(notes: readonly string[]): Promise<void>;
}

export const NOTES_SOURCE = new InjectionToken<NotesSource>('NotesSource');

/**
 * GOLDEN PATTERN · signal store (docs/specs/angular-patterns.md §4).
 * Private writable signals, public read-only signals and computed values, async methods that write through the port
 * and update state only after the write succeeded. Writes run one after another: each reads the state the previous
 * one left, so two quick writes never overwrite each other.
 */
@Injectable()
export class NotesStore {
  private readonly source = inject(NOTES_SOURCE);
  private readonly state = signal<readonly string[]>([]);
  private readonly loaded = signal(false);
  private writes: Promise<unknown> = Promise.resolve();

  readonly notes = this.state.asReadonly();
  readonly ready = this.loaded.asReadonly();
  readonly count = computed(() => this.state().length);

  async load(): Promise<void> {
    this.state.set(await this.source.load());
    this.loaded.set(true);
  }

  add(note: string): Promise<void> {
    return this.serialized(async () => {
      const next = [...this.state(), note];
      await this.source.save(next);
      this.state.set(next);
    });
  }

  /** Chains a read-modify-write after the previous one; a failed write rejects its caller and does not block the next. */
  private serialized(write: () => Promise<void>): Promise<void> {
    const run = this.writes.then(write);
    this.writes = run.catch(() => undefined);
    return run;
  }
}
