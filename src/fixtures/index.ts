/**
 * Custom Playwright fixtures for VUCEM automation.
 *
 * Import { test, expect } from HERE in every spec file — not from @playwright/test directly.
 *
 * authenticatedPage — a Page logged in via e.firma with the working role selected,
 * landed on the solicitante workspace (bandeja de tareas pendientes).
 *
 * Why a fresh login per test (not storageState restore)?
 * The VUCEM app (front.v30) keeps its session token in sessionStorage, which
 * Playwright's storageState does NOT persist. Restoring saved state therefore
 * bounces back to the login page. A real e.firma login per test is the only
 * reliable model for this app. It costs ~20s per test but is correct.
 */

import { test as base, Page } from '@playwright/test';
import { LoginFlow } from '../flows/LoginFlow';
import { EnvConfig } from '../types';
import qa from '../../test-data/envs/qa.json';
import staging from '../../test-data/envs/staging.json';

const envConfig = (process.env.ENV === 'staging' ? staging : qa) as EnvConfig;

type CustomFixtures = {
  authenticatedPage: Page;
};

export const test = base.extend<CustomFixtures>({

  authenticatedPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    if (!envConfig.efirma) {
      throw new Error(`Env "${process.env.ENV || 'qa'}" has no efirma credentials configured.`);
    }
    await LoginFlow.loginWithEfirma(page, envConfig.efirma);
    if (envConfig.role) {
      await LoginFlow.selectRole(page, envConfig.role);
    }

    await use(page);

    await context.close();
  },

});

// Re-export expect so spec files only need one import
export { expect } from '@playwright/test';
