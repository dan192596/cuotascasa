import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** The heading list W4-05 reads from docs/specs/privacy-requirements.md (cwd = repository root). */
const DOC = readFileSync('docs/specs/privacy-requirements.md', 'utf8');
const SECTION = DOC.split('## Encabezados obligatorios')[1]?.split('\n## ')[0] ?? '';
const HEADINGS = [...SECTION.matchAll(/^- `([^`]+)`/gm)].map((match) => match[1] ?? '');

describe('docs/specs/privacy-requirements.md', () => {
  it('lists the required /privacidad headings once each', () => {
    expect(HEADINGS.length).toBe(11);
    expect(new Set(HEADINGS).size).toBe(HEADINGS.length);
  });

  it('covers the Google consent-screen and spec §10 topics', () => {
    const text = HEADINGS.join(' | ');
    for (const topic of [
      'Datos de Google',
      'revocar',
      'borrar',
      'Cifrado',
      'Sin analítica',
      'contactarnos',
      'Cambios',
    ]) {
      expect(text, topic).toContain(topic);
    }
  });
});
