/**
 * 260501 — Permiso de importación de plaguicidas (COFEPRIS).
 * Citizen registration journey (manual TC01–TC13).
 *
 * TC01–TC03 (portal launch, e.firma login, role selection) run inside the
 * authenticatedPage fixture — every test starts logged in as "Persona Moral"
 * on the solicitante workspace.
 *
 * Coverage:
 *   TC04–TC06 — open the 260501 form, verify the title + four tabs, and the
 *      prefilled Solicitante section.
 *   TC07–TC13 — Datos de la solicitud (establecimiento capture, S.C.I.A.N.,
 *      licencia, Aduanas de entrada dual-list, the plaguicidas Mercancía modal,
 *      manifiestos, datos públicos, representante), the three Terceros
 *      (Fabricante/Formulador/Proveedor), skipping Pago de derechos, document
 *      upload, e.firma firmar, and the generated folio + acuse download.
 */

import { test, expect } from '../../src/fixtures';
import { T260501, T260501Data } from '../../src/procedures/cofepris/T260501';
import rawData from '../../test-data/procedures/260501.json';

const data = rawData as T260501Data;

// The backend enforces a unique "Llave de pago" per trámite, so a hard-coded
// value fails on the second run. Generate a fresh, unique llave each run.
data.pago.llavePago = `PAY${Date.now().toString().slice(-9)}`;

test.describe('260501 — Permiso de importación de plaguicidas', () => {

  // Prerequisite (TC03–TC04): every test starts on the bandeja (via the
  // authenticatedPage fixture), then navigates Trámites → Solicitudes nuevas to
  // reach the selección-de-trámite catalogue before opening the 260501 row.
  test.beforeEach(async ({ authenticatedPage }) => {
    await new T260501(authenticatedPage).startNewSubmission();
  });


  test('260501: fills all tabs, uploads documents, signs, and receives a folio', async ({ authenticatedPage, efirma }) => {
    const procedure = new T260501(authenticatedPage);
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
    expect(savedPath).toMatch(/260501\.pdf$/i);
  });

});
