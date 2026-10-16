/** Resolved canvas colours of the chart (one per token role). */
export interface Palette {
  readonly ink: string;
  readonly 'ink-muted': string;
  readonly accent: string;
  readonly rule: string;
}

const ROLES = ['ink', 'ink-muted', 'accent', 'rule'] as const;

/** True when every role resolved to a colour: a canvas must never be drawn with an empty one. */
export function isCompletePalette(palette: Palette): boolean {
  return ROLES.every((role) => palette[role].trim() !== '');
}

export function samePalette(a: Palette, b: Palette): boolean {
  return ROLES.every((role) => a[role] === b[role]);
}
