# VUCEM Automation — Knowledge Transfer (KT) Guide

> **Audience:** engineers joining the VUCEM automation team.
> **Goal:** after reading this you can *understand* the framework and *add a new automated procedure* confidently.
> **Companion material:** the always-on rules live in [CLAUDE.md](../CLAUDE.md); deeper API/template detail lives in the `vucem-framework` skill; live-app driving lives in the `playwright-cli` skill. This doc ties them together in plain language.

---

## 1. What are we automating? (the 60-second version)

**VUCEM** is Mexico's government trade portal (Spanish, `es-MX`). Companies log in with their **e.firma** (a government digital certificate) and submit **procedures** ("trámites") — import/export permit applications — to departments like **COFEPRIS** (health), **SE** (economy), **AGA** (customs).

A procedure is a **wizard**:

```
Log in (e.firma) → pick role → open procedure → fill form tabs → upload PDFs → sign → receive a "folio" (receipt number) + download the "acuse" (official acknowledgement PDF)
```

Our job: **automate the happy path of ~30 procedures** so we can regression-test the portal end to end.

**The key insight that shapes the whole framework:** across those ~30 procedures, **~70% of the UI is identical** (same login, same tabs, same modals, same signing) and only **~30% is procedure-specific** (which fields, which "terceros"/third parties, whether there's a payment step). So we build the shared 70% **once** and let each procedure declare only its unique 30%.

**Glossary of the Spanish terms you'll see constantly:**

| Term | Meaning |
|---|---|
| trámite / procedimiento | procedure (an import/export application) |
| e.firma | government digital signature certificate (`.cer` + `.key` + password) |
| solicitante | the applicant (your company) — prefilled, read-only |
| establecimiento | the physical establishment/facility |
| mercancía | the goods/merchandise being imported |
| tercero relacionado | a related third party (manufacturer, recipient…) |
| pago de derechos | payment of fees |
| folio | the submission's receipt/tracking number |
| acuse | the official acknowledgement document (PDF) |
| bandeja | the task inbox / workspace you land on after login |

---

## 2. The mental model: 4 layers, each with one job

Think of it like an org chart. Each layer only talks to the one below it, and each has exactly one responsibility.

```
┌──────────────────────────────────────────────────────────────────┐
│  tests/          WHAT to test        "business scenario"           │  ← reads like English
│  260204.spec.ts  → open procedure, fill tabs, sign, expect folio   │
├──────────────────────────────────────────────────────────────────┤
│  src/procedures/ WHAT'S UNIQUE       "the 30% per procedure"       │  ← ~50 lines each
│  T260204.ts      → its tabs, its terceros, its assertions          │
├──────────────────────────────────────────────────────────────────┤
│  src/flows/      REUSABLE SEQUENCES  "the shared 70%"              │  ← static methods
│  CofeprisRegistrationFlow.ts → fill the whole Datos tab, add tercero│
├──────────────────────────────────────────────────────────────────┤
│  src/components/ UI CONTROL WRAPPERS  "how to click/type"          │  ← ALL locators here
│  TextField.ts    → fill(), getValue(), expectValue()               │
└──────────────────────────────────────────────────────────────────┘
        supported by:  src/fixtures (auto-login) · src/types · test-data/ (JSON) · src/utils (Logger, ArtifactStore)
```

### The one rule that matters most

> **🔒 Locators live in components. Nowhere else.**

If you're about to write `page.locator(...)`, `getByLabel(...)`, `getByRole(...)` anywhere in a **flow**, **procedure**, or **spec** — **stop**. That belongs in a component. (The *only* exception: a handful of read-only assertion locators in a procedure's constructor, like the "folio" success message.)

Why so strict? The government portal's HTML changes without notice. When a selector breaks, you want to fix it in **one file** (the component), not hunt through 30 specs.

### What each layer may and may not contain

| Layer | Contains | **Never** contains |
|---|---|---|
| `tests/` (specs) | `test()`, `expect()`, imports test-data JSON | locators, `page.*` |
| `src/procedures/` | procedure-specific tab order, unique fields, assertion locators (constructor only) | shared tab/field logic |
| `src/flows/` | sequences of component calls, `Logger.step` logging | locators, assertions, test data |
| `src/components/` | locators, raw Playwright calls, element-level `expect()` | business/flow logic |

---

## 3. How data flows end-to-end (follow one field down)

Say the spec wants to fill the establishment's postal code. Here's the whole chain:

```
260204.spec.ts            "fill this procedure with this data"
   │  procedure.fillDatosSolicitud(data)
   ▼
T260204.ts                delegates — it's a COFEPRIS form, so the flow knows how
   │  CofeprisRegistrationFlow.fillDatosSolicitud(page, data)
   ▼
CofeprisRegistrationFlow  the shared recipe: open establecimiento → fill fields → SCIAN → mercancía → …
   │  new TextField(page, 'codigoPostal', 'control').fill(d.codigoPostal)
   ▼
TextField.ts              OWNS the locator: page.locator('[formcontrolname="codigoPostal"]:visible')
   │  .clear().fill(value)
   ▼
Live VUCEM page
```

And the **data** for that field came from `test-data/procedures/260204.json`, typed against the `T260204Data` TypeScript interface. **Code and data are separate** — to test a different company you change JSON, not code.

---

## 4. Each layer in detail (with real code)

### 4a. Components — the vocabulary of UI controls

A component wraps **one type of control** and owns every way to locate it. Example — [`TextField`](../src/components/form/TextField.ts) supports three location strategies via a `by` argument:

```typescript
new TextField(page, 'RFC')                       // by: 'label'   (default) → getByLabel — SE-style forms
new TextField(page, 'codigoPostal', 'control')   // by: 'control' → [formcontrolname="…"]:visible — COFEPRIS
new TextField(page, 'rfc', 'id')                 // by: 'id'      → #rfc:visible
```

Its methods are the only way anyone types into a text box: `.fill()`, `.getValue()`, `.blur()`, `.expectValue()`, `.expectError()`, `.isDisabled()`, `.isVisible()`.

The full component toolbox:

**Form controls** (`src/components/form/`):
| Component | Wraps | Key methods |
|---|---|---|
| `TextField` | text input | `fill`, `getValue`, `blur`, `expectValue`, `expectError` |
| `Dropdown` | `<select>` + ARIA listbox | `select`, `getSelected`, `getOptions`, `expectSelected` |
| `Checkbox` | checkbox | `check`, `uncheck`, `isChecked`, `expectChecked` |
| `RadioButton` | radio group | `select`, `expectSelected`, static `RadioButton.byId()` for label-less groups |
| `DatePicker` | standard date input | `setDate('YYYY-MM-DD')` — **always ISO** |
| `FileUpload` | file input + upload UI | `upload(path)`, `expectUploadSuccess`, `getUploadedFileName` |
| `CrossList` | dual-list "move item from available→selected" widget | `add(optionText)` |

**Layout controls** (`src/components/layout/`):
| Component | Wraps | Key methods |
|---|---|---|
| `Tab` | ARIA + Bootstrap tabs | `click(label)`, `expectActive`, `getVisibleTabLabels` |
| `Modal` | dialog | `waitForOpen`, `confirm`, `cancel`, `clickButton`, `expectBodyText` |
| `DynamicTable` | add/remove-row tables (SCIAN, Mercancías) | `clickAdd`, `getRowByText`, `expectRowExists`, `expectRowCount` |

> **When do you add a new component?** Only when a **new *type* of control** appears (e.g. an accordion). If it's the same control located a different way, add a `by` strategy to the existing component. **Never** create a component for a one-off locator.

### 4b. Flows — the shared recipes

Flows are **stateless collections of static async methods** that sequence component calls into reusable steps. They contain **no locators and no test data** — they receive `page` and a typed data object.

The big one is [`CofeprisRegistrationFlow`](../src/flows/CofeprisRegistrationFlow.ts) — the engine that drives the shared "Datos de la solicitud" tab for *every* COFEPRIS procedure. One call fills the entire tab:

```typescript
static async fillDatosSolicitud(page, data, addMercancia = addMercanciaMedicamentos) {
  await new Tab(page).click('Datos de la solicitud');
  await this.openEstablecimiento(page);
  await this.fillEstablecimiento(page, data.establecimiento);
  await this.addScian(page, data.scian);
  await this.fillLicenciaRegimenAduana(page, data);
  await addMercancia(page, data.mercancia);      // ← procedures inject the variant they need
  await this.acceptManifiestos(page);
  await this.setDatosPublicos(page, data.datosPublicos);
  await this.fillRepresentanteLegal(page, data.representanteLegal);
}
```

**Notice the `addMercancia` parameter.** The "Mercancía" (goods) modal differs between procedure families — medicamentos vs materias primas vs precursores químicos. Instead of copying the flow, we pass the right handler in. This **"inject the variant"** pattern is how you handle a procedure that's *mostly* shared but differs in one step. Prefer it over a per-procedure copy.

The other flows:
| Flow | Responsibility |
|---|---|
| `LoginFlow` | e.firma login, role selection |
| `SigningFlow` | Paso 3 — sign the submission, wait for the acuse |
| `SubmissionFlow` | navigate the catalogue, open a procedure |
| `DocumentUploadFlow` | Paso 2 — attach PDFs, confirm the upload |
| `CofeprisRegistrationFlow` | the whole Paso-1 form + Terceros + Pago (the engine) |

> **When do you add a new flow?** Only when a sequence is used by **2+ procedures** and doesn't already exist. Behaviour shared across a COFEPRIS family belongs *inside* `CofeprisRegistrationFlow` (via a handler param), not a new flow.

### 4c. Procedures — the ~50 lines that are unique

A procedure class (`T` + the real VUCEM code, e.g. [`T260204`](../src/procedures/cofepris/T260204.ts)) is deliberately thin. It holds **only what differs**:

1. **Its data shape** — a TypeScript interface extending the shared base:
   ```typescript
   export interface T260204Data extends CofeprisRegistrationData {
     terceros: { fabricante: TerceroData; destinatario: TerceroData };
     pago: PagoData;
     documents: DocumentData[];
   }
   ```
2. **Its assertion locators** (the allowed exception to the no-locators rule) — set readonly in the constructor:
   ```typescript
   this.folioMessage = page.getByText(/tu solicitud ha sido registrada con el siguiente número de folio/i);
   ```
3. **Thin methods that mostly delegate to flows**, plus whatever's genuinely unique (which terceros it adds, whether it pays or skips payment):
   ```typescript
   async fillDatosSolicitud(data) { await CofeprisRegistrationFlow.fillDatosSolicitud(this.page, data); }
   async fillTerceros(data) {
     await new Tab(this.page).click('Terceros relacionados');
     await CofeprisRegistrationFlow.addTercero(this.page, 'fabricanteModal', data.terceros.fabricante);
     await CofeprisRegistrationFlow.addTercero(this.page, 'destinatarioModal', data.terceros.destinatario);
   }
   ```

For a *standard* COFEPRIS procedure you should **not touch any flow or component** — everything you need already exists.

### 4d. Specs — the business scenario

A spec reads like a checklist a manual tester would follow. It imports `{ test, expect }` **from `src/fixtures`** (never `@playwright/test` — ESLint enforces this), loads its JSON data, and calls procedure methods:

```typescript
import { test, expect } from '../../src/fixtures';
import { T260204, T260204Data } from '../../src/procedures/cofepris/T260204';
import rawData from '../../test-data/procedures/260204.json';
const data = rawData as T260204Data;

test('fills all tabs, uploads documents, signs, and receives a folio', async ({ authenticatedPage, efirma }) => {
  const procedure = new T260204(authenticatedPage);
  await procedure.open(data.procedureCode);
  await procedure.fillDatosSolicitud(data);
  await procedure.fillTerceros(data);
  await procedure.fillPago(data.pago);
  await procedure.uploadDocuments(data.documents);
  await procedure.sign(efirma);
  await expect(procedure.folioMessage).toBeVisible();
});
```

No locators, no `page.*`, no waits — just the scenario.

---

## 5. Two things that make VUCEM special (read before you code)

### 5a. Authentication — log in once, reuse the saved session

Specs receive an `authenticatedPage` **fixture** (`src/fixtures/index.ts`) that is already authenticated and landed on the bandeja. You never write login code.

**How it works (and why a naive storageState restore once looked broken).** The `setup` project logs in via e.firma **once** and saves `auth/state.json` (cookies + localStorage). Every test restores that state and navigates straight to the bandeja (~2s) — no per-test login. front.v30 keeps its short-lived (30-min) access token in `sessionStorage`, which `storageState` does **not** persist — but it is silently re-minted from the **24h `refresh_token` cookie** the saved state carries, so a restored context is authenticated the moment it hits an app route. The earlier "restore bounces to login" belief came from targeting `seleccion-rol`, whose role dropdown is built only from the one-time login URL fragment; `restoreSession` skips role selection and goes to `/bandeja-de-tareas-pendientes` directly (the app defaults to the principal role). If the state is missing/expired (>24h) the fixture falls back to a full e.firma login and re-saves fresh state. Refresh manually anytime with `npm run auth`.

The real e.firma credentials (cert path, key path, **password**) live **only** in the gitignored `test-data/envs/qa.json` — never in committed procedure data. The `efirma` fixture hands them to the signing step.

### 5b. COFEPRIS reactive forms — why we locate by `formcontrolname`

COFEPRIS trámites are one long Angular reactive-form page with three nasty traps:

1. **Repeated `id`s** — the same `id` (e.g. `#codigoPostal`) appears in multiple sections. `getByLabel`/`#id` alone is ambiguous.
2. **Hidden modal duplicates** — "add record" modals (SCIAN, Mercancía, Terceros) are pre-rendered **hidden**, so the same `formcontrolname` matches a visible field *and* a hidden copy.
3. **Label-less controls** — declaration checkboxes whose visible label is just `*`; radio groups keyed only by `id` (`"Si"`/`"No"`).

The solution — a **DOM → component** cheat sheet:

| What you see | Locate by | Component call |
|---|---|---|
| Repeated ids / ambiguous labels | `formcontrolname` (unique per field) | `new TextField(page, '<fcn>', 'control')` |
| `<select formcontrolname>` inside `<app-catalogo-select name="…">` | wrapper `name` | `new Dropdown(page, '<name>', 'control')` |
| Add-record modal duplicates a field | `:visible` scope (built into `'control'`/`'id'`) + button scoped to `#modalId`, wait for close | — |
| Checkbox whose label is just `*` | `formcontrolname` | `new Checkbox(page, '<fcn>', 'control')` |
| Radio group with no per-option label (`id="Si"/"No"`) | element `id` | `RadioButton.byId(page, '<id>')` |
| `<crosslist>` dual-list (País de origen, Uso específico) | panel heading + modal scope | `new CrossList(page, '<heading>', '#mercanciaModal').add(v)` |
| Disabled/auto-filled field | don't touch it | — |

**Rule of thumb:** on a COFEPRIS form, reach for `'control'` (formcontrolname) first. All `'control'`/`'id'` strategies are `:visible`-scoped so on-screen fields always beat hidden modal copies.

> **Locator priority order (framework-wide):** 1. `getByLabel` → 2. `getByRole('button'|'tab')` → 3. `getByTestId` (assertions) → 4. `getByText` (static text) → 5. `locator('css')` (last resort, never in specs/procedures). No XPath/positional/fragile-class selectors unless there's genuinely no alternative.

---

## 6. The standard workflow — how we build every procedure

**Never improvise; never guess selectors from memory. Explore the live app first.**

```
1. Read manual-testcases/<code>.json      → scenarios, steps, expected results, test data
2. Explore the happy path in the LIVE app with the Playwright Agent CLI (playwright-cli skill)
     → understand tabs/dialogs/uploads/validations, derive & VERIFY selectors
3. Write framework code (component → flow → procedure → spec) — reuse the 70%
4. Run the spec (npm run test:headed), then npm run typecheck && npm run lint
5. On failure: inspect error-context + trace FIRST (/debug-test) — don't rewrite blind
6. Fix at the correct LAYER, re-run to green
```

Two guardrails:
- **Explore before you code** — derive a selector from the live app (Agent CLI `generate-locator` / codegen), read it off, and put it in a **component**. A derived locator is a discovery aid, not code to keep.
- **Reuse what you already probed this session** — only re-probe when a selector is genuinely uncertain.

---

## 7. HANDS-ON: add a new automation test case / procedure

This is what you'll do most. A **standard COFEPRIS procedure is three files and touches no flow/component.**

### Step 0 — prerequisites
- Read `manual-testcases/<code>.json` for the scenario and data.
- Explore the live procedure with the `playwright-cli` skill using the saved e.firma session (see the cross-origin handshake in CLAUDE.md). Confirm: its tab set, which terceros, does it have a Pago tab, what documents, any Mercancía-modal quirks.
- **Shortcut:** the `/add-procedure <code> [dept]` command scaffolds the three files for you.

### Step 1 — the procedure class `src/procedures/cofepris/T<code>.ts`
Copy [`T260204.ts`](../src/procedures/cofepris/T260204.ts) (the reference template) and adjust:
- the `T<code>Data` interface (which terceros, pago vs skip, documents),
- the assertion locators in the constructor (title regex, folio message),
- which terceros `fillTerceros` adds, and `fillPago` vs `skipPagoAndContinue`.

If the Mercancía modal differs, pass the right handler into `fillDatosSolicitud` — e.g. `addMercanciaMateriasPrimas` (260203) or `addMercanciaPrecursores` (260604). If a handler doesn't exist yet for a genuinely new modal shape, add it **inside `CofeprisRegistrationFlow`**, not the procedure.

### Step 2 — the test data `test-data/procedures/<code>.json`
Must match `T<code>Data`. Structure (see `260204.json` for the full example):
```json
{ "procedureCode": "<code>", "procedureTitle": "…",
  "tabs": ["Solicitante", "Datos de la solicitud", "Terceros relacionados", "Pago de derechos"],
  "solicitante": { "rfc": "…", "razonSocial": "…", … },
  "establecimiento": { … }, "scian": { "clave": "…", "descripcion": "…" },
  "licenciaSanitaria": "…", "regimen": "…", "aduana": "…",
  "mercancia": { … }, "datosPublicos": "No", "representanteLegal": { … },
  "terceros": { "fabricante": { … }, "destinatario": { … } },
  "pago": { "claveReferencia": "…", "banco": "…", "fechaPago": "YYYY-MM-DD", "importePago": "…" },
  "documents": [ { "type": "licencia_sanitaria_o_aviso", "path": "test-data/files/….pdf" } ] }
```
> **e.firma password does NOT go here** — it stays in `test-data/envs/qa.json`. Dates are ISO `YYYY-MM-DD`. A new document `type` needs its `key → 'Visible VUCEM label'` mapping added to `getUiLabel()` in `DocumentUploadFlow.ts`.

### Step 3 — the spec `tests/cofepris/<code>.spec.ts`
Copy [`260204.spec.ts`](../tests/cofepris/260204.spec.ts). Import from `../../src/fixtures`, cast the JSON to `T<code>Data`, and write the two canonical tests: (a) open + verify tabs/prefill, (b) fill all tabs → upload → sign → expect folio.

### Step 4 — run & verify
```bash
npm run test:headed -- tests/cofepris/<code>.spec.ts   # watch it drive the browser
npm run typecheck && npm run lint                       # must pass before commit
npm run allure:serve                                    # review the report
```
If it fails, use `/debug-test` — inspect the trace and error-context **before** editing. Fix at the correct layer.

---

## 8. Running, reporting, environments — cheat sheet

```bash
# Auth (refresh the codegen session)
npm run auth

# Run
npm test                          # all tests
npm run test:cofepris             # just COFEPRIS
npm run test:headed               # watch the browser
npm run test:ui                   # Playwright UI mode (time-travel debugging)
npm run test:last-failed          # re-run only failures
ENV=staging npm test              # target staging (default is qa)

# Quality gates (required before every commit)
npm run typecheck
npm run lint

# Explore the live app for selectors
npm run codegen

# Reports
npm run report                    # Playwright HTML report
npm run allure:serve              # Allure report (needs a JDK)
```

**Reporting is automatic.** Every `Logger.step(...)` call nests as a step in both the Playwright trace and the Allure report; on failure the screenshot/video/trace attach themselves. `ArtifactStore` also attaches the captured **folio** (text) and downloaded **acuse** (PDF) to the run. Add Allure metadata only via `Logger` helpers (`Logger.suite/severity/tags/attach`) — never import `allure-js-commons` into a flow/procedure/spec.

**Environments:** target via `ENV` (`qa` default, `staging`). Each env has `test-data/envs/<name>.json` with `baseUrl` + e.firma creds. A new env needs a matching `*.example.json` committed with placeholders.

**CI** (`.github/workflows/automation.yml`): lint + typecheck (fail fast) → tests across 4 shards with `retries: 1` → a `merge-reports` job aggregates the shard HTML + Allure results into one report artifact; screenshots/videos/traces upload on failure.

---

## 9. Coding standards — the do/don't list

**Always:**
- Import `{ test, expect }` from `../../src/fixtures` (never `@playwright/test`).
- Wrap actions in `Logger.step('…', async () => { … })` so they show in the trace/report.
- `async/await` only; **type everything** (no `any`).
- ISO dates (`YYYY-MM-DD`) for date input.
- Keep procedures lean; promote shared logic up into a flow.

**Never:**
- `page.waitForTimeout()` — ESLint-blocked. Use `waitForURL` / `waitForLoadState` / `expect(...).toBeVisible()`. (The one deliberate exception is the documented `settle()` helper in the precursores Mercancía modal, where Angular exposes no completion signal — don't copy it elsewhere.)
- Locators in specs/procedures (except readonly assertion locators in a procedure constructor).
- One procedure class per tab (tabs → flows).
- `console.log` for steps (use `Logger.step`).
- Class inheritance — **compose** instead.

**Naming:** components/flows PascalCase (`TextField`, `SubmissionFlow`) · procedure class `T` + real code (`T260204`) · spec & test-data files = real code (`260204.spec.ts`, `260204.json`) · procedures grouped by department folder (`cofepris`/`se`/`aga`).

---

## 10. Git & safety rules (every commit)

1. **Secret-safety check before staging** — confirm this prints `clean`:
   ```bash
   git add -n . | grep -Ei '\.key|\.cer|state\.json|envs/(qa|staging)\.json|<efirma-key-password>' || echo "clean"
   ```
   Replace `<efirma-key-password>` with the real e.firma password literal (kept only in the gitignored
   `test-data/envs/qa.json`). A pre-commit hook also **blocks** any commit/push carrying a secret — treat
   a block as a real finding.
2. **Quality gates:** `npm run typecheck && npm run lint` must pass.
3. **Never force-add gitignored paths:** `auth/state.json`, `test-data/files/*` (real `.cer`/`.key`/PDFs), `test-data/envs/*.json` (except `*.example.json`), `executed-procedure-artifacts/`. Verify with `git check-ignore <path>`.
4. **The real e.firma password lives only in the local, gitignored `test-data/envs/qa.json`** — never in committed code, test data, or docs.
5. **Branch for non-trivial work** (`git checkout -b <topic>` → PR); keep `main` clean.

---

## 11. Key design decisions (don't undo these)

- **No page-object-per-procedure** — 70% shared UI lives in components/flows; procedures hold only what differs.
- **Static flow methods** — flows are stateless action sequences.
- **JSON test data** — native typed imports, no parser.
- **`getByLabel` primary, `'control'` for COFEPRIS** — reactive forms repeat ids.
- **Fresh e.firma login per test** — the app's `sessionStorage` token can't be restored from disk. Correctness over the ~20s cost.
- **`fullyParallel: false`, `workers: 2` locally** — the government portal may rate-limit; raise workers only after verifying.

---

## 12. Where to look when you're stuck

| Question | Source |
|---|---|
| Scenario, steps, expected results, sample data | `manual-testcases/<code>.json` |
| Selectors, labels, routes, field names | the **live app** via `playwright-cli` skill (never app source) |
| Typed test data for a spec | `test-data/procedures/<code>.json` |
| Component/flow API signatures & file templates | `vucem-framework` skill |
| Always-on rules | `CLAUDE.md` |
| The canonical reference procedure | `src/procedures/cofepris/T260204.ts` |
| A Mercancía-modal variant | `T260203` (materias primas), `T260604` (precursores) |
| A failing test | `/debug-test` command — trace + error-context first |

**Do not read `d:\VucemDev\` or any app source.** Selectors always come from the live app, never from source.

---

*Welcome to the team. Start by reading `T260204.ts` end to end, then run `npm run test:headed -- tests/cofepris/260204.spec.ts` and watch it drive the portal. That one round trip will make everything above click.*
