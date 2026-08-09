/**
 * 260205 — Permiso sanitario de importación de medicamentos y materias primas
 * destinados a investigación en humanos (COFEPRIS).
 *
 * The manual defines TC01–TC06 (structure + full Solicitante prefill); this spec
 * automates the whole end-to-end journey. Login runs inside the authenticatedPage
 * fixture. The Paso-1 form is the shared medicamentos shape
 * (CofeprisRegistrationFlow.fillDatosSolicitud); 260205 adds Fabricante +
 * Destinatario, skips Pago, uploads the mandatory document, signs, and persists
 * the folio/acuse. Datos/Terceros/Pago/document values are derived live (the
 * manual specifies none) and reuse 260215's proven catalogue-valid data.
 */

import { test, expect } from '../../src/fixtures';
import { T260205, T260205Data } from '../../src/procedures/cofepris/T260205';
import rawData from '../../test-data/procedures/260205.json';

const data = rawData as T260205Data;

test.describe('260205 — Permiso sanitario de importación de medicamentos y materias primas destinados a investigación en humanos', () => {

  test.beforeEach(async ({ authenticatedPage }) => {
    await new T260205(authenticatedPage).startNewSubmission();
  });

  test('260205: registration: fills all tabs, uploads the mandatory document, signs, generates a folio, downloads the acuse', async ({ authenticatedPage, efirma }) => {
    const procedure = new T260205(authenticatedPage);

    // Open the procedure form and verify structure + full Solicitante prefill (TC04–TC06).
    await procedure.open(data.procedureCode);
    await expect(procedure.procedureTitle).toBeVisible();
    await procedure.expectTabsPresent(data.tabs);
    await procedure.verifySolicitante(data.solicitante);

    // Paso 1 — Datos de la solicitud, representante autofill, Terceros, skip Pago.
    await procedure.fillDatosSolicitud(data);
    await procedure.verifyRepresentanteAutofill(data.representanteLegal);
    await procedure.fillTerceros(data);
    await procedure.skipPagoAndContinue();

    // Paso 2 — the mandatory document, then Paso 3 — firmar.
    await procedure.uploadDocuments(data.documents);
    await procedure.sign(efirma);

    // Acuse — folio generated; persist folio + downloaded acuse as artifacts.
    await expect(procedure.folioMessage).toBeVisible();
    await expect(procedure.acuseDocument).toBeVisible();

    const folio = await procedure.captureFolio(data.procedureCode);
    expect(folio).toMatch(/^\d{10,}$/);

    const savedPath = await procedure.downloadAndSaveAcuse(data.procedureCode);
    expect(savedPath).toMatch(/260205\.pdf$/i);
  });

});
