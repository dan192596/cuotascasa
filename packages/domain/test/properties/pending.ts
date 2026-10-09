/**
 * Cuarentena visible de W3-02: `properties-pending.json` lista las propiedades que fallan por un defecto del motor.
 * Cada entrada cita la semilla que falla y espera dictamen de Opus; W4-02 corrige el motor y vacía el archivo.
 */
import pendingFile from './properties-pending.json' with { type: 'json' };
import { PROPERTIES } from './properties.ts';

export interface PendingEntry {
  /** Id de la propiedad en `PROPERTIES`. */
  readonly property: string;
  /** Semilla de fast-check con la que la propiedad falla. */
  readonly seed: number;
  /** Regla `[ALG.*]` de `docs/algorithm.md` que la propiedad respalda. */
  readonly rule: string;
  /** Contraejemplo mínimo sintético, tal como lo reduce fast-check. */
  readonly counterexample: string;
  /** Por qué se cree que es un defecto del motor (o una ambigüedad de la regla) y qué espera de Opus. */
  readonly reasoning: string;
}

export interface PendingFile {
  readonly entries: readonly PendingEntry[];
}

export function parsePending(parsed: PendingFile): PendingEntry[] {
  const known = new Set(PROPERTIES.map((definition) => definition.id));
  const seen = new Set<string>();
  return parsed.entries.map((entry) => {
    if (!known.has(entry.property)) {
      throw new Error(`properties-pending.json: unknown property "${entry.property}"`);
    }
    if (seen.has(entry.property)) {
      throw new Error(`properties-pending.json: duplicate property "${entry.property}"`);
    }
    seen.add(entry.property);
    if (!Number.isInteger(entry.seed)) {
      throw new Error(`properties-pending.json: "${entry.property}" must cite the failing integer seed`);
    }
    for (const field of ['rule', 'counterexample', 'reasoning'] as const) {
      if (entry[field].trim() === '') {
        throw new Error(`properties-pending.json: "${entry.property}" needs a non-empty ${field}`);
      }
    }
    return entry;
  });
}

export function loadPending(): PendingEntry[] {
  return parsePending(pendingFile as PendingFile);
}
