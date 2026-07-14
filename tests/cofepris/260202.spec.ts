/**
 * 260202 — Permiso sanitario de importación de materias primas (COFEPRIS).
 *
 * Registration journey (manual TC id 16657). Login (portal → e.firma → role)
 * runs inside the authenticatedPage fixture; every test starts logged in as
 * "Persona Moral" on the solicitante workspace.
 *
 * The Paso-1 form and Terceros modals are shared via CofeprisRegistrationFlow;
 * 260202's specifics — several S.C.I.A.N. claves (one deleted), the "Aviso de
 * funcionamiento" checkbox, the AIFA→AICM checkbox, and several Mercancía
 * records (one deleted, exercising the Cancelar-then-Aceptar confirmation) —
 * live in fillDatosSolicitudMateriasPrimas. It then adds both terceros, skips
 * Pago, uploads the mandatory documents, signs, and persists the folio/acuse.
 *
 * Note: the manual TC's first Mercancía record uses classification "Alimentos",
 * which is not an option in this COFEPRIS (pharma-only) modal — that manual step
 * only asserts the popup opens. The two saved records use the valid BIOLOGICOS
 * classification (the second is deleted per TC15–TC16), and estado físico is the
 * catalogue's accent-less "Liquido".
 */

import { test, expect } from '../../src/fixtures';
import { T260202, T260202Data } from '../../src/procedures/cofepris/T260202';
import rawData from '../../test-data/procedures/260202.json';

const data = rawData as T260202Data;

test.describe('260202 — Permiso sanitario de importación de materias primas', () => {

  // Every test starts on the bandeja (via the authenticatedPage fixture), then
  // navigates Trámites → Solicitudes nuevas to reach the catalogue.
  test.beforeEach(async ({ authenticatedPage }) => {
    await new T260202(authenticatedPage).startNewSubmission();
  });

  test('registration: fills all tabs, deletes marked rows, uploads documents, signs, generates a folio, downloads the acuse', async ({ authenticatedPage, efirma }) => {
    const procedure = new T260202(authenticatedPage);

    // Open the procedure form and verify structure + Solicitante prefill (TC01–TC06).
    await procedure.open(data.procedureCode);
    await expect(procedure.procedureTitle).toBeVisible();
    await procedure.expectTabsPresent(data.tabs);
    await procedure.verifySolicitante(data.solicitante);

    // Paso 1 — Datos de la solicitud (establecimiento, S.C.I.A.N. add+delete,
    // Aviso, régimen/AIFA/AICM, Mercancía add+delete, manifiestos), representante
    // autofill, Terceros, skip Pago (TC07–TC17).
    await procedure.fillDatosSolicitud(data);
    await procedure.verifyRepresentanteAutofill(data.representanteLegal);
    await procedure.fillTerceros(data);
    await procedure.skipPagoAndContinue();

    // Paso 2 — the mandatory documents, then Paso 3 — firmar.
    await procedure.uploadDocuments(data.documents);
    await procedure.sign(efirma);

    // Acuse — folio generated; persist folio + downloaded acuse as artifacts.
    await expect(procedure.folioMessage).toBeVisible();
    await expect(procedure.acuseDocument).toBeVisible();

    const folio = await procedure.captureFolio(data.procedureCode);
    expect(folio).toMatch(/^\d{10,}$/);

    const savedPath = await procedure.downloadAndSaveAcuse(data.procedureCode);
    expect(savedPath).toMatch(/260202\.pdf$/i);
  });

});
