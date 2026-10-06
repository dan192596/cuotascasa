import { type InvalidInputCode, InvalidInputError } from '../../src/types/primitives.ts';

/** Ejecuta `run` y devuelve el código del `InvalidInputError` lanzado, o 'NO_ERROR'. Relanza cualquier otro error. */
export function invalidInputCode(run: () => unknown): InvalidInputCode | 'NO_ERROR' {
  try {
    run();
  } catch (error) {
    if (error instanceof InvalidInputError) {
      return error.code;
    }
    throw error;
  }
  return 'NO_ERROR';
}

/** Ejecuta `run` y devuelve lo que lanzó, o 'NO_ERROR' si no lanzó nada. */
export function thrownBy(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return 'NO_ERROR';
}
