/**
 * Largest backup file the import will read, in bytes (also the cap of the Drive download in
 * packages/sync/src/google-drive/provider.ts; keep the two equal). A household's backup is a few MB of JSON and about
 * 4/3 of that as an encrypted envelope (base64): see backup-size-cap.spec.ts, which measures it. 20 MiB leaves more than
 * 2x headroom over the largest realistic dataset while a hostile or accidental huge file is refused before it is read.
 */
export const MAX_DATA_FILE_BYTES = 20 * 1024 * 1024;
