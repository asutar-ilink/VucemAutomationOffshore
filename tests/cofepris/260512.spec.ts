/**
 * 260512 — Permiso de importación de sustancias tóxicas (COFEPRIS).
 * Citizen registration journey (manual TC01–TC06).
 *
 * TC01 preamble (portal launch, e.firma login, role selection) runs inside the
 * authenticatedPage fixture — every test starts logged in as "Persona Moral"
 * on the solicitante workspace.
 *
 * Coverage:
 *   TC01 — open the 260512 form, verify the title + four tabs, and the prefilled
 *      Solicitante section.
 *   TC02–TC06 — Datos de la solicitud (establecimiento capture, S.C.I.A.N.,
 *      aviso + licencia, Aduanas de entrada dual-list, the tóxicas Mercancía
 *      modal with Número CAS / clasificación toxicológica / objeto de la
 *      importación / país origen + procedencia, manifiestos, datos públicos,
 *      representante), the empty Terceros relacionados tab, the mandatory Pago de
 *      derechos, document upload, e.firma firmar, and the generated folio + acuse.
 */

import { test, expect } from '../../src/fixtures';
import { T260512, T260512Data } from '../../src/procedures/cofepris/T260512';
import rawData from '../../test-data/procedures/260512.json';

const data = rawData as T260512Data;

// The backend enforces a unique "Llave de pago" per trámite, so a hard-coded
// value fails on the second run. Generate a fresh, unique llave each run.
data.pago.llavePago = `LLAVE${Date.now().toString().slice(-9)}`;

test.describe('260512 — Permiso de importación de sustancias tóxicas', () => {

  // Prerequisite (TC01): every test starts on the bandeja (via the
  // authenticatedPage fixture), then navigates Trámites → Solicitudes nuevas to
  // reach the selección-de-trámite catalogue before opening the 260512 row.
  test.beforeEach(async ({ authenticatedPage }) => {
    await new T260512(authenticatedPage).startNewSubmission();
  });

  test('260512: fills all tabs, uploads documents, signs, and receives a folio', async ({ authenticatedPage, efirma }) => {
    const procedure = new T260512(authenticatedPage);
    await procedure.open(data.procedureCode);
    await procedure.verifySolicitante(data.solicitante);
    await procedure.fillDatosSolicitud(data);
    await procedure.verifyRepresentanteAutofill(data.representanteLegal);
    await procedure.verifyNoTerceros();
    await procedure.fillPago(data.pago);
    await procedure.uploadDocuments(data.documents);
    await procedure.sign(efirma);
    await expect(procedure.folioMessage).toBeVisible();
    await expect(procedure.acuseDocument).toBeVisible();

    const folio = await procedure.captureFolio(data.procedureCode);
    expect(folio).toMatch(/^\d{10,}$/);

    const savedPath = await procedure.downloadAndSaveAcuse(data.procedureCode);
    expect(savedPath).toMatch(/260512\.pdf$/i);
  });

});
