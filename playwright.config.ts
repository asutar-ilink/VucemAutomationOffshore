import { defineConfig, devices } from '@playwright/test';
import path from 'path';

/**
 * Environment is controlled by the ENV variable.
 * Usage:  ENV=staging npx playwright test
 * Default: qa
 */
const ENV = process.env.ENV || 'qa';
const envConfig = require(`./test-data/envs/${ENV}.json`);

export default defineConfig({
  // All test files live under tests/
  testDir: './tests',

  // Run each test file in parallel, tests within a file sequentially.
  // This is the safest default for a form-heavy government app.
  fullyParallel: false,
  workers: process.env.CI ? 4 : 2,

  // Retry failing tests once in CI to reduce flakiness noise.
  // Never retry locally — instant feedback matters more.
  retries: process.env.CI ? 1 : 0,

  // Fail the suite fast on CI if > 20% of tests fail.
  maxFailures: process.env.CI ? 20 : undefined,

  // Make base URL and credentials available to every test via process.env
  use: {
    baseURL: envConfig.baseUrl,

    // Collect these on every failure — the three essentials for debugging
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',

    // Generous timeout for a slow government portal
    actionTimeout: 15_000,
    navigationTimeout: 30_000,

    // Always run in Spanish locale to match VUCEM's UI
    locale: 'es-MX',
    timezoneId: 'America/Mexico_City',
  },

  // Global test timeout — long for complex multi-tab procedures
  timeout: 180_000,
  expect: {
    timeout: 10_000,
  },

  // Reporters:
  // - list:   real-time terminal output
  // - html:   full report with screenshots/traces (open with: npx playwright show-report)
  // - json:   for CI artifact parsing
  // - allure: rich historical report with steps, attachments and metadata
  //           (npm run allure:serve, or allure:generate + allure:open)
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'playwright-report/results.json' }],
    [
      'allure-playwright',
      {
        resultsDir: 'allure-results',
        // Nest Playwright's own test.step() (i.e. Logger.step) as Allure steps.
        detail: true,
        // Group by the describe() title so the suite tree reads by procedure.
        suiteTitle: true,
        // Surfaced on the report's "Environment" widget.
        environmentInfo: {
          Environment: ENV,
          Base_URL: envConfig.baseUrl,
          Locale: 'es-MX',
          Node: process.version,
        },
      },
    ],
  ],

  projects: [
    // Auth setup project — runs login once, saves browser state to disk.
    // All test projects depend on this, so it runs first automatically.
    {
      name: 'setup',
      testMatch: '**/auth.setup.ts',
    },

    // Main test project — restores saved auth state, no re-login needed.
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: path.join(__dirname, 'auth', 'state.json'),
      },
      dependencies: ['setup'],
    },
  ],

  // Where Playwright stores test artifacts (screenshots, videos, traces)
  outputDir: 'test-results',
});
