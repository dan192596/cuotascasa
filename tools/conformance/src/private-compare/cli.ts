// private-compare (W0-06, Opus-frozen): the TypeScript engine against a private bank table, outside the repo.
// Usage (Node 24 strips the types; no build step and no resolve hook: the workspace sources import with .ts extensions):
//   node tools/conformance/src/private-compare/cli.ts --terms <dir>/a-terms.json --expected <dir>/a-expected.csv
//   node tools/conformance/src/private-compare/cli.ts … --log-line --sha <git sha> --label <a|b…>
// Output: exactly 'allRowsMatched: yes|no', 'mismatchedRows: <int>', 'maxAbsDiff: <d.dd>' (or only the log line);
// exit 0 all rows match, 1 some differ, 2 'error: <code>' on stderr. Never copy the terminal output anywhere.
import './main.ts';
