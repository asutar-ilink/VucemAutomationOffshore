/**
 * 260603 — Aviso de importación de precursores químicos o productos químicos
 * esenciales (COFEPRIS). Happy-path journey (manual TC 17528–17659).
 *
 * The import sibling of 260604 (export): a THREE-tab procedure (no Pago de
 * derechos). Login runs inside the authenticatedPage fixture. The Datos tab is
 * the precursores shape (CofeprisRegistrationFlow.fillDatosSolicitud +
 * addMercanciaPrecursores); the Terceros tab takes the mandatory
 * Facturador/Consignatario; Paso 1 advances to Paso 2 via Continuar, Paso 2 takes
 * one optional document ("Otro"), then Paso 3 firmar.
 */

import { test, expect } from '../../src/fixtures';
import { T260603, T260603Data } from '../../src/procedures/cofepris/T260603';
import rawData from '../../test-data/procedures/260603.json';

const data = rawData as T260603Data;

test.describe('260603 — Aviso de importación de precursores químicos o productos químicos esenciales', () => {

  test.beforeEach(async ({ authenticatedPage }) => {
    await new T260603(authenticatedPage).startNewSubmission();
  });

  test('260603: registration: fills Datos + Terceros, uploads an optional document, signs, generates a folio, downloads the acuse', async ({ authenticatedPage, efirma }) => {
    const procedure = new T260603(authenticatedPage);

    // Open the procedure form and verify structure + full Solicitante prefill.
    await procedure.open(data.procedureCode);
    await expect(procedure.procedureTitle).toBeVisible();
    await procedure.expectTabsPresent(data.tabs);
    await procedure.verifySolicitante(data.solicitante);

    // Paso 1 — Datos de la solicitud (precursores Mercancía), representante autofill.
    await procedure.fillDatosSolicitud(data);
    await procedure.verifyRepresentanteAutofill(data.representanteLegal);

    // Terceros relacionados — the mandatory Facturador/Consignatario record.
    await procedure.fillTerceros(data);

    // No Pago tab — advance straight to Paso 2, upload the optional document, firmar.
    await procedure.continueToPaso2();
    await procedure.uploadDocuments(data.documents);
    await procedure.sign(efirma);

    // Acuse — folio generated; persist folio + downloaded acuse as artifacts.
    await expect(procedure.folioMessage).toBeVisible();
    await expect(procedure.acuseDocument).toBeVisible();

    const folio = await procedure.captureFolio(data.procedureCode);
    expect(folio).toMatch(/^\d{10,}$/);

    const savedPath = await procedure.downloadAndSaveAcuse(data.procedureCode);
    expect(savedPath).toMatch(/260603\.pdf$/i);
  });

});
