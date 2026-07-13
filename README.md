# VUCEM Automation Framework

Playwright + TypeScript automation for the VUCEM Mexico Government Trade Portal.

---

## Getting started

```bash
npm install
npx playwright install chromium
```

Run the full suite against QA:

```bash
npm test
```

Run only COFEPRIS department tests:

```bash
npm run test:cofepris
```

Run with a visible browser (useful when writing new tests):

```bash
npm run test:headed
```

Open the interactive Playwright UI (recommended when debugging):

```bash
npm run test:ui
```

---

## Architecture in 30 seconds

```
tests/          → What to test (spec files — read like business scenarios)
src/procedures/ → What is unique per procedure (~30-50 lines each)
src/flows/      → Reusable sequences of steps (shared by all procedures)
src/components/ → Reusable UI controls (all locators live here)
src/fixtures/   → Shared setup (authenticated page, etc.)
test-data/      → JSON test data (one file per procedure)
```

**The rule:** If you are writing a locator in a spec file or a procedure class, stop — it belongs in a component.

---

## Adding a new procedure

1. Copy `src/procedures/cofepris/T260204.ts` → `src/procedures/cofepris/T260205.ts`
2. Change the procedure code and 260205-specific tabs/fields
3. Copy `test-data/procedures/260204.json` → `test-data/procedures/260205.json`
4. Update the test data
5. Copy `tests/cofepris/260204.spec.ts` → `tests/cofepris/260205.spec.ts`
6. Write the test scenarios

You should not need to modify any flow or component file for a standard procedure.

---

## Running against a different environment

```bash
ENV=staging npm test
```

Environment configs live in `test-data/envs/`. Update credentials there or use CI secrets.

---

## Debugging a failure

1. Open the HTML report: `npm run report`
2. Click the failed test
3. The trace viewer shows every action, screenshot, and network request
4. For deeper debugging: `npm run test:debug` pauses at the start

---

## Authentication

Authentication runs once before the test suite and saves browser state to `auth/state.json`.
Every test restores this state — no re-login on every test.

If your session expires or login breaks: delete `auth/state.json` and re-run.

The `auth/` directory is gitignored. Never commit session state.
