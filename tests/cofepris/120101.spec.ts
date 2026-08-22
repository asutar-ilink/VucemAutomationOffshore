/**
 * 120101 — Inscripción en el Registro de bienes textiles y prendas de vestir
 * no originarias para recibir trato preferencial dentro del TMEC (SE).
 *
 * TC01–TC03: session + navigation handled by authenticatedPage fixture + startNewSubmission.
 * TC04–TC05: procedure title + tab structure assertions.
 * TC06:      Solicitante prefill verification.
 * TC07:      Consultar cupo, Insumos, Proceso productivo fill (recording-driven).
 * TC08:      Paso firma signing → Acuse + folio persisted as artifacts.
 */

import { test, expect } from '../../src/fixtures';
import { T120101, T120101Data } from '../../src/procedures/se/T120101';
import rawData from '../../test-data/procedures/120101.json';

const data = rawData as T120101Data;

test.describe('120101 — Inscripción en el Registro de bienes textiles TMEC (SE)', () => {

  // TC01–TC03: navigate directly to the SE TPL form with the saved e.firma session.
  test.beforeEach(async ({ authenticatedPage }) => {
    await new T120101(authenticatedPage).startNewSubmission();
  });

  test('120101: registration: fills Consultar cupo, Insumos and Proceso productivo tabs, signs, generates a folio, downloads the acuse', async ({ authenticatedPage, efirma }) => {
    const procedure = new T120101(authenticatedPage);

    // TC04 — open procedure from catalogue; verify title.
    await procedure.open(data.procedureCode);
    await expect(procedure.procedureTitle).toBeVisible();

    // TC05 — all four tabs present.
    await procedure.expectTabsPresent(data.tabs);

    // TC06 — Solicitante prefilled fields are correct.
    await procedure.verifySolicitante(data.solicitante);

    // TC07 — fill Consultar cupo, Insumos and Proceso productivo.
    await procedure.fillConsultarCupo(data.consultarCupo);
    await procedure.fillInsumos(data.insumos);
    await procedure.fillProcesoProductivo(data.procesoProductivo);

    // TC08 — sign with e.firma.
    await procedure.sign(efirma);

    // Acuse — folio generated; persist folio + downloaded acuse as artifacts.
    await expect(procedure.folioMessage).toBeVisible();
    await expect(procedure.acuseDocument).toBeVisible();

    const folio = await procedure.captureFolio(data.procedureCode);
    expect(folio).toMatch(/^\d{10,}$/);

    const savedPath = await procedure.downloadAndSaveAcuse(data.procedureCode);
    expect(savedPath).toMatch(/120101\.pdf$/i);
  });

});
