---
description: Scaffold a new VUCEM procedure (procedure class + test data + spec) from its manual test cases
argument-hint: <procedure-code> [department: se|cofepris|aga]
---

Add a new VUCEM procedure end to end. Procedure code: **$1**. Department (folder): **$2**
(default to the department implied by the manual test cases if not given).

Follow the framework rules in `CLAUDE.md` and the templates in the `vucem-framework` skill —
invoke that skill now if its API details aren't already in context. Do **not** read any external
dev/source checkout; selectors come only from the live app.

Steps:

1. **Read the scenarios.** Open `manual-testcases/$1.json`. Summarize the ordered steps and the
   `expected` result of each — these define the `test()` blocks and assertions. Note any
   `parameters` / test-data values.

2. **Derive locators from the live app, not memory** — run `/probe-selectors` (codegen with the
   saved session; details in the `playwright-cli` and `vucem-framework` skills). Reuse existing
   components; only add/extend a component if a control type genuinely isn't covered. Every locator
   lives in a component — never in the procedure or spec.

3. **Create the three files** (real VUCEM code as identifier; class prefixed `T`; templates in the
   `vucem-framework` skill → "Add a procedure"):
   - `src/procedures/$2/T$1.ts` — procedure-specific tab order, unique fields, assertion locators
     in the constructor. Delegate shared sequences to existing flows. Keep it lean; promote
     shared steps to a flow only when a second procedure needs them.
   - `test-data/procedures/$1.json` — typed data matching the manual test-case parameters.
   - `tests/$2/$1.spec.ts` — import `{ test, expect }` from `../../src/fixtures` (never
     `@playwright/test`), one `test()` per scenario, wrap actions via the procedure/flows,
     `expect()` only in the spec.

4. **Verify:** run `npm run typecheck` and `npm run lint`. Then run the new spec headed
   (`npx playwright test tests/$2/$1.spec.ts --headed`) and fix using the trace viewer /
   error-context snapshot if it fails. Report what passed, what failed, and any locators you
   could not confidently derive.
