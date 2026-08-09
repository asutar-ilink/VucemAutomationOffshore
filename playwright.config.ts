import { defineConfig, devices, ReporterDescription } from '@playwright/test';

/**
 * Environment is controlled by the ENV variable.
 * Usage:  ENV=staging npx playwright test
 * Default: qa
 */
const ENV = process.env.ENV || 'qa';
const envConfig = require(`./test-data/envs/${ENV}.json`);

// Allure reporter — shared by both the local and CI reporter sets below.
const allureReporter: ReporterDescription = [
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
    launchOptions: {
      slowMo: 500, // Delays every action by 150 milliseconds
    },
  },
];

export default defineConfig({
  // All test files live under tests/
  testDir: './tests',

  // Clear accumulated Allure results before each local run so the report matches the
  // current suite (skipped in CI — see global-setup.ts).
  globalSetup: './global-setup.ts',

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
  timeout: 360_000,
  expect: {
    timeout: 10_000,
  },

  // Reporters:
  // - list:   real-time terminal output
  // - html:   full report with screenshots/traces (open with: npx playwright show-report)
  // - json:   for CI artifact parsing
  // - blob:   sharded-run output that `playwright merge-reports` recombines in CI
  // - allure: rich historical report with steps, attachments and metadata
  //           (npm run allure:serve, or allure:generate + allure:open)
  //
  // In CI each shard emits a blob report (the only format merge-reports accepts);
  // the merge-reports job recombines them into a single HTML report afterwards.
  // Locally we keep the human-friendly html/json reporters instead.
  reporter: (process.env.CI
    ? [['list'], ['blob'], allureReporter]
    : [
        ['list'],
        ['html', { outputFolder: 'playwright-report', open: 'never' }],
        ['json', { outputFile: 'playwright-report/results.json' }],
        allureReporter,
      ]) as ReporterDescription[],

  projects: [
    // Main test project — fresh e.firma login per test ensures proper RFC context
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],

  // Where Playwright stores test artifacts (screenshots, videos, traces)
  outputDir: 'test-results',
});
