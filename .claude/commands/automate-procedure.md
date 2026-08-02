---
description: Fetch a procedure's ADO test cases and automate it end to end in one go (fetch → scaffold → run → PR)
argument-hint: <procedure-code> [department: se|cofepris|aga]
---

Automate VUCEM procedure **$1** end to end in a single run — this chains the ADO fetch and the
full `/add-procedure` workflow so you only type one command. Department (folder): **$2** (default to
the department implied by the manual test cases if not given).

Follow the framework rules in `CLAUDE.md`. Do **not** read any external dev/source checkout;
selectors come only from the live app.

Steps:

0. **Fetch the manual test cases from ADO.** Run `npm run fetch -- $1` (the plan/suite come from
   `scripts/ado-suites.json`; if the fetch errors that the suite is missing, the code isn't in that
   registry yet — add a `"$1": <suite-id>` line to it, or pass `--suite <id> --plan <id>` this once,
   then re-run). Confirm it prints `Wrote N test case(s) to 'manual-testcases/$1.json'`. The fetch
   scrubs the e.firma password automatically, so the file is safe to commit — but still run the
   CLAUDE.md secret-safety check before staging. If the fetch fails (network/PAT/registry), STOP and
   report; do not hand-author the manual test cases.

1. **Run the rest of the add-procedure workflow.** Invoke the `add-procedure` skill for **$1 $2** and
   follow it through to the end: branch off up-to-date `main`, read `manual-testcases/$1.json`, probe
   the live app for selectors (never guess — every locator lives in a component), create the three
   files (`src/procedures/$2/T$1.ts`, `test-data/procedures/$1.json`, `tests/$2/$1.spec.ts`), promote
   genuinely-shared behaviour into a flow/type only when a control diverges, then
   `npm run typecheck && npm run lint`, run the spec headed and debug to green using the
   error-context snapshot, and finally commit + open a PR against `main` (do **not** merge — leave
   that to the user).

2. **Report** what passed/failed, any locators you could not confidently derive, any product bugs
   found, and the PR URL.

Notes:
- **`test-data/procedures/$1.json` dates:** *Fecha de pago* must be ≤ today (a past date); other
  COFEPRIS date fields (e.g. *Fecha de movimiento*) must be in the future. Never use a manual's
  literal date.
- Everything for this procedure stays on its branch; keep `main` clean (CLAUDE.md git rule 5).
