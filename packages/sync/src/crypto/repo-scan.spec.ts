/// <reference types="node" />
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ENVELOPE_FORMAT } from '../ports.ts';
import { deriveStoredKey, encrypt, serializeEnvelope } from './index.ts';

/**
 * ADR-0009 decision 2: encrypted envelopes are generated at run time and never versioned. This scan reads every file
 * tracked by git and fails if one holds an envelope, as a JSON document or as a JSON fragment inside any other file.
 */

// Built from parts so this file never contains the pattern it looks for.
const ENVELOPE_FRAGMENT = new RegExp(`"format"\\s*:\\s*"${ENVELOPE_FORMAT}"`);

function holdsEnvelope(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => holdsEnvelope(item));
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return record['format'] === ENVELOPE_FORMAT || Object.values(record).some((item) => holdsEnvelope(item));
  }
  return false;
}

function fileHoldsEnvelope(text: string): boolean {
  if (!text.includes(ENVELOPE_FORMAT)) {
    return false;
  }
  if (ENVELOPE_FRAGMENT.test(text)) {
    return true;
  }
  try {
    return holdsEnvelope(JSON.parse(text));
  } catch {
    return false;
  }
}

const here = fileURLToPath(new URL('.', import.meta.url));
const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: here, encoding: 'utf8' }).trim();

describe('no encrypted envelope is versioned (repo scan)', () => {
  it('the detector recognizes an envelope generated at run time, alone or embedded', async () => {
    const key = await deriveStoredKey('frase sintética del escaneo', { iterations: 1_000 });
    const text = serializeEnvelope(await encrypt(key, '{"synthetic":true}'));
    expect(fileHoldsEnvelope(text)).toBe(true);
    expect(fileHoldsEnvelope(JSON.stringify({ wrapper: [JSON.parse(text) as unknown] }, null, 2))).toBe(true);
    expect(fileHoldsEnvelope(`export const sample = ${JSON.stringify(JSON.parse(text), null, 2)};`)).toBe(true);
    expect(fileHoldsEnvelope(`const format = '${ENVELOPE_FORMAT}';`)).toBe(false);
  });

  it('no tracked file contains an envelope', () => {
    const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
      .split('\0')
      .filter((file) => file !== '');
    expect(files.length).toBeGreaterThan(100);
    const offenders = files.filter((file) => {
      let text: string;
      try {
        text = readFileSync(join(root, file), 'utf8');
      } catch {
        return false; // tracked but deleted in the working tree
      }
      return fileHoldsEnvelope(text);
    });
    expect(offenders).toEqual([]);
  });
});
