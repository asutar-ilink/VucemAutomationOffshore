# CLAUDE.md — VUCEM Automation Framework

Always-loaded rules. Detail lives in skills — invoke them, don't duplicate here.

## What this is

Playwright + TypeScript E2E automation for **VUCEM**, Mexico's Spanish-language (es-MX) government
trade portal. Companies submit import/export procedures to departments (SE, COFEPRIS, AGA).
Goal: automate the happy path of ~30 procedures. ~70% of the UI is shared, ~30% procedure-specific.
Keep it simple — this repo is small.

## The workflow (follow this for every procedure — don't improvise)

```
1. Read manual-testcases/<proc>.json   → scenarios, steps, expected results
2. Explore the happy path in the LIVE app with the Playwright Agent CLI (playwright-cli skill;
     needs a FRESH e.firma login — see "Driving the live app" below)
     → understand tabs/dialogs/uploads/validations, derive & verify selectors
3. Write framework code (vucem-framework templates): component → flow → procedure → spec
4. Run the spec (npm run test:headed), then npm run typecheck && npm run lint
     (review results via `npm run allure:serve` or the Playwright HTML report; see vucem-framework skill)
5. On failure: inspect error-context + trace AND **`Read` the failure screenshot**
     (`test-results/…/test-failed-1.png`) FIRST — validation dialogs render there but are easy to miss
     in the a11y text (`/debug-test` command); don't rewrite blind
6. Fix at the correct layer, re-run to green
```

- **Explore before you code.** Never guess selectors, invent page structure, or work from memory.
- **Never use a manual's literal date — use a FUTURE date.** COFEPRIS date fields (e.g. Fecha de
  movimiento) reject past dates with a validation dialog that silently blocks the modal commit;
  the manuals' hard-coded dates go stale. Pick a date ≥1–2 weeks ahead in `test-data/procedures/<proc>.json`.
- **COFEPRIS forms diverge a lot by procedure family — never assume the medicamentos shape.** Field
  names, Mercancía shape (modal vs inline), tab count/markup, and dual-list widgets differ; always
  probe the specific procedure. Details in the `vucem-framework` skill.
- **Reuse what you already probed this session.** Only re-probe when a selector or behavior is
  genuinely uncertain — repeated codegen runs waste time.
- **A derived locator is a discovery aid, not code to keep** — read it off (Agent CLI `generate-locator`
  or codegen), put it in a component.

### Driving the live app (Playwright Agent CLI)

The official `playwright-cli` (global install; `playwright-cli install --skills` refreshes the skill —
**don't hand-edit `.claude/skills/playwright-cli/SKILL.md`, it's tool-generated and edits trigger a
version nag**) is the primary way to explore VUCEM. Reuse the saved **e.firma** session — never log in
by hand.

**`auth/state.json` is NOT enough to reach the app — do a fresh e.firma login.** state-load + `goto
portal-v30…/` reaches `/portal/home`, but `front.v30` keeps its token in **sessionStorage** (which
storageState does not restore), so going there just shows an empty role picker / bounces to login.
Replay the real login in the CLI (same steps the `authenticatedPage` fixture uses; password from the
gitignored `test-data/envs/qa.json`):

```
playwright-cli open
playwright-cli goto https://portal-v30.cloud-ultrasist.net/portal/login-solicitante
# the e.firma widget is inside an iframe, so drive it via run-code:
#   frameLocator('iframe[src*="/login"]') → #cer.setInputFiles(.cer) · #key.setInputFiles(.key)
#   · #password.fill(pw) · click "Ingresar"  → waits for /seleccion-rol
playwright-cli run-code --filename=login.js
# then role: select 'Persona Moral' + Aceptar → bandeja → Trámites → Solicitudes nuevas → open <code>
playwright-cli run-code --filename=open-<code>.js
playwright-cli snapshot            # derive selectors (generate-locator / eval)
playwright-cli close
```

**Drive probes via `run-code --filename=<script.js>` (use `page.evaluate` for DOM reads) — inline
`eval` mangles quotes/newlines in this shell.** Read `formcontrolname` with
`playwright-cli eval "el => el.getAttribute('formcontrolname')" e5` (see the COFEPRIS note under
Locator strategy). Locators still belong **only in components** — the CLI just discovers them.

## Where information comes from

| To derive… | Source |
|---|---|
| Scenarios, steps, expected results, test-data values | `manual-testcases/<proc>.json` (array of cases: `id`, `title`, `steps` = `action`+`expected`, optional `parameters`) |
| Selectors, labels, routes, field names, document types | The **live app**, via the Playwright Agent CLI (or codegen) — `playwright-cli` skill |
| Typed test data for specs | `test-data/procedures/<proc>.json` |

- **This file is the only instruction set for this repo.** All work stays in `d:\VucemAutomation\`.
- **Never read `d:\VucemDev\` or any app source.** Selectors come from the live app, never from source.

## Architecture — three layers

```
tests/          → What to test (specs, read like business scenarios)
src/procedures/ → What's unique per procedure (~50 lines each)
src/flows/      → Reusable step sequences (shared by all procedures)
src/components/ → UI control wrappers — ALL locators live here
src/fixtures/   → Playwright fixtures (authenticatedPage)   ·   src/types/  src/utils/  test-data/
```

**The one rule that matters most: locators belong in components. Nowhere else.** About to write
`page.locator()` / `getByLabel()` in a flow, procedure, or spec? Stop — put it in a component.

| Layer | Contains | Never contains |
|---|---|---|
| `tests/` | `test()`, `expect()`, test-data imports | locators, `page.*` |
| `src/procedures/` | procedure-specific tab order, unique fields, assertion locators (constructor) | shared tab/field logic |
| `src/flows/` | sequences of component calls, `Logger.step` logging | locators, assertions, test data |
| `src/components/` | locators, raw Playwright calls, element `expect()` | business/flow logic |

## Coding standards

**Always:** import `{ test, expect }` from `../../src/fixtures` (never `@playwright/test` — ESLint) ·
wrap actions in `Logger.step('...', async () => {…})` · `async/await` only · type everything (no `any`) ·
ISO dates (`YYYY-MM-DD`) for date input via `DatePicker.setDate()` (COFEPRIS's bespoke Fecha-de-pago
calendar is handled in `CofeprisRegistrationFlow`, not this component) · keep procedures lean, promote shared logic to a flow.

**Never:** `page.waitForTimeout()` (ESLint-blocked — use `waitForURL`/`waitForLoadState`/`expect(...).toBeVisible()`) ·
locators in specs/procedures (except readonly assertion locators in a procedure constructor) ·
one procedure class per tab (tabs → flows) · `console.log` for steps (use `Logger.step`) · class inheritance (compose).

**Naming:** components/flows PascalCase (`TextField`, `SubmissionFlow`) · procedure class `T` + real VUCEM
code (`T260204`, since an id can't start with a digit) · spec/test-data file = real code (`260204.spec.ts`,
`260204.json`) · procedures grouped under department folder (`se`/`cofepris`/`aga`). The COFEPRIS
`260204` files are the reference template.

## Locator strategy — priority order

1. `getByLabel` (labelled inputs) → 2. `getByRole('button'|'tab', { name })` → 3. `getByTestId`
(assertions) → 4. `getByText` (static text) → 5. `locator('css')` (last resort, never in specs/procedures).

COFEPRIS reactive forms have repeated ids and hidden modal duplicates — locate by `formcontrolname`
via a component's `'control'` strategy (`:visible`-scoped; patterns in `vucem-framework`). Never use
positional selectors, fragile classes, or XPath unless there's genuinely no alternative.

## Skills & commands

- **`vucem-framework`** — component/flow/fixture APIs, file templates, COFEPRIS DOM→component mapping,
  auth/env/CI, and **reporting** (Allure + Playwright HTML: scripts, `Logger` metadata helpers). Invoke
  when writing or extending framework code.
- **`playwright-cli`** — the official Playwright **Agent CLI** to drive the live app
  (`open`/`state-load`/`snapshot`/`click`/`fill`, reusing the saved e.firma session) plus codegen,
  running, filtering, trace viewer, UI mode, debug. Invoke when running the app or any Playwright
  command. (Installed globally; run `playwright-cli install --skills` to refresh the skill after upgrades.)
- Commands: `/add-procedure <code> [dept]` · `/probe-selectors [url]` · `/debug-test [title]`.

## Git & pushing rules (follow for every commit/push)

1. **Secret safety check before staging.** Never commit secrets. Run and confirm it prints `clean`:
   ```bash
   git add -n . | grep -Ei '\.key|\.cer|state\.json|envs/(qa|staging)\.json|delfin40' || echo "clean"
   ```
   A `PreToolUse` hook (`.claude/hooks/pre-git-secret-scan.sh`) also **blocks** any `git commit`/`git push`
   whose staged/unpushed content carries a secret — treat a block as a real finding, not a nuisance.
2. **Quality gates before committing:** `npm run typecheck && npm run lint` must pass.
3. **These paths are gitignored and must never be force-added:** `auth/state.json`,
   `test-data/files/*` (real e.firma `.cer`/`.key` + PDFs, except `README.md`),
   `test-data/envs/*.json` (except `*.example.json`), `executed-procedure-artifacts/`.
   Verify a new asset is ignored with `git check-ignore <path>` before committing.
4. **The real e.firma password lives only in the local, gitignored `test-data/envs/qa.json`** — never in
   committed test data, procedures, manual-testcases, or docs. When adding an env, commit a matching
   `*.example.json` template with placeholders instead of real values.
5. **Branch for non-trivial work** (`git checkout -b <topic>` → PR); keep `main` clean.
