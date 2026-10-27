// @ts-check
// Rules of docs/release/v1-checklist.md that a test checks (W7-01): every gate that docs/specs/oracle-validation-log.md
// logs as «validación privada: no autorizada» has its residual-risk row in the checklist.

/** `AAAA-MM-DD · <gate> · oráculo|motor <sha> · validación privada: no autorizada` (docs/plan/README.md §6). */
const UNAUTHORIZED_LINE = /^(\d{4}-\d{2}-\d{2}) · (W\d-\d{2}) · (?:oráculo|motor) [0-9a-f]+ · validación privada: no autorizada$/;

/**
 * @param {string} log the text of docs/specs/oracle-validation-log.md
 * @returns {{ date: string, gate: string }[]}
 */
export function unauthorizedGates(log) {
  /** @type {{ date: string, gate: string }[]} */
  const out = [];
  for (const line of log.split('\n')) {
    const match = UNAUTHORIZED_LINE.exec(line.trim());
    if (match?.[1] !== undefined && match[2] !== undefined) out.push({ date: match[1], gate: match[2] });
  }
  return out;
}

/**
 * Gates of the log without a checklist row `| <gate> | <date> | validación privada: no autorizada | … |`.
 * @param {string} log
 * @param {string} checklist
 * @returns {string[]}
 */
export function checklistGaps(log, checklist) {
  const lines = checklist.split('\n').map((line) => line.trim());
  return unauthorizedGates(log)
    .filter(
      ({ date, gate }) =>
        !lines.some((line) => line.startsWith(`| ${gate} | ${date} | validación privada: no autorizada |`)),
    )
    .map(({ gate }) => gate);
}
