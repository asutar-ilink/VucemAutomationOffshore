# VUCEM Automation Framework

Playwright + TypeScript automation for the VUCEM Mexico Government Trade Portal.

---

## Getting started

```bash
npm install
npx playwright install chromium
```

### Local setup (required before first run)

Secrets are **not** committed, so a fresh clone needs two things supplied locally before any test
can run. Both are gitignored on purpose — provide them on your machine or via CI secrets.

1. **Env config.** Copy the versioned template to a real env file and fill in your credentials:

   ```bash
   cp test-data/envs/qa.example.json test-data/envs/qa.json
   ```

   Only the `*.example.json` templates are in git; the real `qa.json` / `staging.json` are ignored.

2. **e.firma files + upload PDFs.** Drop the solicitante `.cer` / `.key` and the required PDFs into
   `test-data/files/`. The exact filenames are documented in
   [`test-data/files/README.md`](test-data/files/README.md). Set the private-key password in your
   `qa.json` (`efirma.password`).

Without these, `auth.setup.ts` cannot authenticate and the whole suite fails at the setup step.

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

Environment configs live in `test-data/envs/`. Only the `*.example.json` templates are committed —
the real `qa.json` / `staging.json` (which carry credentials) are gitignored. To add a new
environment, copy its example template and fill it in:

```bash
cp test-data/envs/staging.example.json test-data/envs/staging.json
```

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

---

## Contributing / commit workflow

Routine loop for every change:

```bash
git status                                    # 1. see what changed

# 2. safety check — make sure no secret is about to be committed (should print "clean")
git add -n . | grep -Ei '\.key|\.cer|state\.json|envs/(qa|staging)\.json|delfin40' || echo "clean"

git add .                                     # 3. stage
npm run typecheck && npm run lint             # 4. quality gates
git commit -m "Add T260215 procedure and spec"
git push                                      # 5. push
```

For anything non-trivial, work on a feature branch and open a PR — keep `main` clean:

```bash
git checkout -b add-260215
# ...work, commit...
git push -u origin add-260215
```

### Never commit secrets

`.gitignore` blocks the sensitive paths — do not force them in:

| Path | Why |
|---|---|
| `auth/state.json` | Session tokens |
| `test-data/files/*` (except `README.md`) | Real e.firma `.cer` / `.key` + upload PDFs |
| `test-data/envs/*.json` (except `*.example.json`) | Real credentials / private-key password |
| `executed-procedure-artifacts/` | Runtime outputs (generated PDFs, submission folios) |

Before committing any new credential or asset, confirm it's ignored:

```bash
git check-ignore test-data/files/my-new.key   # prints the path if ignored (good)
```

The real e.firma password lives **only** in your local, gitignored `test-data/envs/qa.json` — never
in committed test data, procedures, or docs. When you add a new env, also commit a matching
`*.example.json` template so others know the required shape.
