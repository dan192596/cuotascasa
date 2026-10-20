import type { Theme } from './sweep-routes.ts';

/** A defect the sweep found in a file this card does not own. Each one cites its finding in the W6-02 report. */
export interface KnownDefect {
  readonly check: 'axe' | 'runtime';
  readonly caseId: string;
  readonly themes: readonly Theme[];
  /** axe rule id (axe checks only). */
  readonly rule?: string;
  /** Finding id and one line: shown as the reason of the skipped test. */
  readonly finding: string;
}

export const KNOWN_DEFECTS: readonly KnownDefect[] = [];
