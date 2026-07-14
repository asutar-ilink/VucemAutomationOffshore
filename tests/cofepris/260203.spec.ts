/**
 * 260203 — Permiso sanitario de importación de medicamentos (COFEPRIS).
 *
 * A sibling of 260204 / 260210 — same registration journey (login runs inside
 * the authenticatedPage fixture; every test starts logged in as "Persona Moral"
 * on the solicitante workspace). The Paso-1 form and Terceros modals are shared
 * via CofeprisRegistrationFlow; 260203 adds a single Destinatario tercero, skips
 * Pago, uploads one optional Paso-2 document, then signs and persists the
 * folio/acuse under executed-procedure-artifacts/.
 */

import { test, expect } from '../../src/fixtures';
import { T260203, T260203Data } from '../../src/procedures/cofepris/T260203';
import rawData from '../../test-data/procedures/260203.json';

const data = rawData as T260203Data;

test.describe('260203 — Permiso sanitario de importación de medicamentos', () => {

  // Every test starts on the bandeja (via the authenticatedPage fixture), then
  // navigates Trámites → Solicitudes nuevas to reach the catalogue.
  test.beforeEach(async ({ authenticatedPage }) => {
    await new T260203(authenticatedPage).startNewSubmission();
  });

  test('registration: fills all tabs, uploads a document, signs, generates a folio, downloads the acuse', async ({ authenticatedPage, efirma }) => {
    const procedure = new T260203(authenticatedPage);

    // Open the procedure form and verify structure + Solicitante prefill.
    await procedure.open(data.procedureCode);
    await expect(procedure.procedureTitle).toBeVisible();
    await procedure.expectTabsPresent(data.tabs);
    await procedure.verifySolicitante(data.solicitante);

    // Paso 1 — Datos de la solicitud, representante autofill, Terceros, skip Pago.
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
    expect(savedPath).toMatch(/260203\.pdf$/i);
  });

});
