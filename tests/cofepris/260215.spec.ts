/**
 * 260215 — Permiso sanitario de importación de dispositivos médicos para
 * investigación en humanos (COFEPRIS). Happy-path registration journey
 * (manual TC01–TC13).
 *
 * Login (portal → e.firma → role) runs inside the authenticatedPage fixture;
 * every test starts logged in as "Persona Moral" on the solicitante workspace.
 *
 * The Paso-1 form is the shared medicamentos shape (CofeprisRegistrationFlow.
 * fillDatosSolicitud); 260215 verifies the full prefilled Solicitante address
 * (TC06), adds Fabricante + Destinatario(destino final), skips Pago, uploads the
 * mandatory "Carta técnica del producto", signs, and persists the folio/acuse.
 */

import { test, expect } from '../../src/fixtures';
import { T260215, T260215Data } from '../../src/procedures/cofepris/T260215';
import rawData from '../../test-data/procedures/260215.json';

const data = rawData as T260215Data;

test.describe('260215 — Permiso sanitario de importación de dispositivos médicos para investigación en humanos', () => {

  // Every test starts on the bandeja (via the authenticatedPage fixture), then
  // navigates Trámites → Solicitudes nuevas to reach the catalogue.
  test.beforeEach(async ({ authenticatedPage }) => {
    await new T260215(authenticatedPage).startNewSubmission();
  });

  test('registration: fills all tabs, uploads the mandatory document, signs, generates a folio, downloads the acuse', async ({ authenticatedPage, efirma }) => {
    const procedure = new T260215(authenticatedPage);

    // Open the procedure form and verify structure + full Solicitante prefill (TC04–TC06).
    await procedure.open(data.procedureCode);
    await expect(procedure.procedureTitle).toBeVisible();
    await procedure.expectTabsPresent(data.tabs);
    await procedure.verifySolicitante(data.solicitante);

    // Paso 1 — Datos de la solicitud, representante autofill, Terceros, skip Pago (TC07–TC09).
    await procedure.fillDatosSolicitud(data);
    await procedure.verifyRepresentanteAutofill(data.representanteLegal);
    await procedure.fillTerceros(data);
    await procedure.skipPagoAndContinue();

    // Paso 2 — the mandatory document, then Paso 3 — firmar (TC10–TC11).
    await procedure.uploadDocuments(data.documents);
    await procedure.sign(efirma);

    // Acuse — folio generated; persist folio + downloaded acuse as artifacts (TC12–TC13).
    await expect(procedure.folioMessage).toBeVisible();
    await expect(procedure.acuseDocument).toBeVisible();

    const folio = await procedure.captureFolio(data.procedureCode);
    expect(folio).toMatch(/^\d{10,}$/);

    const savedPath = await procedure.downloadAndSaveAcuse(data.procedureCode);
    expect(savedPath).toMatch(/260215\.pdf$/i);
  });

});
