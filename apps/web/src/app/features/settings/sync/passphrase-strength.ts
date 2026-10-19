/** Length from which a phrase is no longer rated weak (ADR-0009: PBKDF2 does not resist offline guessing of short ones). */
export const MIN_RECOMMENDED_LENGTH = 12;

export interface PassphraseStrength {
  /** 0 = empty, 1 = weak, 2 = acceptable, 3 = strong. */
  readonly level: 0 | 1 | 2 | 3;
  readonly label: string;
}

const LABELS: Readonly<Record<0 | 1 | 2 | 3, string>> = {
  0: 'Escribe una frase',
  1: 'Débil',
  2: 'Aceptable',
  3: 'Fuerte',
};

function characterClasses(phrase: string): number {
  const tests = [/\p{Ll}/u, /\p{Lu}/u, /\p{Nd}/u, /[^\p{L}\p{Nd}]/u];
  return tests.filter((test) => test.test(phrase)).length;
}

/**
 * Local, offline rating of a passphrase: a guide for the owner, never a gate. Length dominates; a phrase with
 * few distinct characters is weak whatever its length. The phrase is only read, never stored or sent anywhere.
 */
export function passphraseStrength(phrase: string): PassphraseStrength {
  const length = [...phrase].length;
  let level: 0 | 1 | 2 | 3;
  if (length === 0) {
    level = 0;
  } else if (length < MIN_RECOMMENDED_LENGTH || new Set(phrase).size <= 4) {
    level = 1;
  } else if (length >= 16 && characterClasses(phrase) >= 3) {
    level = 3;
  } else {
    level = 2;
  }
  return { level, label: LABELS[level] };
}
