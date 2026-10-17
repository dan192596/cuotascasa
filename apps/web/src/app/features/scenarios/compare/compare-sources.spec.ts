import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Source guards for compare/ (ADR-0003 §6): money becomes a number in chart-series.ts only, and chart.js stays lazy. */
const DIR = 'apps/web/src/app/features/scenarios/compare';
const CONVERTER = 'chart-series.ts';
const CHART = 'balance-chart.component.ts';

const productionFiles = readdirSync(DIR).filter((name) => name.endsWith('.ts') && !name.endsWith('.spec.ts'));

/**
 * Blanks comments and the contents of string and template literals, keeping everything else (and the line breaks), so
 * a `//` inside a string is not a comment and `Number(` inside a string or comment is not a call. Template
 * substitutions `${...}` are code and stay.
 */
export function stripNonCode(text: string): string {
  let out = '';
  let i = 0;
  const templateDepth: number[] = [];
  let braces = 0;
  while (i < text.length) {
    const c = text.charAt(i);
    const next = text.charAt(i + 1);
    if (c === '/' && next === '/') {
      while (i < text.length && text.charAt(i) !== '\n') i++;
    } else if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? text.length : end + 2;
      out += text.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
    } else if (c === "'" || c === '"') {
      out += c;
      i++;
      while (i < text.length && text.charAt(i) !== c) {
        if (text.charAt(i) === '\\') i++;
        out += text.charAt(i) === '\n' ? '\n' : ' ';
        i++;
      }
      out += c;
      i++;
    } else if (c === '`' || (c === '}' && templateDepth[templateDepth.length - 1] === braces)) {
      if (c === '}') templateDepth.pop();
      out += c;
      i++;
      while (i < text.length && text.charAt(i) !== '`') {
        if (text.charAt(i) === '\\') {
          out += ' ';
          i++;
        } else if (text.charAt(i) === '$' && text.charAt(i + 1) === '{') {
          templateDepth.push(braces);
          out += '${';
          i += 2;
          break;
        }
        out += text.charAt(i) === '\n' ? '\n' : ' ';
        i++;
      }
      if (text.charAt(i) === '`' && !(out.endsWith('${') && templateDepth.length > 0 && i < 0)) {
        out += '`';
        i++;
      }
    } else {
      if (c === '{') braces++;
      if (c === '}') braces--;
      out += c;
      i++;
    }
  }
  return out;
}

const CONVERSIONS: readonly (readonly [string, RegExp])[] = [
  ['Number()/parseFloat()/parseInt()', /\b(?:Number|parseFloat|parseInt)\s*\(/],
  ['Number.parse*', /\bNumber\s*\.\s*parse\w*/],
  ['.toNumber()', /\.\s*toNumber\s*\(/],
  ['Math.*', /\bMath\s*\./],
  ['unary + or - on a name', /(?:^|[=(,:?&|!<>*/%^[{;]|\breturn|\btypeof)\s*[+-]\s*[A-Za-z_$][\w$]*/m],
  ['unary + or - after a + or -', /[+-]\s+[+-][A-Za-z_$]/],
  ['* 1 or / 1', /[*/]\s*1(?![\w.])|(?<![\w.])1\s*[*/]/],
];

/** Every syntax that can turn a decimal string into a JS number, found in code only (not in comments or strings). */
export function findConversions(text: string): string[] {
  const code = stripNonCode(text);
  return CONVERSIONS.filter(([, pattern]) => pattern.test(code)).map(([label]) => label);
}

/** Module specifiers of static and dynamic imports and re-exports. */
export function importsOf(text: string): string[] {
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const found: string[] = [];
  for (const match of code.matchAll(/(?:^|\n)\s*(?:import|export)\b[^;'"]*?from\s*(['"])([^'"]+)\1/g))
    found.push(match[2] ?? '');
  for (const match of code.matchAll(/(?:^|\n)\s*import\s*(['"])([^'"]+)\1/g)) found.push(match[2] ?? '');
  for (const match of code.matchAll(/\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g)) found.push(match[2] ?? '');
  return found;
}

const read = (name: string): string => readFileSync(`${DIR}/${name}`, 'utf8');

describe('compare/ sources', () => {
  it('finds the production sources', () => {
    expect(productionFiles).toContain(CONVERTER);
    expect(productionFiles).toContain(CHART);
  });

  it('the guard recognises every conversion syntax and ignores comments and strings', () => {
    const bad = [
      'const a = Number(m);',
      'const a = parseFloat(m);',
      'const a = parseInt(m, 10);',
      'const a = Number.parseFloat(m);',
      'const a = m.toNumber();',
      'const a = +amount;',
      'const a = x + -amount;',
      'const a = Math.abs(x);',
      'const a = m * 1;',
      'const a = 1 / m;',
      'const a = { y: +row.amount };',
      'const t = `${Number(m)}`;',
    ];
    for (const source of bad) expect(findConversions(source), source).not.toEqual([]);
    const fine = [
      '// Number(x) +amount Math.abs(1)\nconst a = 1;',
      "const s = 'Number(x) +amount // not a comment'; const b = Number;",
      'const t = `parseInt(x) +amount ${s} Math.abs`;',
      'const n = -1; const k = a * 2; const j = a - b + c; const l = x / 10; const m = 1.5 * y;',
      "const u = 'a//b'; const v = 7;",
    ];
    for (const source of fine) expect(findConversions(source), source).toEqual([]);
  });

  it('converts money to numbers only in chart-series.ts', () => {
    for (const name of productionFiles.filter((candidate) => candidate !== CONVERTER)) {
      expect(findConversions(read(name)), name).toEqual([]);
    }
  });

  it('imports chart-series only from the lazy chart component', () => {
    const importers = productionFiles.filter((name) =>
      importsOf(read(name)).some((specifier) => specifier.endsWith('/chart-series.ts')),
    );
    expect(importers).toEqual([CHART]);
  });

  it('imports chart.js and ng2-charts only from the lazy chart component', () => {
    for (const name of productionFiles) {
      const importsChart = importsOf(read(name)).some((specifier) => /^(chart\.js|ng2-charts)/.test(specifier));
      expect(importsChart, name).toBe(name === CHART);
    }
  });

  it('registers only the Chart.js pieces a line chart needs, never the full registerables', () => {
    const text = readFileSync(`${DIR}/${CHART}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(text).not.toMatch(/\bregisterables\b(?!:)|withDefaultRegisterables/);
    expect(text).toMatch(
      /registerables:\s*\[LineController, LineElement, PointElement, LinearScale, Legend, Tooltip\]/,
    );
  });
});
