/**
 * Custom Playwright fixtures for VUCEM automation.
 *
 * Import { test, expect } from HERE in every spec file — not from @playwright/test directly.
 *
 * authenticatedPage — a Page authenticated as the working role, landed on the
 * solicitante workspace (bandeja de tareas pendientes) and ready for a spec to
 * navigate Trámites → Solicitudes nuevas.
 *
 * How it authenticates:
 * Every test performs a fresh e.firma login to ensure proper cross-origin RFC
 * context. This guarantees that front.v30 has access to the Solicitante data
 * needed for COFEPRIS and SE procedures. Slower than saved state (~15-20s per
 * test) but 100% reliable with no cross-origin or timing issues.
 */

import { test as base, Page } from '@playwright/test';
import { LoginFlow } from '../flows/LoginFlow';
import { EnvConfig, EfirmaCredentials } from '../types';

// Load the env config at RUNTIME (not a static import) so `tsc` and ESLint don't
// require the gitignored test-data/envs/<env>.json to exist — it is absent in CI
// and would fail typecheck (TS2307).
const ENV = process.env.ENV === 'staging' ? 'staging' : 'qa';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const envConfig = require(`../../test-data/envs/${ENV}.json`) as EnvConfig;

type CustomFixtures = {
  authenticatedPage: Page;
  efirma: EfirmaCredentials;
};

export const test = base.extend<CustomFixtures>({
  authenticatedPage: async ({ browser }, use) => {
    if (!envConfig.efirma) {
      throw new Error(`Env "${process.env.ENV || 'qa'}" has no efirma credentials configured.`);
    }

    // Always do fresh e.firma login to ensure proper cross-origin RFC context
    const context = await browser.newContext();
    const page = await context.newPage();

    await LoginFlow.loginWithEfirma(page, envConfig.efirma);
    if (envConfig.role) {
      await LoginFlow.selectRole(page, envConfig.role);
    }

    await use(page);

    await context.close();
  },

  // The real e.firma credentials — cert/key paths + private-key password — live
  // only in the gitignored env config (test-data/envs/qa.json), never in the
  // committed procedure test data. Signing must draw from here, same as login.
  // eslint-disable-next-line no-empty-pattern
  efirma: async ({}, use) => {
    if (!envConfig.efirma) {
      throw new Error(`Env "${process.env.ENV || 'qa'}" has no efirma credentials configured.`);
    }
    await use(envConfig.efirma);
  },
});

// Re-export expect so spec files only need one import
export { expect } from '@playwright/test';
