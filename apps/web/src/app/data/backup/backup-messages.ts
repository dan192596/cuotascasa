import type { BackupImportErrorCode } from '../api.ts';

/**
 * Spanish text of every import failure, by code. The text is fixed: it never echoes file content, which can carry
 * amounts, names or a passphrase.
 */
export const BACKUP_IMPORT_MESSAGES: Readonly<Record<BackupImportErrorCode, string>> = {
  INVALID_JSON: 'El archivo no es un respaldo válido: no se pudo leer su contenido.',
  FOREIGN_FORMAT: 'El archivo no es un respaldo de CuotasCasa.',
  UNSUPPORTED_VERSION: 'Este respaldo usa una versión que esta aplicación no puede leer.',
  FUTURE_VERSION:
    'Este respaldo fue creado con una versión más nueva de CuotasCasa. Actualiza la aplicación para importarlo.',
  VALIDATION: 'El respaldo está dañado o incompleto, así que no se importó nada.',
  PASSPHRASE_REQUIRED: 'Este respaldo está cifrado. Escribe la frase con la que se cifró.',
  WRONG_PASSPHRASE: 'La frase es incorrecta o el archivo fue alterado.',
};
