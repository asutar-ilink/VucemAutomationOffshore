---
description: Diagnose a failing Playwright test using error-context, trace viewer, and UI mode
argument-hint: [test title substring or spec path]
---

Diagnose the failing test(s): **$ARGUMENTS** (if empty, work from the most recent run's failures).

Load the `playwright-cli` skill and follow its "Debug a failure" section (error-context →
trace viewer → inspector/UI mode). This command only adds the VUCEM-specific framing;
don't guess at the cause.

1. **Read the saved context FIRST — don't re-run to reproduce.** The last run already wrote it to
   `test-results/<test-dir>/`: start at `test-results/.last-run.json` (which tests failed), then `Read`
   that test's `error-context.md` (failing step + a **full page snapshot** — dropdown options, open
   modals, table rows are all in it) and `test-failed-1.png`. Only re-run
   (`npx playwright test -g "$ARGUMENTS"` / `npm run test:last-failed`) if no artifact exists or it's
   stale — `test-results/` is overwritten each run, so it reflects only the latest run (check the mtime).
2. Work through the skill's debug sequence (open `trace.zip` only if the snapshot isn't enough).
   VUCEM-specific suspects: a hidden modal duplicate matched instead of the visible field, a cascading
   select not yet enabled, an autofill (e.g. RFC → name) that hadn't fired — **and a `selectOption` /
   "option not found" failure is almost always bad test data (the value isn't in the live catalog; the
   error-context snapshot lists the real options), not a selector or product bug.**
3. Fix at the right layer — bad test data is fixed **in `test-data/procedures/<code>.json`**; a
   wrong/fragile locator is fixed **in the component** (scope `:visible`, switch to `formcontrolname`,
   wait for enablement), never in the spec or procedure. A real wait race uses
   `waitForURL`/`expect(...).toBeVisible()`, never `waitForTimeout` (ESLint-blocked).
4. Re-run to confirm green, then report the root cause and the fix layer.
