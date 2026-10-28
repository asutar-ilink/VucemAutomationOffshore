/**
 * REQ_02 §6.2.3 — Paso 1 "Datos del establecimiento": the "Seleccionar establecimiento"
 * button is removed and every establishment field is captured manually.
 * Manual cases TC_016–TC_019 and TC_125 (TC_020/TC_021 need subsequent procedures /
 * BackOffice tasks, TC_124 needs the Bandeja round-trip — not automated here).
 *
 * Reaches the form through 260210 (shared COFEPRIS Paso-1 flow). Other forms are added
 * by pointing at their procedure class once it can reach Paso 1.
 */

import { test, expect } from '../../src/fixtures';
import { T260210, T260210Data } from '../../src/procedures/cofepris/T260210';
import { EstablecimientoSection } from '../../src/components/layout/EstablecimientoSection';
import { Tab } from '../../src/components/layout/Tab';
import { Logger } from '../../src/utils/Logger';
import rawData from '../../test-data/procedures/260210.json';

// The shared 260210 data uses an Aduana that QA's catalogue no longer offers; override locally.
const data = { ...(rawData as T260210Data), aduana: 'ALTAMIRA' } as T260210Data;
const est = data.establecimiento;

const values = {
  rfcSanitario: est.rfcResponsable,
  denominacionRazon: est.denominacion,
  correoElectronico: est.correo,
  codigoPostal: est.codigoPostal,
  estado: est.estado,
  municipioAlcaldia: est.municipio,
  calle: est.calle,
  telefono: est.telefono,
};

test.describe('6.2.3 — Datos del establecimiento, captura manual (260210)', () => {

  test.beforeEach(async ({ authenticatedPage }) => {
    await new T260210(authenticatedPage).startNewSubmission();
  });

  test('260210: establishment button hidden, fields editable, validations apply', async ({ authenticatedPage: page }) => {
    const procedure = new T260210(page);
    const section = new EstablecimientoSection(page);

    await procedure.open(data.procedureCode);
    await new Tab(page).click('Datos de la solicitud');
    await expect(section.heading).toBeVisible({ timeout: 30_000 });

    await Logger.step('TC_016 CA01 — "Seleccionar establecimiento" is not shown', async () => {
      await expect(section.seleccionarButton).toHaveCount(0);
    });

    await Logger.step('TC_017 CA02 — all fields enabled and fillable manually', async () => {
      await section.expectAllEnabled();
      await section.fill(values);
      const actual = await section.values();
      expect.soft(actual.denominacionRazon).toBe(values.denominacionRazon);
      expect.soft(actual.correoElectronico).toBe(values.correoElectronico);
      expect.soft(actual.codigoPostal).toBe(values.codigoPostal);
      expect.soft(actual.municipioAlcaldia).toBe(values.municipioAlcaldia);
      expect.soft(actual.calle).toBe(values.calle);
      expect.soft(actual.telefono).toBe(values.telefono);
      expect.soft(actual.estado).toBe(values.estado);
    });

    await Logger.step('TC_018 CA03 — no search / connection error is shown', async () => {
      await expect(section.searchOrConnectionError).toHaveCount(0);
      await expect(page.getByRole('dialog')).toHaveCount(0);
    });

    await Logger.step('TC_019 Regla 2 — existing validations apply to manual capture', async () => {
      await section.control('denominacionRazon').fill('');
      await section.control('correoElectronico').fill('correo-invalido');
      await section.control('telefono').fill('abc!@#');
      await page.getByRole('button', { name: /^\s*continuar\s*$/i }).first().click();
      await expect(page.getByText(/faltan campos por capturar/i).first()).toBeVisible();
      await expect(page.getByText(/este campo es obligatorio/i).first()).toBeVisible();
      // The user cannot continue: Paso 2 content is not shown.
      await expect(page.getByRole('heading', { name: /requisitos obligatorios/i })).toHaveCount(0);
    });
  });

  test('260210: establishment data is kept after Continuar and Anterior (TC_125)', async ({ authenticatedPage: page }) => {
    const procedure = new T260210(page);
    const section = new EstablecimientoSection(page);

    await procedure.open(data.procedureCode);
    await procedure.fillDatosSolicitud(data);
    await procedure.fillTerceros(data);
    await procedure.skipPagoAndContinue();

    await Logger.step('Anterior returns to Paso 1 with the establishment data intact', async () => {
      await page.getByRole('button', { name: /^\s*anterior\s*$/i }).click();
      await new Tab(page).click('Datos de la solicitud');
      await expect(section.heading).toBeVisible({ timeout: 30_000 });
      const actual = await section.values();
      expect.soft(actual.denominacionRazon).toBe(values.denominacionRazon);
      expect.soft(actual.correoElectronico).toBe(values.correoElectronico);
      expect.soft(actual.codigoPostal).toBe(values.codigoPostal);
      expect.soft(actual.municipioAlcaldia).toBe(values.municipioAlcaldia);
      expect.soft(actual.calle).toBe(values.calle);
      expect.soft(actual.telefono).toBe(values.telefono);
      expect.soft(actual.estado).toBe(values.estado);
    });
  });

});
