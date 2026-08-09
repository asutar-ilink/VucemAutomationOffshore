/**
 * 260210 — Permiso sanitario de importación de medicamentos destinados a
 * pruebas de laboratorio (COFEPRIS). Citizen registration journey
 * (manual TC 16659–16714).
 *
 * TC 16659/16662 (portal launch, e.firma login, role selection) run inside the
 * authenticatedPage fixture — every test starts logged in as "Persona Moral"
 * on the solicitante workspace.
 *
 * The registration path mirrors 260204 (its Paso-1 form and Terceros modals are
 * identical, driven by CofeprisRegistrationFlow), differing only in: a single
 * Destinatario tercero, Pago skipped, an optional Paso-2 document, and the
 * folio/acuse being persisted under executed-procedure-artifacts/.
 */

import { test, expect } from '../../src/fixtures';
import { T260210, T260210Data } from '../../src/procedures/cofepris/T260210';
import rawData from '../../test-data/procedures/260210.json';

const data = rawData as T260210Data;

test.describe('260210 — Permiso sanitario de importación de medicamentos (pruebas de laboratorio)', () => {

  // Every test starts on the bandeja (via the authenticatedPage fixture), then
  // navigates Trámites → Solicitudes nuevas to reach the catalogue.
  test.beforeEach(async ({ authenticatedPage }) => {
    await new T260210(authenticatedPage).startNewSubmission();
  });

  test('260210: registration: fills all tabs, uploads a document, signs, generates a folio, downloads the acuse', async ({ authenticatedPage, efirma }) => {
    const procedure = new T260210(authenticatedPage);

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
    await procedure.sign(efirma);

    // Acuse — folio generated; persist folio + downloaded acuse as artifacts.
    await expect(procedure.folioMessage).toBeVisible();
    await expect(procedure.acuseDocument).toBeVisible();

    const folio = await procedure.captureFolio(data.procedureCode);
    expect(folio).toMatch(/^\d{10,}$/);

    const savedPath = await procedure.downloadAndSaveAcuse(data.procedureCode);
    expect(savedPath).toMatch(/260210\.pdf$/i);
  });

});
