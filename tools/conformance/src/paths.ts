import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repository root (this file is tools/conformance/src/paths.ts). */
export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
/** Committed oracle fixtures and their manifest (tools/oracle/FORMAT.md §3.1 and §5). */
export const FIXTURES_DIR = join(REPO_ROOT, 'tools/oracle/fixtures');
/** Append-only list of enforced feature tags (owns-check). */
export const ENFORCED_FEATURES_FILE = join(REPO_ROOT, 'tools/conformance/enforced-features.json');
/** No fixture id may appear below this directory. */
export const DOMAIN_SRC_DIR = join(REPO_ROOT, 'packages/domain/src');
