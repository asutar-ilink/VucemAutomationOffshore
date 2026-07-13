---
description: Diagnose a failing Playwright test using error-context, trace viewer, and UI mode
argument-hint: [test title substring or spec path]
---

Diagnose the failing test(s): **$ARGUMENTS** (if empty, work from the most recent run's failures).

Load the `playwright-cli` skill and follow its "Debug a failure" section (error-context →
trace viewer → inspector/UI mode). This command only adds the VUCEM-specific framing;
don't guess at the cause.

1. Reproduce narrowly: `npx playwright test -g "$ARGUMENTS"`, or `npm run test:last-failed`.
2. Work through the skill's debug sequence on that failure. VUCEM-specific suspects to check in the
   trace: a hidden modal duplicate matched instead of the visible field, a cascading select not yet
   enabled, or an autofill (e.g. RFC → name) that hadn't fired.
3. Fix at the right layer — a wrong/fragile locator is fixed **in the component** (scope `:visible`,
   switch to `formcontrolname`, wait for enablement), never in the spec or procedure. A real wait
   race uses `waitForURL`/`expect(...).toBeVisible()`, never `waitForTimeout` (ESLint-blocked).
4. Re-run to confirm green, then report the root cause and the fix layer.
