import { EXPECTED_ROW_COLUMNS, type ExpectedRow, type Fixture } from '@cuotascasa/schema';
import type { ComputedFixtureResult } from '../engine-adapter.ts';
import { moneyToCents } from '../money.ts';

type Scalar = string | number | boolean;

/** Equal to the cent when both sides are two-decimal money strings; otherwise strictly equal. */
function same(expected: Scalar, actual: Scalar): boolean {
  if (typeof expected === 'string' && typeof actual === 'string') {
    const e = moneyToCents(expected);
    const a = moneyToCents(actual);
    if (e !== null && a !== null) return e === a;
  }
  return expected === actual;
}

function mismatch(prefix: string, field: string, expected: Scalar, actual: Scalar): string {
  return `${prefix} ${field}: expected ${String(expected)}, actual ${String(actual)}`;
}

function compareRow(id: string, expected: ExpectedRow, actual: ExpectedRow): string[] {
  const prefix = `${id} row ${String(expected.k)}`;
  const lines: string[] = [];
  for (const column of EXPECTED_ROW_COLUMNS) {
    if (column === 'insuranceComponents') {
      const e = expected.insuranceComponents;
      const a = actual.insuranceComponents;
      if (e.length !== a.length) {
        lines.push(
          `${prefix} insuranceComponents: expected ${String(e.length)} items, actual ${String(a.length)} items`,
        );
      } else {
        e.forEach((value, index) => {
          const other = a[index] ?? '';
          if (!same(value, other)) lines.push(mismatch(prefix, `insuranceComponents[${String(index)}]`, value, other));
        });
      }
    } else if (!same(expected[column], actual[column])) {
      lines.push(mismatch(prefix, column, expected[column], actual[column]));
    }
  }
  return lines;
}

function presence(prefix: string, expectedPresent: boolean): string {
  return expectedPresent
    ? `${prefix}: expected present, actual missing`
    : `${prefix}: expected missing, actual present`;
}

/**
 * Every difference between a fixture's expected result and what the engine computed, one line each:
 * `<fixture id> row <k> <field>: expected <value>, actual <value>` (also `summary <field>`, `anchor <eventId> <field>`
 * and `payment <eventId> <field>`). Money is compared to the cent.
 */
export function compareFixture(fixture: Fixture, actual: ComputedFixtureResult): string[] {
  const id = fixture.id;
  const lines: string[] = [];
  const rowCount = Math.max(fixture.expected.rows.length, actual.rows.length);
  for (let index = 0; index < rowCount; index += 1) {
    const e = fixture.expected.rows[index];
    const a = actual.rows[index];
    if (e !== undefined && a !== undefined) lines.push(...compareRow(id, e, a));
    else if (e !== undefined) lines.push(presence(`${id} row ${String(e.k)}`, true));
    else if (a !== undefined) lines.push(presence(`${id} row ${String(a.k)}`, false));
  }
  for (const [field, value] of Object.entries(fixture.expected.summary)) {
    const other = actual.summary[field as keyof typeof actual.summary];
    if (!same(value, other)) lines.push(mismatch(`${id} summary`, field, value, other));
  }
  for (const e of fixture.expected.anchors) {
    const a = actual.anchors.find((anchor) => anchor.eventId === e.eventId);
    const prefix = `${id} anchor ${e.eventId}`;
    if (a === undefined) lines.push(presence(prefix, true));
    else {
      if (!same(e.k, a.k)) lines.push(mismatch(prefix, 'k', e.k, a.k));
      if (!same(e.realDelta, a.realDelta)) lines.push(mismatch(prefix, 'realDelta', e.realDelta, a.realDelta));
    }
  }
  for (const a of actual.anchors) {
    if (!fixture.expected.anchors.some((e) => e.eventId === a.eventId)) {
      lines.push(presence(`${id} anchor ${a.eventId}`, false));
    }
  }
  for (const e of fixture.expected.payments) {
    const a = actual.payments.find((payment) => payment.eventId === e.eventId);
    const prefix = `${id} payment ${e.eventId}`;
    if (a === undefined) {
      lines.push(presence(prefix, true));
      continue;
    }
    if (!same(e.k, a.k)) lines.push(mismatch(prefix, 'k', e.k, a.k));
    if (e.componentDeltas === null || a.componentDeltas === null) {
      if (e.componentDeltas !== a.componentDeltas) {
        lines.push(
          `${prefix} componentDeltas: expected ${e.componentDeltas === null ? 'null' : 'present'}, actual ${a.componentDeltas === null ? 'null' : 'present'}`,
        );
      }
      continue;
    }
    for (const [field, value] of Object.entries(e.componentDeltas)) {
      const other = a.componentDeltas[field as keyof typeof a.componentDeltas];
      if (!same(value, other)) lines.push(mismatch(prefix, `componentDeltas.${field}`, value, other));
    }
  }
  for (const a of actual.payments) {
    if (!fixture.expected.payments.some((e) => e.eventId === a.eventId)) {
      lines.push(presence(`${id} payment ${a.eventId}`, false));
    }
  }
  return lines;
}
