import fs from 'fs';
import path from 'path';

/**
 * Clear accumulated Allure results before each LOCAL run so the report reflects the
 * current suite only. The allure-playwright reporter appends to allure-results/ on every
 * run and never cleans it, which otherwise inflates the report's test-case count with
 * stale, position-keyed identities from earlier runs.
 *
 * Skipped in CI: each shard emits a blob report that `merge-reports` recombines, so those
 * results must persist for the duration of the run.
 */
async function globalSetup(): Promise<void> {
  if (process.env.CI) return;
  fs.rmSync(path.resolve('allure-results'), { recursive: true, force: true });
}

export default globalSetup;
