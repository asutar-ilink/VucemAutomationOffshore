/**
 * Custom Playwright fixtures for VUCEM automation.
 *
 * Import { test, expect } from HERE in every spec file — not from @playwright/test directly.
 *
 * authenticatedPage — a Page authenticated as the working role, landed on the
 * solicitante workspace (bandeja de tareas pendientes) and ready for a spec to
 * navigate Trámites → Solicitudes nuevas.
 *
 * How it authenticates (fast path — saved-state reuse):
 * The auth.setup.ts project logs in with e.firma ONCE and saves browser state
 * (cookies + localStorage) to auth/state.json. That state carries a 24h
 * refresh_token cookie; front.v30 silently re-mints its short-lived (30-min)
 * access token from it, so a state-restored context is fully authenticated the
 * moment it hits an app route. Each test therefore just rehydrates the state
 * and navigates to the bandeja (~2s) — no e.firma cert upload per test.
 *
 * (front.v30's own working token lives in sessionStorage, which storageState
 * does not persist — but that token is regenerated from the cookie, so its
 * absence is irrelevant. This is why a naive "restore state → go to app" once
 * looked broken: it targeted seleccion-rol, whose role dropdown is built only
 * from the one-time login fragment. restoreSession skips straight to the
 * bandeja instead.)
 *
 * Fallback (slow path): if auth/state.json is missing or expired (>24h, or the
 * app bounced to login), the fixture performs a real e.firma login and re-saves
 * fresh state so subsequent tests take the fast path again.
 */

import { test as base, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { LoginFlow } from '../flows/LoginFlow';
import { EnvConfig, EfirmaCredentials } from '../types';

// Load the env config at RUNTIME (not a static import) so `tsc` and ESLint don't
// require the gitignored test-data/envs/<env>.json to exist — it is absent in CI
// and would fail typecheck (TS2307). Mirrors playwright.config.ts and auth.setup.ts.
const ENV = process.env.ENV === 'staging' ? 'staging' : 'qa';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const envConfig = require(`../../test-data/envs/${ENV}.json`) as EnvConfig;

// Same file auth.setup.ts writes and playwright.config.ts restores per project.
const AUTH_STATE_PATH = path.join(__dirname, '../../auth/state.json');

type CustomFixtures = {
  authenticatedPage: Page;
  efirma: EfirmaCredentials;
};

export const test = base.extend<CustomFixtures>({
  authenticatedPage: async ({ browser }, use) => {
    if (!envConfig.efirma) {
      throw new Error(`Env "${process.env.ENV || 'qa'}" has no efirma credentials configured.`);
    }

    // Fast path: rehydrate the saved session and land on the bandeja.
    const hasSavedState = fs.existsSync(AUTH_STATE_PATH);
    let context = await browser.newContext(
      hasSavedState ? { storageState: AUTH_STATE_PATH } : undefined
    );
    let page = await context.newPage();

    const restored = hasSavedState && (await LoginFlow.restoreSession(page));

    if (!restored) {
      // Slow path: no valid saved state — do a real e.firma login on a clean
      // context and refresh auth/state.json so later tests reuse it. (In a
      // normal run the setup project has already produced fresh state and this
      // never fires.)
      await context.close();
      context = await browser.newContext();
      page = await context.newPage();
      await LoginFlow.loginWithEfirma(page, envConfig.efirma);
      if (envConfig.role) {
        await LoginFlow.selectRole(page, envConfig.role);
      }
      await context.storageState({ path: AUTH_STATE_PATH });
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
