---
name: vucem-framework
description: Reference for the VUCEM Playwright automation framework — component/flow/fixture APIs, file templates for adding a procedure/flow/component/document type, COFEPRIS DOM→component mapping, auth, env, and CI. Use whenever writing or extending framework code (procedures, specs, flows, components) or when you need exact API signatures or file templates. Core rules and the workflow live in CLAUDE.md. CLI commands live in the playwright-cli skill.
---

# VUCEM Framework Reference

Rules, layering, naming, locator priority, and the workflow are in `CLAUDE.md`. CLI commands
(run/codegen/trace/debug) are in the `playwright-cli` skill. This skill holds framework code
knowledge: APIs, file templates, and the COFEPRIS DOM→component mapping.

**Reference procedure:** `src/procedures/cofepris/T260204.ts` — the canonical template every new
procedure follows. All four live procedures (260204, 260203, 260210, 260212) are COFEPRIS reactive-form
trámites driven by `CofeprisRegistrationFlow`. Copy their shape, not the generic examples in your memory.

## Folder layout

```
src/components/form/   TextField Dropdown Checkbox RadioButton DatePicker FileUpload CrossList
src/components/layout/ Tab Modal DynamicTable
src/flows/             LoginFlow SigningFlow SubmissionFlow DocumentUploadFlow CofeprisRegistrationFlow
src/procedures/cofepris/  T260204.ts (reference)  T260203.ts  T260210.ts  T260212.ts
                          se/  aga/  ← aspirational: not built yet (future departments)
src/fixtures/index.ts  authenticatedPage fixture + re-exports { test, expect }
src/types/index.ts     ApplicantData DocumentData ProcedureTestData EfirmaCredentials EnvConfig
src/types/cofepris.ts  CofeprisRegistrationData SolicitanteData EstablecimientoData MercanciaData
                       RepresentanteLegalData TerceroData PagoData
src/utils/Logger.ts    Logger.step() wraps test.step() (trace viewer + Allure) · Allure metadata helpers (attach/severity/tags/suite)
src/utils/ArtifactStore.ts  saveFolio() / saveDocument() → executed-procedure-artifacts/ (both async; also attach to Allure)
tests/auth.setup.ts    setup project, saves auth/state.json (used by codegen; see fixture note below)
tests/cofepris/*.spec.ts
test-data/envs/*.json  baseUrl + credentials per env   ·   procedures/*.json  ·  files/ (upload PDFs + .cer/.key)
```

Data flow: spec imports `test-data/procedures/<code>.json` → calls a procedure method → procedure
delegates to a flow → flow constructs a component → component owns the locator.

## Component APIs (`src/components/`)

Strategy param `by` selects how the control is found: `'label'` (default, `getByLabel`), `'control'`
(Angular `formControlName` / `app-catalogo-select[name]`, `:visible`-scoped), `'id'`. Use `'control'`
for COFEPRIS reactive forms (see the DOM→component mapping below).

```typescript
// form/
new TextField(page, target, by?).fill(v) | getValue() | blur() | expectValue(v) | expectError(msg) | isDisabled() | isVisible()   // by: 'label'|'control'|'id'
new Dropdown(page, target, by?).select(opt) | getSelected() | expectSelected(v) | getOptions()   // by: 'label'|'control'; native <select> + ARIA listbox
new Checkbox(page, target, by?).check() | uncheck() | isChecked() | expectChecked() | expectUnchecked()   // by: 'label'|'control'
new RadioButton(page, optionLabel, groupLabel?).select() | isSelected() | expectSelected()   // + static RadioButton.byId(page, id) for label-less groups (e.g. id="Si"|"No")
new DatePicker(page, label).setDate('YYYY-MM-DD') | getValue() | expectValue('YYYY-MM-DD')   // always ISO. NOTE: COFEPRIS's Fecha de pago is a bespoke calendar — handled inside CofeprisRegistrationFlow, not this component.
new FileUpload(page, sectionLabel).upload(path) | expectUploadSuccess() | getUploadedFileName()
new CrossList(page, heading, withinSelector?).add(optionText)   // <crosslist> dual-list (available → selected), e.g. País de origen in the Mercancía modal; accent/case-insensitive match
// layout/
new Tab(page).click(label) | expectActive(label) | expectVisible(label) | getVisibleTabLabels()   // ARIA + Bootstrap tabs
new Modal(page, title).waitForOpen() | confirm() | cancel() | clickButton(name) | getBodyText() | expectBodyText(t) | isOpen()
new DynamicTable(page, caption).clickAdd(label?) | getRowByText(t) | clickActionInRow(t, action) | getColumnValues(h) | expectRowExists(t) | expectRowCount(n) | expectEmpty()
```

## Flow APIs (`src/flows/`) — static async methods

```typescript
// Auth & signing
LoginFlow.loginWithEfirma(page, creds) | selectRole(page, role) | submitEfirmaCredentials(scope, creds, submitBtn) | login(page, user, pass) | logout(page)
SigningFlow.signSubmission(page, creds)   // Paso 3 firmar → waits for /acuse/

// COFEPRIS registration engine — the shared Paso-1 form + Terceros + Pago (used by all 4 procedures)
CofeprisRegistrationFlow.fillDatosSolicitud(page, data, addMercancia?)   // establecimiento → SCIAN → licencia/régimen/aduana → mercancía → manifiestos → datosPublicos → representante
                        .addMercanciaMedicamentos(page, m)   // default mercancía handler (260204/260210/260212)
                        .addMercanciaMateriasPrimas(page, m) // 260203 detalle sub-form variant — pass as addMercancia
                        .verifyRepresentanteAutofill(page, d)
                        .addTercero(page, modalId, t)        // modalId e.g. 'fabricanteModal' | 'destinatarioModal'
                        .fillPago(page, d) | skipPagoAndContinue(page)   // both advance to Paso 2

// Documents
DocumentUploadFlow.uploadAllWithConfirmation(page, docs)   // COFEPRIS default: attach all → "Cargar archivos" → confirm modal
                  .uploadOptionalDocument(page, docType, filePath)   // Paso-2 screens with a "Tipo de documento" ng-select (e.g. 260210)
                  .uploadAll(page, docs) | verifyAllUploaded(page, docs)   // one uploader per section; doc-type keys must exist in getUiLabel()

// Generic navigation/tab helpers — COFEPRIS uses startNewSolicitud + openProcedureFromCatalogue;
// fillGeneralTab/fillAddressTab (ApplicantData) and submitAndConfirm/saveDraft serve the aspirational SE path.
SubmissionFlow.startNewSolicitud(page) | openProcedureFromCatalogue(page, code) | openNewProcedure(page, code)
              | navigateToProcedure(page, code) | fillGeneralTab(page, data) | fillAddressTab(page, data) | submitAndConfirm(page) | saveDraft(page)
```

## Fixture

```typescript
import { test, expect } from '../../src/fixtures';
test('...', async ({ authenticatedPage }) => { /* already logged in — no LoginFlow call */ });
```
`authenticatedPage` performs a **fresh e.firma login per test** (in its own context), then selects the
role from `test-data/envs/{ENV}.json`, landing on the bandeja. It does **not** restore `auth/state.json`:
VUCEM keeps its token in `sessionStorage`, which Playwright's `storageState` does not persist, so a saved
state bounces to the login page. Costs ~20s/test but is the only reliable model. (`auth/state.json` is
still used by `npm run codegen` for interactive exploration.)

---

## Add a procedure (the common task — three files)

First follow the CLAUDE.md workflow: read `manual-testcases/<code>.json`, then probe the live app.
Use the real VUCEM code as identifier; class prefixed `T`; department folder `cofepris`. **You should not
touch any flow or component for a standard COFEPRIS procedure** — the Paso-1 form, Terceros, Pago, upload
and signing already live in the flows. The procedure class holds only: its data shape, which terceros it
adds, whether Pago is filled or skipped, the upload style, and its assertion locators.

**1. `src/procedures/cofepris/T<code>.ts`** (modelled on `T260204` — the reference)
```typescript
import { Page, Locator, expect } from '@playwright/test';
import { SubmissionFlow } from '../../flows/SubmissionFlow';
import { DocumentUploadFlow } from '../../flows/DocumentUploadFlow';
import { SigningFlow } from '../../flows/SigningFlow';
import { CofeprisRegistrationFlow } from '../../flows/CofeprisRegistrationFlow';
import { Tab } from '../../components/layout/Tab';
import { Logger } from '../../utils/Logger';
import { EfirmaCredentials, DocumentData } from '../../types';
import { CofeprisRegistrationData, SolicitanteData, RepresentanteLegalData, TerceroData, PagoData } from '../../types/cofepris';

// Procedure-specific data shape: extend the shared base, add only what's unique.
export interface T<code>Data extends CofeprisRegistrationData {
  terceros: { fabricante: TerceroData; destinatario: TerceroData };   // which terceros this trámite adds
  pago: PagoData;
  documents: DocumentData[];
}

export class T<code> {
  // Only assertion locators unique to this procedure (readonly, set in constructor).
  readonly procedureTitle: Locator;
  readonly folioMessage: Locator;
  readonly acuseDocument: Locator;

  constructor(private readonly page: Page) {
    this.procedureTitle = page.getByRole('heading', { name: /<title regex>/i });
    this.folioMessage   = page.getByText(/tu solicitud ha sido registrada con el siguiente número de folio/i);
    this.acuseDocument  = page.getByText('Acuse de recepción de trámite', { exact: false });
  }

  async startNewSubmission(): Promise<void> { await SubmissionFlow.startNewSolicitud(this.page); }
  async open(code: string): Promise<void>   { await SubmissionFlow.openProcedureFromCatalogue(this.page, code); }

  async expectTabsPresent(tabLabels: string[]): Promise<void> {
    await Logger.step('Verify all procedure tabs are present', async () => {
      for (const label of tabLabels) await expect(this.page.getByText(label, { exact: true }).first()).toBeVisible();
    });
  }

  async verifySolicitante(data: SolicitanteData): Promise<void> { /* assert prefilled #rfc/#razonSocial/… — see T260204 */ }

  async fillDatosSolicitud(data: T<code>Data): Promise<void> {
    await CofeprisRegistrationFlow.fillDatosSolicitud(this.page, data);   // pass addMercanciaMateriasPrimas for a 260203-style modal
  }
  async verifyRepresentanteAutofill(d: RepresentanteLegalData): Promise<void> {
    await CofeprisRegistrationFlow.verifyRepresentanteAutofill(this.page, d);
  }
  async fillTerceros(data: T<code>Data): Promise<void> {
    await new Tab(this.page).click('Terceros relacionados');
    await CofeprisRegistrationFlow.addTercero(this.page, 'fabricanteModal', data.terceros.fabricante);
    await CofeprisRegistrationFlow.addTercero(this.page, 'destinatarioModal', data.terceros.destinatario);
  }
  async fillPago(d: PagoData): Promise<void> { await CofeprisRegistrationFlow.fillPago(this.page, d); }   // or skipPagoAndContinue()

  async uploadDocuments(documents: DocumentData[]): Promise<void> {
    await DocumentUploadFlow.uploadAllWithConfirmation(this.page, documents);
    await this.page.getByRole('button', { name: /continuar/i }).click();
    await this.page.waitForLoadState('networkidle');
  }
  async sign(creds: EfirmaCredentials): Promise<void> { await SigningFlow.signSubmission(this.page, creds); }
  async downloadAcuse(): Promise<string> { /* waitForEvent('download') on the acuse row's button; return suggestedFilename() */ }
}
```

**2. `test-data/procedures/<code>.json`** — matches `T<code>Data` (see `260204.json` in full):
```json
{ "procedureCode": "<code>", "procedureTitle": "...", "tabs": ["Solicitante", "Datos de la solicitud", "Terceros relacionados", "Pago de derechos"],
  "efirma": { "cerPath": "test-data/files/…​.cer", "keyPath": "test-data/files/…​.key", "password": "…" },
  "solicitante": { "rfc": "...", "razonSocial": "...", "correo": "...", "estado": "...", "codigoPostal": "..." },
  "establecimiento": { … }, "scian": { "clave": "…", "descripcion": "…" },
  "licenciaSanitaria": "…", "regimen": "…", "aduana": "…",
  "mercancia": { … }, "datosPublicos": "No", "representanteLegal": { … },
  "terceros": { "fabricante": { … }, "destinatario": { … } },
  "pago": { "claveReferencia": "…", "banco": "…", "fechaPago": "YYYY-MM-DD", "importePago": "…" },
  "documents": [ { "type": "licencia_sanitaria_o_aviso", "path": "test-data/files/…​.pdf" } ] }
```

**3. `tests/cofepris/<code>.spec.ts`**
```typescript
import { test, expect } from '../../src/fixtures';
import { T<code>, T<code>Data } from '../../src/procedures/cofepris/T<code>';
import rawData from '../../test-data/procedures/<code>.json';

const data = rawData as T<code>Data;

test.describe('<code> — [name]', () => {
  test.beforeEach(async ({ authenticatedPage }) => { await new T<code>(authenticatedPage).startNewSubmission(); });

  test('logs in, opens the procedure, verifies tabs and Solicitante prefill', async ({ authenticatedPage }) => {
    const procedure = new T<code>(authenticatedPage);
    await procedure.open(data.procedureCode);
    await expect(procedure.procedureTitle).toBeVisible();
    await procedure.expectTabsPresent(data.tabs);
    await procedure.verifySolicitante(data.solicitante);
  });

  test('fills all tabs, uploads documents, signs, and receives a folio', async ({ authenticatedPage }) => {
    const procedure = new T<code>(authenticatedPage);
    await procedure.open(data.procedureCode);
    await procedure.fillDatosSolicitud(data);
    await procedure.verifyRepresentanteAutofill(data.representanteLegal);
    await procedure.fillTerceros(data);
    await procedure.fillPago(data.pago);
    await procedure.uploadDocuments(data.documents);
    await procedure.sign(data.efirma);
    await expect(procedure.folioMessage).toBeVisible();
  });
});
```

---

## COFEPRIS reactive-form patterns → component strategy

The COFEPRIS forms are one long Angular reactive-form page. Recurring DOM traps and how to locate:

| What you see | Locate by | Component call |
|---|---|---|
| Repeated ids across sections; ambiguous labels | `formcontrolname` (unique per field) | `new TextField(page, '<fcn>', 'control')` |
| Dropdown `<select formcontrolname="selectControl">` inside `<app-catalogo-select name="…">` | wrapper `name` | `new Dropdown(page, '<name>', 'control')` |
| Add-record modals (S.C.I.A.N., Mercancía, Terceros) pre-rendered **hidden** → same `formcontrolname` matches a visible field *and* a hidden copy | `:visible` scope (built into `'control'`/`'id'`); commit buttons scoped to the modal (e.g. `#mercanciaModal`), wait for close | — |
| Declaration checkbox whose visible label is just `*` | `formcontrolname` | `new Checkbox(page, '<fcn>', 'control')` |
| Radio group with no per-option label (id `"Si"`/`"No"`) | element `id` | `RadioButton.byId(page, '<id>')` |
| `<crosslist>` dual-list in a collapsible panel (País de origen, Uso específico) | panel heading (+ modal scope) | `new CrossList(page, '<heading>', '#mercanciaModal').add(v)` |
| Disabled/auto-filled fields (populated by a related selection) | don't type them | — |

Strategies: `TextField`/`Dropdown`/`Checkbox` accept `'control'` (formcontrolname), `'id'`, or default
`'label'` — all `'control'`/`'id'` variants are `:visible`-scoped so on-screen fields beat hidden modal
copies. `Tab` handles ARIA `role="tab"`, Bootstrap `<a data-toggle="tab">`, **and bare `<li>` tabs with
no role** (falls back to the list item — needed by 3-tab 260604). If a control type isn't covered,
**extend the component** (add a strategy) — never put the locator in a flow/procedure/spec.

## COFEPRIS procedure-family divergence — probe every new procedure

**Never assume the medicamentos shape.** The Datos-de-la-solicitud tab varies a lot between families;
what changed across the ones automated so far (medicamentos 260204/260215/260205 · materias-primas
260202/260203 · precursores 260604 · sustancias-tóxicas 260512):

| Aspect | Variants seen |
|---|---|
| Tabs | 4 (Solicitante/Datos/Terceros/Pago), or **3 with no Pago** (260604 — advance to Paso 2 via `Continuar`, `CofeprisRegistrationFlow.continueToPaso2`) |
| Establecimiento field names | medicamentos `rfcSanitario`/`denominacionRazon`/`municipioAlcaldia`; tóxicas `rfcDel`/`denominacionRazonSocial`/`muncipio` [sic]; precursores has **no** RFC-del-responsable. Extra `localidad`/`colonia`/`lada` on some. → guard optional fields; don't reuse `fillEstablecimiento` blindly |
| Manifiestos checkbox | `formcontrolname="manifesto"` (medicamentos), `"cumplimiento"` (tóxicas), or a **bare checkbox with no fcn/id** (260604) → locate by elimination: the only visible checkbox outside any table and not the `aviso` toggle |
| Mercancía | a **modal** (`#mercanciaModal`, medicamentos/materias-primas/precursores) or **inline on the Datos tab** (tóxicas, no modal) |
| Mercancía fields | medicamentos (denominación*/formaFarmacéutica/númeroRegistro) · materias-primas (detalle sub-form) · precursores (marca comercial/DCI/porcentaje/valor comercial/**Fecha de movimiento**/país dropdowns) · tóxicas (nombre comercial/común/químico/**Número CAS**/clasificación toxicológica/objeto de importación) |
| País de origen/destino/procedencia | `<crosslist>` (medicamentos), plain `<app-catalogo-select>` dropdowns (precursores), or bare dual-lists (tóxicas). **País de procedencia often auto-derives + is disabled** → skip it |
| Régimen / Aduana | régimen sometimes **disabled/auto** (260604 → select only when `!isDisabled()`); aduana is a dropdown on some, a dual-list on others (tóxicas) |

**Two dual-list widget families** (both render as a source listbox + "Agregar selección" + "…seleccionado"
target):
- **`<crosslist>`-wrapped** → use the `CrossList` component (País/Uso on medicamentos).
- **Bare `<select multiple>`** in a *collapsed* panel, no `<crosslist>` (Uso on precursores; aduana/país on
  tóxicas) → CrossList can't drive it. Expand the panel first, `selectOption` the source, then click the
  **visible** "Agregar selección" (hidden país dual-lists share the button label, so scope to `visible`).
  The DOM updates before Angular's reactive-form model, so let it settle before committing.

**Disabled/auto-derived fields are excluded from form validation** — never try to set them (país
procedencia, descripción de la fracción, régimen on some forms); guard with `!(await sel.isDisabled())`.

**Stale dates block the commit silently** — see CLAUDE.md: use a future date, never the manual's literal.

---

## Add a flow / component / document type

- **Flow** (`src/flows/XxxFlow.ts`) — only when a sequence is used by 2+ procedures and doesn't exist.
  Static async methods; wrap each in `Logger.step`; component calls only, no locators/assertions. Behaviour
  shared across a COFEPRIS family belongs in `CofeprisRegistrationFlow` (pass a handler param, as
  `fillDatosSolicitud` does for the mercancía variant), not a per-procedure copy.
- **Component** (`src/components/form|layout/Xxx.ts`) — only when a control *type* is new (e.g. an
  Accordion). Import `{ Page, Locator, expect }` from `@playwright/test`; constructor takes the locator,
  methods do actions + element `expect()`. Add a `by` strategy rather than a new component when it's the
  same control located differently. Never for a one-off locator.
- **Document type** — add the `key: 'Etiqueta visible en VUCEM'` mapping to `getUiLabel()` in
  `DocumentUploadFlow.ts`. Existing COFEPRIS keys: `licencia_sanitaria_o_aviso`,
  `licencia_sanitaria_vigente`, `aviso_responsable`, `registro_sanitario_vigente`, `proyectos_de_marbete`,
  `pago_de_derechos`, `otro` (plus generic `acta_constitutiva`, `poder_notarial`, etc.).

## Auth & env

- `authenticatedPage` logs in fresh per test (see the Fixture note above) using `test-data/envs/{ENV}.json`
  e.firma creds — it does **not** restore `auth/state.json`. Login flow changed → update
  `src/flows/LoginFlow.ts`.
- `tests/auth.setup.ts` (the `setup` project) still writes `auth/state.json`, which `npm run codegen` loads
  for interactive selector exploration. "Not logged in" during codegen → `npm run auth` to refresh it.
- Target env via `ENV` (`qa` default, `staging`). New env → add `test-data/envs/<name>.json` like `qa.json`.

## Reporting (Allure + Playwright HTML)

Every run emits four reporters (configured in `playwright.config.ts`): `list` (terminal), `html`
(`playwright-report/`), `json` (`playwright-report/results.json`), and **`allure-playwright`** → raw
results in `allure-results/`. Both `allure-results/` and `allure-report/` are git-ignored.

- **View the Allure report locally:** `npm run allure:serve` (generates + opens a temp server from
  `allure-results/`), or `npm run allure:generate` → `npm run allure:open` for a persisted
  `allure-report/`. `npm run allure:clean` wipes both dirs. Requires a JDK (the Allure CLI is Java-based).
- **Steps & artifacts are automatic:** `Logger.step()` calls nest as Allure steps; on failure the
  screenshot/video/trace attach themselves. `ArtifactStore` also attaches the captured **folio** (text)
  and the downloaded **acuse** (PDF) to the run.
- **Add metadata from a procedure/spec via `Logger`** (never import `allure-js-commons` elsewhere —
  report concerns live in `Logger`):
  ```typescript
  import { Logger, Severity, ContentType } from '../utils/Logger';
  await Logger.suite('COFEPRIS', '260204', 'Registro ciudadano');  // Behaviors tree: epic/feature/story
  await Logger.severity(Severity.CRITICAL);
  await Logger.tags('cofepris', 'smoke');
  await Logger.attach('payload', JSON.stringify(body), ContentType.JSON);
  await Logger.attachFile('acuse', savedPath);                     // defaults to application/pdf
  ```

## CI (`.github/workflows/automation.yml`)

Lint + typecheck (fail fast) → tests across 4 shards, `retries: 1` → uploads screenshots/videos/traces
**and `allure-results/`** on failure. The `merge-reports` job merges the shard HTML reports and, after
setting up a JDK, aggregates every shard's `allure-results/` into a single **`allure-report`** artifact
(UUID-named result files never collide). Manual trigger allows env selection.

## Key decisions (don't undo)

- **No page-object-per-procedure** — ~70% shared UI; shared code in components/flows, procedures hold only
  what differs. **Static flow methods** — flows are stateless action sequences. **JSON test data** — native
  typed imports, no parser. **`getByLabel` primary, `'control'` for COFEPRIS** — reactive forms repeat ids.
  **Fresh e.firma login per test** — the app's `sessionStorage` token can't be restored from disk; correctness
  over the ~20s cost. **`fullyParallel: false`, `workers: 2` locally** — government portal may rate-limit;
  raise workers only after verifying.

Not built yet (add when a procedure needs it, following existing patterns): `Accordion`,
`ApprovalFlow`/`ObservationFlow` (review/resubmission cycle), the `se/` and `aga/` departments, and further
COFEPRIS procedures beyond the current four.
