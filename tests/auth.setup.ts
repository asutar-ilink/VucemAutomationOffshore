/**
 * Authentication setup — runs ONCE before the entire test suite.
 *
 * This file is NOT a regular test.
 * It is the 'setup' project defined in playwright.config.ts.
 * Playwright runs it first, then all test projects depend on its output.
 *
 * What it does:
 *   1. Opens a real browser
 *   2. Logs in with the automation credentials for the current environment
 *   3. Saves the authenticated browser state (cookies + localStorage) to disk
 *
 * All subsequent tests restore this state instead of logging in again.
 * This makes the suite fast and avoids hammering the login endpoint.
 *
 * If login credentials change, update test-data/envs/{env}.json.
 * If the login flow changes, update LoginFlow.ts.
 */

import { test as setup } from '@playwright/test';
import { LoginFlow } from '../src/flows/LoginFlow';
import path from 'path';

const ENV = process.env.ENV || 'qa';
const envConfig = require(`../test-data/envs/${ENV}.json`);

// This path is referenced in playwright.config.ts storageState
const AUTH_STATE_PATH = path.join(__dirname, '../auth/state.json');

setup('authenticate and save browser state', async ({ page }) => {
  // VUCEM authenticates with e.firma (FIEL) certificates. When the env config
  // provides an `efirma` block, use the certificate login; otherwise fall back
  // to the username/password flow.
  if (envConfig.efirma) {
    await LoginFlow.loginWithEfirma(page, envConfig.efirma);
    if (envConfig.role) {
      await LoginFlow.selectRole(page, envConfig.role);
    }
  } else {
    await LoginFlow.login(
      page,
      envConfig.credentials.username,
      envConfig.credentials.password
    );
  }

  // Save authenticated state to disk — cookies, localStorage, sessionStorage
  await page.context().storageState({ path: AUTH_STATE_PATH });

  console.log(`[Auth Setup] State saved to ${AUTH_STATE_PATH}`);
});
