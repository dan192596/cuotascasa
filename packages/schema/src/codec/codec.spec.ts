import fc from 'fast-check';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { actualPaymentExample } from '../__examples__/actual-payment.example.ts';
import { loanExample } from '../__examples__/loan.example.ts';
import { loanEventExample } from '../__examples__/loan-event.example.ts';
import { reportedBalanceExample } from '../__examples__/reported-balance.example.ts';
import { scenarioExample } from '../__examples__/scenario.example.ts';
import { deviceSettingsExample, syncedSettingsExample } from '../__examples__/settings.example.ts';
import {
  BACKUP_SCHEMAS_BY_VERSION,
  LATEST_VERSION,
  backupDocumentSchema,
  type BackupDocument,
} from '../backup/types.ts';
import { backupDocumentV1Schema } from '../backup/v1.ts';
import { backupDocumentV0Schema, preV1Document, preV1ToV1 } from '../migrations/test-only-pre-v1.ts';
import { deepFreeze } from '../testing/deep-freeze.ts';
import { withField } from '../test-support/with-field.ts';
import { backupDocumentArb } from '../testing/documents.ts';
import { parseBackup, serializeBackup } from './index.ts';
import { parseBackupWith, validationError, type CodecConfig } from './parse.ts';

const document: BackupDocument = {
  format: 'cuotascasa',
  version: 1,
  exportedAt: '2026-10-04T16:00:00.000Z',
  deviceId: 'd0000000-0000-4000-8000-000000000001',
  appVersion: '1.0.0',
  data: {
    loans: [loanExample],
    events: [loanEventExample],
    reportedBalances: [reportedBalanceExample],
    payments: [actualPaymentExample],
    scenarios: [scenarioExample],
    settings: [syncedSettingsExample, deviceSettingsExample],
  },
};

function errorOf(input: unknown) {
  const result = parseBackup(input);
  if (result.ok) {
    throw new Error('Expected a failure');
  }
  return result.error;
}

describe('parseBackup errors (never throws)', () => {
  it('returns INVALID_JSON for malformed text', () => {
    expect(errorOf('{"format": ')).toMatchObject({ code: 'INVALID_JSON', path: [] });
    expect(errorOf('')).toMatchObject({ code: 'INVALID_JSON' });
  });

  it('returns FOREIGN_FORMAT for another format, a non-object or a missing format', () => {
    expect(errorOf(JSON.stringify({ ...document, format: 'otra-app' }))).toMatchObject({ code: 'FOREIGN_FORMAT' });
    expect(errorOf('[]')).toMatchObject({ code: 'FOREIGN_FORMAT' });
    expect(errorOf('42')).toMatchObject({ code: 'FOREIGN_FORMAT' });
    expect(errorOf('null')).toMatchObject({ code: 'FOREIGN_FORMAT' });
    expect(errorOf({ version: 1 })).toMatchObject({ code: 'FOREIGN_FORMAT' });
    expect(errorOf(undefined)).toMatchObject({ code: 'FOREIGN_FORMAT' });
  });

  it('returns FUTURE_VERSION with the version for a newer backup', () => {
    expect(errorOf(JSON.stringify({ ...document, version: LATEST_VERSION + 1 }))).toMatchObject({
      code: 'FUTURE_VERSION',
      version: LATEST_VERSION + 1,
    });
  });

  it('returns UNSUPPORTED_VERSION for a version with no registered chain', () => {
    expect(errorOf({ ...document, version: 0 })).toMatchObject({ code: 'UNSUPPORTED_VERSION', version: 0 });
    expect(errorOf({ ...document, version: -3 })).toMatchObject({ code: 'UNSUPPORTED_VERSION' });
  });

  it('returns VALIDATION at path [version] when the version is not an integer', () => {
    for (const version of ['1', 1.5, null, undefined]) {
      expect(errorOf({ ...document, version })).toMatchObject({ code: 'VALIDATION', path: ['version'] });
    }
  });

  it('returns VALIDATION with the exact path for an invalid money string', () => {
    const bad = withField(document, ['data', 'loans', 0, 'principal'], '500000.5');
    expect(errorOf(JSON.stringify(bad))).toMatchObject({
      code: 'VALIDATION',
      path: ['data', 'loans', 0, 'principal'],
      version: 1,
    });
  });

  it('returns VALIDATION for a missing collection, an unknown key and synthetic: false', () => {
    const missing = JSON.parse(JSON.stringify(document)) as { data: Record<string, unknown> };
    delete missing.data['payments'];
    expect(errorOf(missing).path).toEqual(['data', 'payments']);
    expect(errorOf({ ...document, extra: 1 }).code).toBe('VALIDATION');
    expect(errorOf({ ...document, synthetic: false })).toMatchObject({ code: 'VALIDATION', path: ['synthetic'] });
  });

  it('returns VALIDATION for a duplicate id and keeps going on hostile input', () => {
    const dup = withField(document, ['data', 'loans'], [loanExample, loanExample]);
    expect(errorOf(dup).path).toEqual(['data', 'loans', 1, 'id']);
    const circular: Record<string, unknown> = { format: 'cuotascasa', version: 1 };
    circular['self'] = circular;
    expect(() => parseBackup(circular)).not.toThrow();
    expect(() => parseBackup(Symbol('x'))).not.toThrow();
    expect(() => parseBackup(10n)).not.toThrow();
  });

  it('turns a throwing migration into a VALIDATION error instead of throwing', () => {
    const config: CodecConfig = {
      latestVersion: 1,
      schemas: { 0: backupDocumentV0Schema, 1: backupDocumentV1Schema },
      latestSchema: backupDocumentV1Schema,
      migrations: [
        {
          from: 0,
          to: 1,
          migrate() {
            throw new Error('boom');
          },
        },
      ],
    };
    expect(parseBackupWith(preV1Document, config)).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', path: [] },
    });
  });

  it('reports an invalid migration output', () => {
    const base: CodecConfig = {
      latestVersion: 1,
      schemas: { 0: backupDocumentV0Schema, 1: backupDocumentV1Schema },
      latestSchema: backupDocumentV1Schema,
      migrations: [{ from: 0, to: 1, migrate: (input) => ({ ...(input as object), version: 1 }) }],
    };
    expect(parseBackupWith(preV1Document, base)).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', path: ['data', 'settings'], version: 0 },
    });
  });
});

const BOM = String.fromCharCode(0xfeff);

describe('error messages never echo user data', () => {
  const SECRET = 'SENTINEL-4f9a';
  const throwing: CodecConfig = {
    latestVersion: 1,
    schemas: { 0: backupDocumentV0Schema, 1: backupDocumentV1Schema },
    latestSchema: backupDocumentV1Schema,
    migrations: [
      {
        from: 0,
        to: 1,
        migrate() {
          throw new Error(`leaks ${SECRET}`);
        },
      },
    ],
  };

  it.each([
    ['a money field', JSON.stringify(withField(document, ['data', 'loans', 0, 'principal'], SECRET))],
    ['an unknown key', JSON.stringify({ ...document, [SECRET]: 1 })],
    ['a nested unknown key', JSON.stringify(withField(document, ['data', 'loans', 0, SECRET], 1))],
    ['malformed JSON', `{"format": "${SECRET}", oops`],
    ['a foreign format', JSON.stringify({ format: SECRET })],
    ['a bad version', JSON.stringify({ ...document, version: SECRET })],
  ])('%s', (_name, text) => {
    expect(JSON.stringify(parseBackup(text))).not.toContain(SECRET);
  });

  it('a throwing migration', () => {
    const result = parseBackupWith(preV1Document, throwing);
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });
});

describe('hostile keys', () => {
  it('rejects __proto__ at the root and inside a record without throwing or polluting', () => {
    const root = JSON.stringify(document).replace('{', '{"__proto__":{"polluted":1},');
    const nested = JSON.stringify(document).replace('"name"', '"__proto__":{"polluted":1},"name"');
    for (const text of [root, nested]) {
      expect(text).toContain('"__proto__"');
      expect(() => parseBackup(text)).not.toThrow();
      expect(parseBackup(text)).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    }
    expect(({} as { polluted?: number }).polluted).toBeUndefined();
  });
});

describe('validationError', () => {
  it('falls back to an empty path without issues and drops symbol path keys', () => {
    expect(validationError(new z.ZodError([])).path).toEqual([]);
    const symbolic = new z.ZodError([{ code: 'custom', message: 'x', path: ['data', Symbol('k'), 2] }]);
    expect(validationError(symbolic, 3)).toMatchObject({ path: ['data', 2], version: 3 });
  });
});

describe('parseBackup success', () => {
  it('parses JSON text and an already parsed value to the same result', () => {
    const fromText = parseBackup(JSON.stringify(document));
    const fromValue = parseBackup(structuredClone(document));
    expect(fromText).toEqual(fromValue);
    expect(fromText).toMatchObject({ ok: true, value: { document, migratedFrom: 1 } });
  });

  it('accepts a UTF-8 byte order mark', () => {
    expect(parseBackup(`${BOM}${JSON.stringify(document)}`).ok).toBe(true);
  });

  it('does not mutate a deep-frozen input and returns a fresh document', () => {
    const frozen = deepFreeze(structuredClone(document));
    const result = parseBackup(frozen);
    expect(result.ok).toBe(true);
    expect(frozen).toEqual(document);
    if (result.ok) {
      expect(result.value.document).not.toBe(frozen);
    }
  });

  it('counts active and tombstoned records per entity in the preview', () => {
    const tombstoned = '2026-10-05T15:00:00.000Z';
    const input = withField(
      withField(document, ['data', 'loans', 0, 'deletedAt'], tombstoned),
      ['data', 'settings', 1, 'deletedAt'],
      tombstoned,
    );
    const result = parseBackup(JSON.stringify(input));
    expect(result).toMatchObject({
      ok: true,
      value: {
        preview: {
          sourceVersion: 1,
          exportedAt: document.exportedAt,
          appVersion: document.appVersion,
          counts: {
            loans: { active: 0, tombstoned: 1 },
            events: { active: 1, tombstoned: 0 },
            reportedBalances: { active: 1, tombstoned: 0 },
            payments: { active: 1, tombstoned: 0 },
            scenarios: { active: 1, tombstoned: 0 },
            settings: { active: 1, tombstoned: 1 },
          },
        },
      },
    });
  });

  it('strips the root synthetic flag', () => {
    const result = parseBackup(JSON.stringify({ synthetic: true, ...document }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.document).not.toHaveProperty('synthetic');
      expect(result.value.document).toEqual(document);
    }
  });

  it('migrates a pre-v1 document through the chain (test-only config)', () => {
    const config: CodecConfig = {
      latestVersion: 1,
      schemas: { 0: backupDocumentV0Schema, 1: backupDocumentV1Schema },
      latestSchema: backupDocumentV1Schema,
      migrations: [preV1ToV1],
    };
    const frozen = deepFreeze(structuredClone({ synthetic: true, ...preV1Document }));
    const result = parseBackupWith(frozen, config);
    expect(result).toMatchObject({
      ok: true,
      value: { migratedFrom: 0, preview: { sourceVersion: 0, counts: { settings: { active: 0, tombstoned: 0 } } } },
    });
    if (result.ok) {
      expect(result.value.document.version).toBe(1);
      expect(result.value.document).not.toHaveProperty('synthetic');
      expect(backupDocumentSchema.safeParse(result.value.document).success).toBe(true);
    }
    // The production parser still refuses version 0 because the step is not registered.
    expect(parseBackup(preV1Document)).toMatchObject({ ok: false, error: { code: 'UNSUPPORTED_VERSION' } });
    expect(Object.keys(BACKUP_SCHEMAS_BY_VERSION)).toEqual(['1']);
  });
});

describe('serializeBackup', () => {
  it('emits canonical JSON: fixed root order, collections in order, sorted record keys, final newline', () => {
    const text = serializeBackup(document);
    const parsed = JSON.parse(text) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(['format', 'version', 'exportedAt', 'deviceId', 'appVersion', 'data']);
    expect(Object.keys(parsed['data'] as object)).toEqual([
      'loans',
      'events',
      'reportedBalances',
      'payments',
      'scenarios',
      'settings',
    ]);
    const loan = (parsed['data'] as { loans: Record<string, unknown>[] }).loans[0] ?? {};
    expect(Object.keys(loan)).toEqual([...Object.keys(loan)].sort());
    expect(text.endsWith('}\n')).toBe(true);
  });

  it('is stable: key order of the input does not change the output', () => {
    const shuffled = JSON.parse(JSON.stringify(document), (_key, value: unknown) =>
      typeof value === 'object' && value !== null && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).reverse())
        : value,
    ) as BackupDocument;
    expect(serializeBackup(shuffled)).toBe(serializeBackup(document));
  });

  it('never emits synthetic, even if the document object carries it', () => {
    const flagged = { ...document, synthetic: true } as unknown as BackupDocument;
    expect(serializeBackup(flagged)).not.toContain('synthetic');
  });

  it('is a fixed point: serialize(parse(serialize(d))) equals serialize(d)', () => {
    const once = serializeBackup(document);
    const parsed = parseBackup(once);
    expect(parsed.ok && serializeBackup(parsed.value.document)).toBe(once);
  });
});

describe('round trip properties', () => {
  it('parse(serialize(d)) deep-equals d for arbitrary documents (1000 runs)', () => {
    fc.assert(
      fc.property(backupDocumentArb, (arbitrary) => {
        const result = parseBackup(serializeBackup(arbitrary));
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.document).toEqual(arbitrary);
          expect(result.value.migratedFrom).toBe(1);
        }
      }),
      { numRuns: 1000 },
    );
    // 1000 runs can pass 5 s under coverage instrumentation on a loaded machine.
  }, 30_000);

  it('parseBackup never throws on arbitrary JSON values or text (500 runs)', () => {
    fc.assert(
      fc.property(fc.oneof(fc.jsonValue(), fc.string(), fc.anything()), (input) => {
        expect(() => parseBackup(input)).not.toThrow();
      }),
      { numRuns: 500 },
    );
  });
});
