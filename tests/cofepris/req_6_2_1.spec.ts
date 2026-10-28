/**
 * REQ_02 §6.2.1 — Paso 2 subsection "Requisitos Opcionales" renamed to
 * "Documentación complementaria", with new instructions; only "Otro" attachable,
 * and optional. Manual cases TC_001–TC_006 (TC_004 submit-without-Otro is covered
 * by the 260210 registration journey, which submits with the optional document
 * omitted only when data.optionalDocument is dropped — not repeated here).
 *
 * Reaches Paso 2 through the 260210 journey (shared COFEPRIS Paso-1 flow), then
 * asserts the subsection. Other forms are added by pointing REQ_FORMS at their
 * procedure class once it can reach Paso 2.
 */

import { test, expect } from '../../src/fixtures';
import { T260210, T260210Data } from '../../src/procedures/cofepris/T260210';
import { DocumentacionComplementaria } from '../../src/components/layout/DocumentacionComplementaria';
import { Logger } from '../../src/utils/Logger';
import rawData from '../../test-data/procedures/260210.json';

// The shared 260210 data uses an Aduana that QA's catalogue no longer offers; override locally.
const data = { ...(rawData as T260210Data), aduana: 'ALTAMIRA' } as T260210Data;

const INSTRUCTIONS = [
  'Este apartado tiene carácter opcional y está destinado a la incorporación de documentación complementaria. Úselo si desea aportar información adicional que respalde los datos capturados y otorgue mayor solidez a su solicitud.',
  'En caso de que no requiera algún documento previamente cargado, selecciónelo y elimínelo.',
  'Si necesita añadir más de un documento del mismo tipo, selecciónelo de la lista y presione el botón “Agregar nuevo”.',
];
const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();

test.describe('6.2.1 — Documentación complementaria (260210)', () => {

  test.beforeEach(async ({ authenticatedPage }) => {
    await new T260210(authenticatedPage).startNewSubmission();
  });

  test('260210: Paso 2 shows the renamed subsection, new instructions and only "Otro"', async ({ authenticatedPage }) => {
    const procedure = new T260210(authenticatedPage);
    const docs = new DocumentacionComplementaria(authenticatedPage);

    await procedure.open(data.procedureCode);
    await procedure.fillDatosSolicitud(data);
    await procedure.fillTerceros(data);
    await procedure.skipPagoAndContinue();

    await Logger.step('TC_001 CA01 — subsection renamed', async () => {
      await expect(docs.title).toBeVisible({ timeout: 45_000 });
      // Exact casing per the requirement ("Documentación complementaria").
      expect.soft(norm(await docs.title.innerText())).toBe(DocumentacionComplementaria.TITLE);
      await expect(docs.oldTitle).toHaveCount(0);
    });

    await Logger.step('TC_002 CA02 — new instructions shown', async () => {
      const text = await docs.text();
      for (const bullet of INSTRUCTIONS) expect.soft(text, `missing instruction: ${bullet.slice(0, 40)}…`).toContain(norm(bullet));
    });

    await Logger.step('TC_003 CA03 — only "Otro" can be attached', async () => {
      expect.soft(await docs.documentTypeOptions()).toEqual(['Otro']);
    });

    await Logger.step('TC_005 CA04 — several files under "Otro"', async () => {
      const baseline = await docs.fileInputCount();
      await docs.selectType('Otro');
      await docs.add();
      await docs.attachToLastRow(data.optionalDocument.path);
      await docs.selectType('Otro');
      await docs.add();
      await docs.attachToLastRow(data.optionalDocument.path);
      await docs.expectFileInputCount(baseline + 2);
    });
  });

});
