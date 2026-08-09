/**
 * 260102 — Permiso sanitario de importación de productos de muestra o consumo
 * personal (COFEPRIS). Happy-path journey (manual TC 17891–18190).
 *
 * A four-tab procedure whose Pago de derechos is skipped ("no requiere pago" →
 * Sí). Login runs inside the authenticatedPage fixture. The Datos tab is the
 * consumo-personal shape (CofeprisRegistrationFlow.fillDatosSolicitudConsumoPersonal
 * with aviso + AICM and the Marca-based Mercancía modal); Terceros = Fabricante
 * (foreign) + Destinatario (national); Paso 2 takes two mandatory documents, then
 * Paso 3 firmar → Acuse + folio.
 */

import { test, expect } from '../../src/fixtures';
import { T260102, T260102Data } from '../../src/procedures/cofepris/T260102';
import rawData from '../../test-data/procedures/260102.json';

const data = rawData as T260102Data;

test.describe('260102 — Permiso sanitario de importación de productos de muestra o consumo personal', () => {

  test.beforeEach(async ({ authenticatedPage }) => {
    await new T260102(authenticatedPage).startNewSubmission();
  });

  // BLOCKED BY A PRODUCT BUG (documented, not a test defect). The automation fills
  // the entire Paso 1 (establecimiento, S.C.I.A.N., aviso+licencia, aduana+AICM,
  // the Mercancía modal incl. its required lote sub-form, both terceros) and
  // reaches the Paso-1 → Paso-2 submission, where `solicitud/guardar` rejects it:
  //   errores_modelo: [{ campo: "rfc", errores:
  //     ["La longitud del RFC debe ser entre 12 y 13 carácteres"] }]
  // The offending field is the APPLICANT's own RFC: the payload carries
  // `solicitante.rfc: ""` even though the Solicitante tab shows AAL0409235E6
  // (prefilled from e.firma and DISABLED — there is no editable field to set it).
  // The medicamentos-family backends validate this field strictly (precursores/
  // tóxicas/plaguicidas do not, which is why 260603/260512/260501 pass); it is the
  // same defect already documented for 260204 / 260202 / 260205. Re-enable (drop
  // `.fixme`) once the front-end serialises the prefilled applicant RFC.
  test('260102: registration: fills Datos + Terceros, skips Pago, uploads documents, signs, generates a folio', async ({ authenticatedPage, efirma }) => {
    const procedure = new T260102(authenticatedPage);

    await procedure.open(data.procedureCode);
    await expect(procedure.procedureTitle).toBeVisible();
    await procedure.expectTabsPresent(data.tabs);
    await procedure.verifySolicitante(data.solicitante);

    await procedure.fillDatosSolicitud(data);
    await procedure.verifyRepresentanteAutofill(data.representanteLegal);

    await procedure.fillTerceros(data);

    await procedure.skipPago();
    await procedure.uploadDocuments(data.documents);
    await procedure.sign(efirma);

    await expect(procedure.folioMessage).toBeVisible();
    await expect(procedure.acuseDocument).toBeVisible();

    const folio = await procedure.captureFolio(data.procedureCode);
    expect(folio).toMatch(/^\d{10,}$/);

    const savedPath = await procedure.downloadAndSaveAcuse(data.procedureCode);
    expect(savedPath).toMatch(/260102\.pdf$/i);
  });

});
