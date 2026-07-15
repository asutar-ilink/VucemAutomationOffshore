/**
 * 260604 — Aviso de exportación de precursores químicos o productos químicos
 * esenciales (COFEPRIS). Happy-path journey (manual TC01–TC10).
 *
 * A THREE-tab procedure (no Pago de derechos). Login runs inside the
 * authenticatedPage fixture. The Datos tab is the precursores shape
 * (CofeprisRegistrationFlow.fillDatosSolicitud + addMercanciaPrecursores);
 * Paso 1 advances straight to Paso 2 via Continuar, Paso 2 takes one optional
 * document ("Otro"), then Paso 3 firmar. Terceros are not required for the
 * happy path.
 */

import { test, expect } from '../../src/fixtures';
import { T260604, T260604Data } from '../../src/procedures/cofepris/T260604';
import rawData from '../../test-data/procedures/260604.json';

const data = rawData as T260604Data;

test.describe('260604 — Aviso de exportación de precursores químicos o productos químicos esenciales', () => {

  test.beforeEach(async ({ authenticatedPage }) => {
    await new T260604(authenticatedPage).startNewSubmission();
  });

  test('registration: fills Datos, uploads an optional document, signs, generates a folio, downloads the acuse', async ({ authenticatedPage, efirma }) => {
    const procedure = new T260604(authenticatedPage);

    // Open the procedure form and verify structure + full Solicitante prefill (TC04–TC06).
    await procedure.open(data.procedureCode);
    await expect(procedure.procedureTitle).toBeVisible();
    await procedure.expectTabsPresent(data.tabs);
    await procedure.verifySolicitante(data.solicitante);

    // Paso 1 — Datos de la solicitud (precursores Mercancía), representante autofill (TC07).
    await procedure.fillDatosSolicitud(data);
    await procedure.verifyRepresentanteAutofill(data.representanteLegal);

    // No Pago tab — advance straight to Paso 2, upload the optional document, firmar (TC09–TC10).
    await procedure.continueToPaso2();
    await procedure.uploadDocuments(data.documents);
    await procedure.sign(efirma);

    // Acuse — folio generated; persist folio + downloaded acuse as artifacts.
    await expect(procedure.folioMessage).toBeVisible();
    await expect(procedure.acuseDocument).toBeVisible();

    const folio = await procedure.captureFolio(data.procedureCode);
    expect(folio).toMatch(/^\d{10,}$/);

    const savedPath = await procedure.downloadAndSaveAcuse(data.procedureCode);
    expect(savedPath).toMatch(/260604\.pdf$/i);
  });

});
