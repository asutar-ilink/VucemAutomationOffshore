/**
 * 260212 — Permiso sanitario de importación de medicamentos (COFEPRIS).
 *
 * A sibling of 260204 / 260210 / 260203 — same registration journey (login runs
 * inside the authenticatedPage fixture; every test starts logged in as "Persona
 * Moral" on the solicitante workspace). The Paso-1 form and Terceros modals are
 * shared via CofeprisRegistrationFlow; the procedure-specific pieces (terceros,
 * pago, documents) live in T260212 and are adjusted to the live app.
 */

import { test, expect } from '../../src/fixtures';
import { T260212, T260212Data } from '../../src/procedures/cofepris/T260212';
import rawData from '../../test-data/procedures/260212.json';

const data = rawData as T260212Data;

test.describe('260212 — Permiso sanitario de importación de medicamentos', () => {

  // Every test starts on the bandeja (via the authenticatedPage fixture), then
  // navigates Trámites → Solicitudes nuevas to reach the catalogue.
  test.beforeEach(async ({ authenticatedPage }) => {
    await new T260212(authenticatedPage).startNewSubmission();
  });

  test('registration: fills all tabs, uploads a document, signs, generates a folio, downloads the acuse', async ({ authenticatedPage }) => {
    const procedure = new T260212(authenticatedPage);

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

    // Paso 2 — one optional document, then Paso 3 — firmar.
    await procedure.uploadOptionalDocument(data.optionalDocument);
    await procedure.sign(data.efirma);

    // Acuse — folio generated; persist folio + downloaded acuse as artifacts.
    await expect(procedure.folioMessage).toBeVisible();
    await expect(procedure.acuseDocument).toBeVisible();

    const folio = await procedure.captureFolio(data.procedureCode);
    expect(folio).toMatch(/^\d{10,}$/);

    const savedPath = await procedure.downloadAndSaveAcuse(data.procedureCode);
    expect(savedPath).toMatch(/260212\.pdf$/i);
  });

});
