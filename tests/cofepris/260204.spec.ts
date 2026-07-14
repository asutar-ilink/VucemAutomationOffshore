/**
 * 260204 — Permiso sanitario de importación de medicamentos con registro
 * sanitario (COFEPRIS). Citizen registration journey (manual TC01–TC13).
 *
 * TC01–TC03 (portal launch, e.firma login, role selection) run inside the
 * authenticatedPage fixture — every test starts logged in as "Persona Moral"
 * on the solicitante workspace.
 *
 * Validation status against the live portal (front.v30):
 *   ✅ TC01–TC06 — login, role, navigate to the 260204 form, verify tabs and
 *      the prefilled Solicitante section. Covered by the passing test below.
 *   🚧 TC07–TC13 — in progress, validated live section by section. Working:
 *      Datos de la solicitud → establecimiento (dismiss COFEPRIS-comms modal +
 *      capture), S.C.I.A.N. modal, licencia/régimen/aduana, and the Mercancía
 *      modal's main fields. Remaining blocker: the Mercancía modal's País de
 *      origen / País de procedencia / Uso específico are <crosslist> dual-list
 *      widgets in collapsible panels (expand → select → "Agregar selección"),
 *      not yet automated. After that: Manifiestos/datos-públicos/representante,
 *      Terceros (2 add modals), Pago, document upload, and e.firma firmar+submit.
 *      Controls are located by formControlName / catalogo-select name (ids and
 *      labels repeat across sections). Marked test.fixme until the pass completes.
 */

import { test, expect } from '../../src/fixtures';
import { T260204, T260204Data } from '../../src/procedures/cofepris/T260204';
import rawData from '../../test-data/procedures/260204.json';

const data = rawData as T260204Data;

test.describe('260204 — Permiso sanitario de importación de medicamentos', () => {

  // Prerequisite (TC03–TC04): every test starts on the bandeja (via the
  // authenticatedPage fixture), then navigates Trámites → Solicitudes nuevas to
  // reach the selección-de-trámite catalogue before opening the 260204 row.
  test.beforeEach(async ({ authenticatedPage }) => {
    await new T260204(authenticatedPage).startNewSubmission();
  });

  test('TC01–TC06: logs in, opens the procedure, verifies tabs and Solicitante prefill', async ({ authenticatedPage }) => {
    const procedure = new T260204(authenticatedPage);

    // TC04 — open the procedure form (260204 row on the catalogue)
    await procedure.open(data.procedureCode);

    // TC05 — title + all tabs present
    await expect(procedure.procedureTitle).toBeVisible();
    await procedure.expectTabsPresent(data.tabs);

    // TC06 — Solicitante prefilled details
    await procedure.verifySolicitante(data.solicitante);
  });

  // 🚧 TC07–TC13 — pending live-validation of establecimiento dropdowns, the
  // add-record modals (S.C.I.A.N./Mercancías/Terceros), Pago, upload and firmar.
  test('TC07–TC13: fills all tabs, uploads documents, signs, and receives a folio', async ({ authenticatedPage, efirma }) => {
    const procedure = new T260204(authenticatedPage);

    await procedure.open(data.procedureCode);
    await procedure.verifySolicitante(data.solicitante);

    await procedure.fillDatosSolicitud(data);
    await procedure.verifyRepresentanteAutofill(data.representanteLegal);
    await procedure.fillTerceros(data);
    await procedure.fillPago(data.pago);
    await procedure.uploadDocuments(data.documents);
    await procedure.sign(efirma);

    await expect(procedure.folioMessage).toBeVisible();
    await expect(procedure.acuseDocument).toBeVisible();

    const folio = await procedure.captureFolio(data.procedureCode);
    expect(folio).toMatch(/^\d{10,}$/);

    const savedPath = await procedure.downloadAndSaveAcuse(data.procedureCode);
    expect(savedPath).toMatch(/260204\.pdf$/i);
  });

});
