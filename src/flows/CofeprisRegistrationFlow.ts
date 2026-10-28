import { Page, Locator, expect } from '@playwright/test';
import { TextField } from '../components/form/TextField';
import { Dropdown } from '../components/form/Dropdown';
import { Checkbox } from '../components/form/Checkbox';
import { RadioButton } from '../components/form/RadioButton';
import { CrossList } from '../components/form/CrossList';
import { Tab } from '../components/layout/Tab';
import { DynamicTable } from '../components/layout/DynamicTable';
import { Logger } from '../utils/Logger';
import {
  CofeprisRegistrationData,
  MateriasPrimasSolicitudData,
  PlaguicidasSolicitudData,
  PlaguicidaMercanciaData,
  ToxicasSolicitudData,
  ToxicasMercanciaData,
  ConsumoPersonalSolicitudData,
  ConsumoPersonalMercanciaData,
  SolicitanteData,
  EstablecimientoData,
  MercanciaData,
  RepresentanteLegalData,
  TerceroData,
  PagoData,
} from '../types/cofepris';

/**
 * CofeprisRegistrationFlow — the Paso-1 registration steps shared by the
 * COFEPRIS "permiso sanitario de importación de medicamentos" procedures
 * (260204, 260210, …).
 *
 * These procedures render the *same* Datos de la solicitud tab (establecimiento
 * capture, S.C.I.A.N. modal, licencia/régimen/aduana, Mercancía modal,
 * manifiestos, hacer-públicos radio, representante legal) and the *same*
 * cascading Terceros modals. All of that behaviour lives here, driven by data;
 * procedures compose these methods and add only what is genuinely unique to them
 * (which terceros to add, whether pago is filled or skipped, the Paso-2 upload
 * style, and their own assertions).
 *
 * Static methods, like the other flows — the call site stays clean:
 *   await CofeprisRegistrationFlow.fillDatosSolicitud(page, data)
 *
 * Controls are located by formControlName / catalogo-select name because ids
 * repeat across sections and add-record modals are pre-rendered hidden (see the
 * vucem-framework skill's COFEPRIS DOM→component mapping).
 */
export class CofeprisRegistrationFlow {

  // ─── Solicitante tab (prefilled, read-only) ───────────────────────────────

  /**
   * Verifies the prefilled, disabled Solicitante fields. Asserts only the fields
   * present in `data`, so a procedure that verifies just the core five behaves as
   * before while one whose manual lists the whole domicilio (e.g. 260215) asserts
   * every field. All Solicitante inputs carry a plain id and no formcontrolname
   * (the establecimiento copies add one), so each is scoped with
   * `:not([formcontrolname])` to beat the duplicate establecimiento field.
   */
  static async verifySolicitante(page: Page, d: SolicitanteData): Promise<void> {
    await Logger.step('Verify Solicitante prefilled details', async () => {
      const fields: [string, string | undefined][] = [
        ['rfc', d.rfc], ['razonSocial', d.razonSocial], ['correo', d.correo],
        ['pais', d.pais], ['codigoPostal', d.codigoPostal], ['estado', d.estado],
        ['municipio', d.municipio], ['localidad', d.localidad], ['colonia', d.colonia],
        ['calle', d.calle], ['numeroExterior', d.numeroExterior],
        ['lada', d.lada], ['telefono', d.telefono],
      ];
      for (const [id, value] of fields) {
        if (value !== undefined) {
          await expect(page.locator(`#${id}:not([formcontrolname])`)).toHaveValue(value);
        }
      }
    });
  }

  // ─── Datos de la solicitud tab ────────────────────────────────────────────

  /**
   * The Datos de la solicitud tab. The Mercancía modal differs between the
   * medicamentos siblings (260204/260210) and the materias-primas sibling
   * (260203), so the caller may pass the matching mercancía handler; it defaults
   * to the medicamentos modal.
   */
  static async fillDatosSolicitud(
    page: Page,
    data: CofeprisRegistrationData,
    addMercancia: (page: Page, m: MercanciaData) => Promise<void> = CofeprisRegistrationFlow.addMercanciaMedicamentos,
  ): Promise<void> {
    await new Tab(page).click('Datos de la solicitud');
    await CofeprisRegistrationFlow.openEstablecimiento(page);
    await CofeprisRegistrationFlow.fillEstablecimiento(page, data.establecimiento);
    await CofeprisRegistrationFlow.addScian(page, data.scian);
    await CofeprisRegistrationFlow.fillLicenciaRegimenAduana(page, data);
    await addMercancia(page, data.mercancia);
    await CofeprisRegistrationFlow.acceptManifiestos(page);
    await CofeprisRegistrationFlow.setDatosPublicos(page, data.datosPublicos);
    await CofeprisRegistrationFlow.fillRepresentanteLegal(page, data.representanteLegal);
  }

  /**
   * The Datos de la solicitud tab for the 260202 "materias primas" trámite.
   * Same shared building blocks as fillDatosSolicitud, but the sequence diverges:
   * several S.C.I.A.N. claves (one deleted), an "Aviso de funcionamiento"
   * checkbox instead of a licencia value, the AIFA→AICM checkbox, and several
   * Mercancía records (one deleted). The Mercancía modal is the medicamentos
   * shape, so it defaults to addMercanciaMedicamentos.
   */
  static async fillDatosSolicitudMateriasPrimas(
    page: Page,
    data: MateriasPrimasSolicitudData,
    addMercancia: (page: Page, m: MercanciaData) => Promise<void> = CofeprisRegistrationFlow.addMercanciaMedicamentos,
  ): Promise<void> {
    await new Tab(page).click('Datos de la solicitud');
    await CofeprisRegistrationFlow.openEstablecimiento(page);
    await CofeprisRegistrationFlow.fillEstablecimiento(page, data.establecimiento);

    await CofeprisRegistrationFlow.addScianRecords(page, data.scians);
    if (data.deleteScianClave) {
      await CofeprisRegistrationFlow.deleteScian(page, data.deleteScianClave);
    }

    if (data.avisoFuncionamiento) {
      await CofeprisRegistrationFlow.selectAvisoFuncionamiento(page);
    }
    await CofeprisRegistrationFlow.fillRegimenAduanaMateriasPrimas(page, data);

    await CofeprisRegistrationFlow.addMercancias(page, data.mercancias, addMercancia);
    if (data.deleteMercanciaIndex !== undefined) {
      const target = data.mercancias[data.deleteMercanciaIndex];
      await CofeprisRegistrationFlow.deleteMercancia(page, target.denominacionEspecifica);
    }

    await CofeprisRegistrationFlow.acceptManifiestos(page);
    await CofeprisRegistrationFlow.setDatosPublicos(page, data.datosPublicos);
    await CofeprisRegistrationFlow.fillRepresentanteLegal(page, data.representanteLegal);
  }

  /** Adds each S.C.I.A.N. clave via the "Clave S.C.I.A.N." modal. */
  private static async addScianRecords(page: Page, scians: { clave: string }[]): Promise<void> {
    for (const s of scians) {
      await Logger.step(`Add S.C.I.A.N. ${s.clave}`, async () => {
        await page.locator('button[name="agregarScian"]').click();
        // Modal select is <app-catalogo-select name="clave"> whose option text is
        // the clave itself; descripción autofills.
        await new Dropdown(page, 'clave', 'control').select(s.clave);
        await CofeprisRegistrationFlow.dialogButton(page, /^\s*agregar\s*$/i).click();
        await new DynamicTable(page, 'S.C.I.A.N.').expectRowExists(s.clave);
      });
    }
  }

  /** Marks the S.C.I.A.N. row and deletes it (Eliminar → confirm Aceptar). */
  private static async deleteScian(page: Page, clave: string): Promise<void> {
    await Logger.step(`Delete S.C.I.A.N. ${clave}`, async () => {
      const table = new DynamicTable(page, 'S.C.I.A.N.');
      await table.selectRowByText(clave);
      await page.locator('button[name="eliminarScian"]').click();
      await CofeprisRegistrationFlow.resolveDeleteDialog(page, 'accept');
      await table.expectRowAbsent(clave);
    });
  }

  /**
   * Ticks "Aviso de funcionamiento", which disables the No. de licencia
   * sanitaria field (the two are mutually exclusive on the materias-primas form).
   */
  private static async selectAvisoFuncionamiento(page: Page): Promise<void> {
    await Logger.step('Select Aviso de funcionamiento (disables licencia sanitaria)', async () => {
      await new Checkbox(page, 'aviso', 'control').check();
      await expect(page.locator('[formcontrolname="licenciaSanitaria"]:visible')).toBeDisabled();
    });
  }

  /** Régimen, Aduana, and (when the AIFA aduana is chosen) the AICM checkbox. */
  private static async fillRegimenAduanaMateriasPrimas(page: Page, data: MateriasPrimasSolicitudData): Promise<void> {
    await Logger.step('Fill régimen, aduana (+AICM)', async () => {
      await new Dropdown(page, 'regimen', 'control').select(data.regimen);
      await new Dropdown(page, 'adunasDeEntradas', 'control').select(data.aduana);
      if (data.aduanaAicm) {
        // Selecting the AIFA aduana reveals the "Aeropuerto Internacional Ciudad
        // de México (AICM)" checkbox (formcontrolname="aeropuerto").
        await new Checkbox(page, 'aeropuerto', 'control').check();
      }
    });
  }

  /** Adds each Mercancía record via the given modal handler. */
  private static async addMercancias(
    page: Page,
    mercancias: MercanciaData[],
    addMercancia: (page: Page, m: MercanciaData) => Promise<void>,
  ): Promise<void> {
    for (const m of mercancias) {
      await addMercancia(page, m);
    }
  }

  /**
   * Deletes a Mercancía row, exercising both confirmation paths (manual TC16):
   * first Eliminar → Cancelar (the row must remain), then Eliminar → Aceptar
   * (the row is removed).
   */
  private static async deleteMercancia(page: Page, denominacionEspecifica: string): Promise<void> {
    await Logger.step(`Delete Mercancía ${denominacionEspecifica} (cancel, then confirm)`, async () => {
      const table = new DynamicTable(page, 'Mercancías');
      // Cancel path — the row stays.
      await table.selectRowByText(denominacionEspecifica);
      await page.locator('button[name="eliminarMercancias"]').click();
      await CofeprisRegistrationFlow.resolveDeleteDialog(page, 'cancel');
      await table.expectRowExists(denominacionEspecifica);
      // Confirm path — the row is deleted.
      await table.selectRowByText(denominacionEspecifica);
      await page.locator('button[name="eliminarMercancias"]').click();
      await CofeprisRegistrationFlow.resolveDeleteDialog(page, 'accept');
      await table.expectRowAbsent(denominacionEspecifica);
    });
  }

  /**
   * Resolves the shared COFEPRIS delete-confirmation dialog ("¿Estás seguro que
   * deseas eliminar los registros marcados?"). Like the add-record modals it is a
   * `.modal-content` with no accessible name, so it is scoped by its body text.
   */
  private static async resolveDeleteDialog(page: Page, action: 'accept' | 'cancel'): Promise<void> {
    const dialog = page.locator('.modal-content')
      .filter({ hasText: /eliminar los registros marcados/i });
    await expect(dialog).toBeVisible();
    const button = action === 'accept' ? /^\s*aceptar\s*$/i : /^\s*cancelar\s*$/i;
    await dialog.getByRole('button', { name: button }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
  }

  /**
   * Returns the Agregar/confirm button inside the currently-open modal.
   * The COFEPRIS add-record modals (S.C.I.A.N., Mercancía, Terceros) are
   * Bootstrap `.modal-content` dialogs with no reliable accessible name, so the
   * generic Modal component can't target them by title — scope to the visible
   * dialog instead.
   */
  private static dialogButton(page: Page, name: RegExp): Locator {
    return page.locator('.modal-content').locator('visible=true').last()
      .getByRole('button', { name });
  }

  /**
   * "Seleccionar establecimiento". In QA there is no live COFEPRIS link, so an
   * info modal ("…favor de capturar su establecimiento") appears with a single
   * Aceptar; dismissing it enables the establecimiento fields for manual capture.
   */
  private static async openEstablecimiento(page: Page): Promise<void> {
    await Logger.step('Open establecimiento (dismiss COFEPRIS-comms info modal)', async () => {
      // Newer QA builds render the establecimiento fields directly (no
      // "Seleccionar establecimiento" button / info modal), so only dismiss when present.
      const seleccionar = page.getByRole('button', { name: /seleccionar establecimiento/i });
      if (await seleccionar.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await seleccionar.click();
        await page.getByRole('button', { name: /^\s*aceptar\s*$/i }).click();
      }
    });
  }

  private static async fillEstablecimiento(page: Page, d: EstablecimientoData): Promise<void> {
    await Logger.step('Fill Datos del establecimiento', async () => {
      // Fields share ids with the Solicitante section, so target by unique
      // formControlName (see TextField 'control' strategy).
      // rfcSanitario is absent on some establecimiento forms (e.g. 260604), so
      // fill it only when present.
      if (await page.locator('[formcontrolname="rfcSanitario"]:visible').count()) {
        await new TextField(page, 'rfcSanitario', 'control').fill(d.rfcResponsable);
      }
      await new TextField(page, 'denominacionRazon', 'control').fill(d.denominacion);
      await new TextField(page, 'correoElectronico', 'control').fill(d.correo);
      await new TextField(page, 'codigoPostal', 'control').fill(d.codigoPostal);
      await new Dropdown(page, 'estado', 'control').select(d.estado);
      await new TextField(page, 'municipioAlcaldia', 'control').fill(d.municipio);
      // Localidad / Colonia are extra free-text fields on the materias-primas
      // establecimiento form (260202); absent on the medicamentos siblings, so
      // fill them only when supplied.
      if (d.localidad) {
        await new TextField(page, 'localidad', 'control').fill(d.localidad);
      }
      if (d.colonia) {
        await new TextField(page, 'colonia', 'control').fill(d.colonia);
      }
      await new TextField(page, 'calle', 'control').fill(d.calle);
      // Lada likewise exists only on the materias-primas form (it precedes Teléfono).
      if (d.lada) {
        await new TextField(page, 'lada', 'control').fill(d.lada);
      }
      await new TextField(page, 'telefono', 'control').fill(d.telefono);
    });
  }

  /** Add a row to the S.C.I.A.N. table via its modal. */
  private static async addScian(page: Page, scian: { clave: string; descripcion: string }): Promise<void> {
    await Logger.step(`Add S.C.I.A.N. ${scian.clave}`, async () => {
      await page.locator('button[name="agregarScian"]').click();
      // Modal select is <app-catalogo-select name="clave">; descripción autofills.
      await new Dropdown(page, 'clave', 'control').select(scian.clave);
      await CofeprisRegistrationFlow.dialogButton(page, /^\s*agregar\s*$/i).click();
      await new DynamicTable(page, 'S.C.I.A.N.').expectRowExists(scian.clave);
    });
  }

  /** Licencia sanitaria (disables Aviso), Régimen, Aduanas. */
  private static async fillLicenciaRegimenAduana(page: Page, data: CofeprisRegistrationData): Promise<void> {
    await Logger.step('Fill licencia sanitaria, régimen, aduana', async () => {
      await new TextField(page, 'licenciaSanitaria', 'control').fill(data.licenciaSanitaria);
      // On some procedures (e.g. the aviso-exportación 260604) Régimen is rendered
      // read-only/disabled (fixed by the trámite), so select it only when editable.
      const regimen = page.locator('app-catalogo-select[name="regimen"] select:visible');
      if (await regimen.count() && !(await regimen.first().isDisabled())) {
        await new Dropdown(page, 'regimen', 'control').select(data.regimen);
      }
      await new Dropdown(page, 'adunasDeEntradas', 'control').select(data.aduana);
    });
  }

  /** Add a row to the Mercancías table via its modal (medicamentos siblings). */
  static async addMercanciaMedicamentos(page: Page, m: MercanciaData): Promise<void> {
    await Logger.step('Add Mercancía record', async () => {
      // name="agregarMercancias" is reused across the app (even "Borrar datos
      // del pago"), so scope to the visible button whose text is "Agregar".
      await page.locator('button[name="agregarMercancias"]')
        .filter({ hasText: /agregar/i }).locator('visible=true').first().click();

      // Cascading dropdowns: clasificación must be picked before especificar.
      await new Dropdown(page, 'clasificacionProducto', 'control').select(m.clasificacionProducto);
      await new Dropdown(page, 'especificarClasificacionProducto', 'control').select(m.especificarClasificacion);
      await new TextField(page, 'denominacionEspecificaProducto', 'control').fill(m.denominacionEspecifica);
      await new TextField(page, 'denominacionDistintiva', 'control').fill(m.denominacionDistintiva);
      await new TextField(page, 'denominacionComun', 'control').fill(m.denominacionComun);
      await new Dropdown(page, 'tipoProducto', 'control').select(m.tipoProducto);
      // formaFarmaceutica is present on the medicamentos modals but absent on the
      // dispositivos-médicos maquila modal (260212) — fill only when present.
      const formaSelect = page.locator(
        'app-catalogo-select[name="formaFarmaceutica"] select:visible, app-catalogo-select[formcontrolname="formaFarmaceutica"] select:visible');
      if (await formaSelect.count()) {
        await new Dropdown(page, 'formaFarmaceutica', 'control').select(m.formaFarmaceutica);
      }
      await new Dropdown(page, 'estadoFisico', 'control').select(m.estadoFisico);
      // fraccionArancelaria is a text input; descripcionFraccion auto-fills from
      // it (and is disabled), so it is not typed.
      await new TextField(page, 'fraccionArancelaria', 'control').fill(m.fraccionArancelaria);
      await new TextField(page, 'cantidadUmtValor', 'control').fill(m.cantidadUmt);
      // cantidadUmt (the UMT unit) is disabled/auto-derived — not set here.
      await new TextField(page, 'cantidadUmcValor', 'control').fill(m.cantidadUmc);
      await new Dropdown(page, 'cantidadUmc', 'control').select(m.umc);
      await new TextField(page, 'presentacion', 'control').fill(m.presentacion);
      // numeroRegistroSanitario is likewise absent on the maquila modal (260212).
      if (await page.locator('[formcontrolname="numeroRegistroSanitario"]:visible').count()) {
        await new TextField(page, 'numeroRegistroSanitario', 'control').fill(m.numeroRegistroSanitario);
      }

      // País de origen / procedencia and Uso específico are <crosslist> dual-list
      // widgets in collapsible panels; move each value from available → selected.
      await new CrossList(page, 'País de origen', '#mercanciaModal').add(m.paisOrigen);
      await new CrossList(page, 'País de procedencia', '#mercanciaModal').add(m.paisProcedencia);
      await new CrossList(page, 'Uso específico', '#mercanciaModal').add(m.usoEspecifico);

      // Commit: scope the Agregar to the mercancía modal precisely (the button
      // name is reused elsewhere) and wait for the modal to close.
      const modal = page.locator('#mercanciaModal');
      await modal.getByRole('button', { name: /^\s*agregar\s*$/i }).click();
      await expect(modal).toBeHidden({ timeout: 15_000 });
      await new DynamicTable(page, 'Mercancías').expectRowExists(m.denominacionEspecifica);
    });
  }

  /**
   * Mercancía modal for the *materias primas* sibling (260203). Same main fields
   * as medicamentos except it has NO Denominación distintiva / Forma farmacéutica
   * / Presentación / Número de registro as main fields; instead those live in a
   * "detalle" sub-form (Forma farmacéutica, Número de registro, Marcas
   * distintivas, Presentación) committed with "Agregar detalle" before the
   * mercancía's own "Agregar".
   */
  static async addMercanciaMateriasPrimas(page: Page, m: MercanciaData): Promise<void> {
    await Logger.step('Add Mercancía record (materias primas)', async () => {
      await page.locator('button[name="agregarMercancias"]')
        .filter({ hasText: /agregar/i }).locator('visible=true').first().click();

      await new Dropdown(page, 'clasificacionProducto', 'control').select(m.clasificacionProducto);
      await new Dropdown(page, 'especificarClasificacionProducto', 'control').select(m.especificarClasificacion);
      await new TextField(page, 'denominacionEspecificaProducto', 'control').fill(m.denominacionEspecifica);
      await new TextField(page, 'denominacionComun', 'control').fill(m.denominacionComun);
      await new Dropdown(page, 'tipoProducto', 'control').select(m.tipoProducto);
      await new Dropdown(page, 'estadoFisico', 'control').select(m.estadoFisico);
      // fraccionArancelaria is a text input; descripcionFraccion auto-fills (disabled).
      await new TextField(page, 'fraccionArancelaria', 'control').fill(m.fraccionArancelaria);
      await new TextField(page, 'cantidadUmtValor', 'control').fill(m.cantidadUmt);
      await new TextField(page, 'cantidadUmcValor', 'control').fill(m.cantidadUmc);
      await new Dropdown(page, 'cantidadUmc', 'control').select(m.umc);

      // Origen / procedencia / uso — the same crosslist widgets as medicamentos.
      await new CrossList(page, 'País de origen', '#mercanciaModal').add(m.paisOrigen);
      await new CrossList(page, 'País de procedencia', '#mercanciaModal').add(m.paisProcedencia);
      await new CrossList(page, 'Uso específico', '#mercanciaModal').add(m.usoEspecifico);

      const modal = page.locator('#mercanciaModal');
      // Detalle sub-form (the app misspells the forma wrapper "formaFormaceutica").
      await new Dropdown(page, 'formaFormaceutica', 'control').select(m.formaFarmaceutica);
      await new TextField(page, 'numeroDeRegistro', 'control').fill(m.numeroRegistroSanitario);
      await new TextField(page, 'marcasDistintivas', 'control').fill(m.marcasDistintivas ?? m.denominacionDistintiva);
      await new TextField(page, 'tipoDeEnvase', 'control').fill(m.presentacion);
      await modal.getByRole('button', { name: /^\s*agregar detalle\s*$/i }).click();

      // Commit the mercancía (exact "Agregar" — not "Agregar detalle").
      await modal.getByRole('button', { name: /^\s*agregar\s*$/i }).click();
      await expect(modal).toBeHidden({ timeout: 15_000 });
      await new DynamicTable(page, 'Mercancías').expectRowExists(m.denominacionEspecifica);
    });
  }

  /**
   * Mercancía modal for the *precursores químicos* trámite (260604). A distinct
   * "Datos del producto" shape: marca comercial / DCI instead of the medicamentos
   * denominaciones, a Porcentaje de concentración, a Valor comercial, a "Fecha de
   * movimiento" calendar, and País de origen/destino/procedencia as plain
   * dropdowns (not crosslists). No Uso específico or Número de registro.
   */
  /**
   * A small fixed pause for the precursores Mercancía modal only. Its País
   * auto-derive and Uso dual-list update the DOM BEFORE Angular's reactive-form
   * model, and expose no observable completion signal — polling the DOM passes
   * while the model is still empty, so the commit sees an invalid form. Used
   * sparingly and only here (not a substitute for real waits elsewhere).
   */
  private static settle(ms: number): Promise<void> {
    return new Promise(resolve => { setTimeout(resolve, ms); });
  }

  /**
   * Sets the precursores Mercancía "Clasificación del producto" + "Especificar
   * clasificación del producto" pair, which is an order-sensitive async cascade:
   * selecting Clasificación loads Especificar's dependent catalog and then
   * **self-resets Clasificación to "" ~1s later**. So the reliable order is
   * select Clasificación (to populate the Especificar catalog) → select
   * Especificar → **re-select Clasificación last**; once Especificar holds a
   * value, Clasificación sticks. Polls, re-selecting Clasificación whenever it
   * has dropped, until both fields are non-empty.
   */
  private static async setClasificacionProducto(
    page: Page, clasificacion: string, especificar: string,
  ): Promise<void> {
    const clasifSel = page.locator('app-catalogo-select[name="clasificacionProducto"] select:visible');
    const especSel = page.locator('app-catalogo-select[name="especificarClasificacionProducto"] select:visible');
    await new Dropdown(page, 'clasificacionProducto', 'control').select(clasificacion);
    await new Dropdown(page, 'especificarClasificacionProducto', 'control').select(especificar);
    await expect.poll(async () => {
      if ((await clasifSel.inputValue().catch(() => '')) === '') {
        await new Dropdown(page, 'clasificacionProducto', 'control').select(clasificacion).catch(() => undefined);
      }
      await CofeprisRegistrationFlow.settle(600);
      const c = await clasifSel.inputValue().catch(() => '');
      const e = await especSel.inputValue().catch(() => '');
      return c !== '' && e !== '';
    }, { timeout: 20_000, intervals: [400] }).toBe(true);
  }

  static async addMercanciaPrecursores(page: Page, m: MercanciaData): Promise<void> {
    await Logger.step('Add Mercancía record (precursores químicos)', async () => {
      await page.locator('button[name="agregarMercancias"]')
        .filter({ hasText: /agregar/i }).locator('visible=true').first().click();

      // Clasificación del producto + Especificar clasificación is an order-sensitive
      // cascade — handled in its own helper (see setClasificacionProducto).
      await CofeprisRegistrationFlow.setClasificacionProducto(
        page, m.clasificacionProducto, m.especificarClasificacion,
      );
      await new TextField(page, 'marcaComercialODenominacionDistintiva', 'control')
        .fill(m.marcaComercial ?? m.denominacionDistintiva);
      await new TextField(page, 'denominacionComunInternacional', 'control')
        .fill(m.denominacionGenericaDci ?? m.denominacionComun);
      await new Dropdown(page, 'tipoProducto', 'control').select(m.tipoProducto);
      await new Dropdown(page, 'estadoFisico', 'control').select(m.estadoFisico);
      // fraccionArancelaria is a text input; descripcionFraccion auto-fills (disabled).
      await new TextField(page, 'fraccionArancelaria', 'control').fill(m.fraccionArancelaria);
      await new TextField(page, 'cantidadUmcValor', 'control').fill(m.cantidadUmc);
      await new Dropdown(page, 'cantidadUmc', 'control').select(m.umc);
      await new TextField(page, 'PorcentajeDeConcentracion', 'control').fill(m.porcentajeConcentracion ?? '');
      await new TextField(page, 'valorComercial', 'control').fill(m.valorComercial ?? '');
      await new TextField(page, 'presentacion', 'control').fill(m.presentacion);
      if (m.fechaMovimiento) {
        await CofeprisRegistrationFlow.setFechaByLabel(page, 'Fecha de movimiento', m.fechaMovimiento);
      }

      const modal = page.locator('#mercanciaModal');

      // País de origen / destino / procedencia are single-select dropdowns here
      // (not crosslists). País de procedencia is auto-derived and rendered
      // disabled, so each is set only when present and editable.
      const selectPais = async (name: string, value: string): Promise<void> => {
        const sel = page.locator(`app-catalogo-select[name="${name}"] select:visible`);
        if (await sel.count() && !(await sel.first().isDisabled())) {
          await new Dropdown(page, name, 'control').select(value);
        }
      };
      await selectPais('paisDeOrigen', m.paisOrigen);
      await selectPais('paisDestino', m.paisDestino ?? m.paisProcedencia);
      await selectPais('paisProcedencia', m.paisProcedencia);

      // País de procedencia is auto-derived from país de destino and rendered
      // DISABLED + required. The derivation is async and racy — a fixed pause
      // sometimes leaves it empty, which fails the (misleading) uso/commit step
      // later. Wait for it to populate; if it hasn't derived, re-select país de
      // destino once to re-trigger it, then wait again.
      const procSel = page.locator('app-catalogo-select[name="paisProcedencia"] select:visible');
      try {
        await expect.poll(async () => procSel.inputValue().catch(() => ''),
          { timeout: 8_000, intervals: [400] }).not.toBe('');
      } catch {
        await new Dropdown(page, 'paisDestino', 'control')
          .select(m.paisDestino ?? m.paisProcedencia).catch(() => undefined);
        await expect.poll(async () => procSel.inputValue().catch(() => ''),
          { timeout: 12_000, intervals: [500] }).not.toBe('');
      }
      // Let the derivation's re-render settle before the uso dual-list (the
      // re-render would otherwise corrupt a just-moved uso value).
      await CofeprisRegistrationFlow.settle(800);

      // Uso específico is a dual-list in a COLLAPSED panel (no <crosslist> wrapper,
      // so CrossList can't drive it). Expand it, select the value in the source
      // <select multiple>, then click its VISIBLE "Agregar selección" (hidden país
      // dual-lists carry the same button label), verifying the value lands.
      if (m.usoEspecifico) {
        // Expand the collapsed panel, then let the crosslist's Angular component
        // initialise BEFORE selecting — otherwise "Agregar selección" moves the
        // option in the DOM but not in the reactive-form model, so the commit stays
        // invalid (the "seleccionado" target keeps value="" / ng-invalid).
        if (!(await modal.locator('select[multiple]:visible').first().count())) {
          await modal.getByText('Uso específico', { exact: true }).first().click();
          await modal.locator('select[multiple]:visible').first().waitFor({ state: 'visible', timeout: 10_000 });
        }
        await CofeprisRegistrationFlow.settle(800);

        const norm = (s: string) =>
          s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
        const source = modal.locator('select[multiple]:visible').first();
        await expect.poll(async () => source.locator('option').count()).toBeGreaterThan(0);
        const options = await source.locator('option').evaluateAll(els =>
          (els as HTMLOptionElement[]).map(e => ({ value: e.value, text: (e.textContent || '').replace(/\s+/g, ' ').trim() })));
        const uso = m.usoEspecifico;
        const match = options.find(o => norm(o.text) === norm(uso)) ?? options.find(o => norm(o.text).includes(norm(uso)));
        if (!match) {
          throw new Error(`No uso específico option ~ "${uso}". Got: ${options.map(o => o.text).slice(0, 8).join(' | ')}`);
        }
        const agregarSel = modal.locator('button').filter({ hasText: /Agregar selección/ }).locator('visible=true').first();
        const commit = modal.getByRole('button', { name: /^\s*agregar\s*$/i });
        // Moving the uso into the "seleccionado" list registers in Angular's model
        // racily, so the commit can no-op. Retry the whole move+commit until the
        // modal actually closes: re-select the value (only while it's still in the
        // source list), settle, then commit.
        let committed = false;
        for (let attempt = 0; attempt < 5 && !committed; attempt++) {
          const stillInSource = await source.locator('option')
            .filter({ hasText: new RegExp(match.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }).count();
          if (stillInSource) {
            await source.selectOption(match.value).catch(() => undefined);
            await agregarSel.click().catch(() => undefined);
          }
          await CofeprisRegistrationFlow.settle(800);
          await commit.click().catch(() => undefined);
          committed = await modal.isHidden().catch(() => false);
          if (!committed) await CofeprisRegistrationFlow.settle(700);
        }
        if (!committed) {
          throw new Error(`Uso específico "${uso}" / Mercancía commit did not register`);
        }
      } else {
        await modal.getByRole('button', { name: /^\s*agregar\s*$/i }).click();
        await expect(modal).toBeHidden({ timeout: 15_000 });
      }
      await new DynamicTable(page, 'Mercancías').expectRowExists(m.marcaComercial ?? m.denominacionDistintiva);
    });
  }

  // ─── Plaguicidas (260501) — Datos de la solicitud ─────────────────────────

  /**
   * Opens an add-record modal identified by its element id (e.g. 'modalAddAgent'
   * for the S.C.I.A.N. modal, 'modalAddAgentMercancias' for the Mercancía modal).
   * The plaguicidas Datos tab shows several unnamed "Agregar" buttons; click each
   * visible one until the wanted modal appears, cancelling any other opened by
   * mistake.
   */
  private static async openAddModalById(page: Page, modalId: string): Promise<Locator> {
    const modal = page.locator(`#${modalId}`);
    if (await modal.isVisible().catch(() => false)) return modal;
    const agregars = page.locator('button')
      .filter({ hasText: /^\s*Agregar\s*$/ }).locator('visible=true');
    const count = await agregars.count();
    for (let i = 0; i < count; i++) {
      await agregars.nth(i).click();
      try {
        await modal.waitFor({ state: 'visible', timeout: 4_000 });
        return modal;
      } catch {
        await page.locator('.modal.show').last()
          .getByRole('button', { name: /cancelar/i }).click().catch(() => undefined);
        await page.locator('.modal.show').last()
          .waitFor({ state: 'hidden', timeout: 4_000 }).catch(() => undefined);
      }
    }
    throw new Error(`Could not open add-record modal #${modalId}`);
  }

  /** The Datos de la solicitud tab for the 260501 "plaguicidas" trámite. */
  static async fillDatosSolicitudPlaguicidas(page: Page, data: PlaguicidasSolicitudData): Promise<void> {
    await new Tab(page).click('Datos de la solicitud');
    await CofeprisRegistrationFlow.openEstablecimiento(page);
    await CofeprisRegistrationFlow.fillEstablecimientoPlaguicidas(page, data.establecimiento);
    await CofeprisRegistrationFlow.addScianPlaguicidas(page, data.scian);
    await Logger.step('Fill No. de licencia sanitaria', async () => {
      await new TextField(page, 'licenciaSanitaria', 'control').fill(data.licenciaSanitaria);
    });
    await CofeprisRegistrationFlow.addAduana(page, data.aduana);
    await CofeprisRegistrationFlow.addMercanciaPlaguicidas(page, data.mercancia);
    await CofeprisRegistrationFlow.acceptManifiestosAndSetDatosPublicos(page, data.datosPublicos);
    await CofeprisRegistrationFlow.fillRepresentanteLegalPlaguicidas(page, data.representanteLegal);
    // The establecimiento Código postal (its async CP-lookup) and the Aduanas
    // de entrada dual-list can silently reset during the later Datos steps, so
    // re-verify and restore them before leaving the tab.
    await CofeprisRegistrationFlow.reverifyCpAndAduana(page, data);
  }

  /** Restore the establecimiento Código postal and Aduana if they got reset. */
  private static async reverifyCpAndAduana(page: Page, data: PlaguicidasSolicitudData): Promise<void> {
    await CofeprisRegistrationFlow.restoreCpAndAduana(
      page, data.establecimiento.codigoPostal, data.aduana);
  }

  /**
   * Re-fills the establecimiento Código postal and re-asserts the Aduana if
   * either got silently reset during the later Datos steps (the CP field's async
   * lookup and the Aduanas dual-list can both drop their value on a re-render).
   * Shared by the plaguicidas (260501) and sustancias-tóxicas (260512) flows.
   */
  private static async restoreCpAndAduana(page: Page, codigoPostal: string, aduana: string): Promise<void> {
    await Logger.step('Re-verify establecimiento CP + aduana persisted', async () => {
      const cp = page.locator('input[formcontrolname="codigoPostal"]:visible').first();
      await expect.poll(async () => {
        if ((await cp.inputValue().catch(() => '')) === codigoPostal) return true;
        await cp.fill(codigoPostal).catch(() => undefined);
        return (await cp.inputValue().catch(() => '')) === codigoPostal;
      }, { timeout: 8_000, intervals: [300, 500] }).toBe(true);

      // Aduana: re-assert it (addAduana returns immediately if already valid,
      // otherwise re-registers the dual-list selection in Angular's model).
      await CofeprisRegistrationFlow.addAduana(page, aduana);
    });
  }

  /**
   * Establecimiento capture for plaguicidas. Field names diverge from the
   * medicamentos siblings: rfcDel / denominacionRazonSocial / muncipio [sic].
   * Localidad / Colonia / Lada are filled only when supplied.
   */
  private static async fillEstablecimientoPlaguicidas(page: Page, d: EstablecimientoData): Promise<void> {
    await Logger.step('Fill Datos del establecimiento (plaguicidas)', async () => {
      await new TextField(page, 'rfcDel', 'control').fill(d.rfcResponsable);
      await new TextField(page, 'denominacionRazonSocial', 'control').fill(d.denominacion);
      await new TextField(page, 'correoElectronico', 'control').fill(d.correo);
      await new TextField(page, 'codigoPostal', 'control').fill(d.codigoPostal);
      await new Dropdown(page, 'estado', 'control').select(d.estado);
      // The app misspells the municipio control "muncipio".
      await new TextField(page, 'muncipio', 'control').fill(d.municipio);
      if (d.localidad) await new TextField(page, 'localidad', 'control').fill(d.localidad);
      if (d.colonia) await new TextField(page, 'colonia', 'control').fill(d.colonia);
      await new TextField(page, 'calle', 'control').fill(d.calle);
      if (d.lada) await new TextField(page, 'lada', 'control').fill(d.lada);
      await new TextField(page, 'telefono', 'control').fill(d.telefono);
    });
  }

  /** Add a S.C.I.A.N. row via the plaguicidas modal (select `claveScianModal`). */
  private static async addScianPlaguicidas(page: Page, scian: { clave: string }): Promise<void> {
    await Logger.step(`Add S.C.I.A.N. ${scian.clave} (plaguicidas)`, async () => {
      const modal = await CofeprisRegistrationFlow.openAddModalById(page, 'modalAddAgent');
      await new Dropdown(page, 'claveScianModal', 'control').select(scian.clave);
      await modal.getByRole('button', { name: /^\s*agregar\s*$/i }).click();
      await new DynamicTable(page, 'S.C.I.A.N.').expectRowExists(scian.clave);
    });
  }

  /**
   * Moves an "Aduana de entrada" into the "seleccionadas" list. It is a
   * `<crosslist>` dual-list on the Datos tab (the only one outside the Mercancía
   * modal), so it is located directly rather than via the CrossList component's
   * panel-heading lookup.
   */
  private static async addAduana(page: Page, value: string): Promise<void> {
    await Logger.step(`Add aduana de entrada ${value}`, async () => {
      const crosslist = page.locator('crosslist').locator('visible=true').first();
      const source = crosslist.locator('select').first();
      const target = crosslist.locator('select').nth(1);
      const norm = (s: string) =>
        s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
      const targetInvalid = async (): Promise<boolean> =>
        target.evaluate((el: HTMLSelectElement) => el.className.includes('ng-invalid')).catch(() => true);
      // The "Agregar selección" button moves the option in the DOM but does not
      // update Angular's model (the target stays ng-invalid). Move it, then select
      // the moved option(s) and fire change on the target so the model registers.
      // Poll until the target list is valid.
      await expect.poll(async () => {
        if (!(await targetInvalid())) return true;
        const options = await source.locator('option').evaluateAll(els =>
          (els as HTMLOptionElement[]).map(e => ({ value: e.value, text: (e.textContent || '').replace(/\s+/g, ' ').trim() })));
        const match = options.find(o => norm(o.text) === norm(value))
          ?? options.find(o => norm(o.text).includes(norm(value)));
        if (match) {
          await source.selectOption(match.value).catch(() => undefined);
          await crosslist.getByRole('button', { name: 'Agregar selección' }).click().catch(() => undefined);
        }
        await target.evaluate((el: HTMLSelectElement) => {
          Array.from(el.options).forEach(o => { o.selected = true; });
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }).catch(() => undefined);
        return !(await targetInvalid());
      }, { timeout: 15_000, intervals: [400, 700, 1_000] }).toBe(true);
    });
  }

  /** Add a Mercancía record via the plaguicidas "Datos mercancía" modal. */
  static async addMercanciaPlaguicidas(page: Page, m: PlaguicidaMercanciaData): Promise<void> {
    await Logger.step('Add Mercancía record (plaguicidas)', async () => {
      const modal = await CofeprisRegistrationFlow.openAddModalById(page, 'modalAddAgentMercancias');

      await new TextField(page, 'nombreComercial', 'control').fill(m.nombreComercial);
      await new TextField(page, 'nombreComun', 'control').fill(m.nombreComun);
      if (m.nombreCientifico) {
        await new TextField(page, 'nombreCientifico', 'control').fill(m.nombreCientifico);
      }
      // Uso específico is a free-text <textarea> here (not a dual-list).
      await modal.locator('textarea[formcontrolname="usoEspecifico"]').fill(m.usoEspecifico);
      // fraccionArancelaria is a text input; descripcionFraccion auto-fills (disabled).
      await new TextField(page, 'fraccionArancelaria', 'control').fill(m.fraccionArancelaria);
      // cantidadUMT value is editable; the UMT unit is disabled/auto-derived.
      await new TextField(page, 'cantidadUMT', 'control').fill(m.cantidadUmt);
      await new TextField(page, 'cantidadUMC', 'control').fill(m.cantidadUmc);
      await new Dropdown(page, 'UMC', 'control').select(m.umc);
      await new TextField(page, 'porcentajeConcentracion', 'control').fill(m.porcentajeConcentracion);
      await new TextField(page, 'numeroRegistro', 'control').fill(m.numeroRegistro);
      await new Dropdown(page, 'clasificacionToxicologica', 'control').select(m.clasificacionToxicologica);
      await new Dropdown(page, 'objetoImportacion', 'control').select(m.objetoImportacion);

      // The four País selectors are <crosslist> dual-lists in collapsible panels.
      // Pre-expand each so its <crosslist> renders, then move the value across via
      // the CrossList component (which skips its own expand click once rendered).
      const paises: [string, string | undefined][] = [
        ['País donde se fabrica el ingrediente activo', m.paisTecnico],
        ['País donde se elabora el producto', m.paisFormulado],
        ['País proveedor', m.paisProveedor],
        ['País de procedencia', m.paisProcedencia],
      ];
      for (const [heading, value] of paises) {
        if (!value) continue;
        const panel = modal.locator('.panel').filter({ hasText: heading }).first();
        if ((await panel.locator('crosslist').count()) === 0) {
          await panel.getByText(heading, { exact: false }).first().click().catch(() => undefined);
          await panel.locator('crosslist').first().waitFor({ state: 'visible', timeout: 10_000 });
        }
        await new CrossList(page, heading, '#modalAddAgentMercancias').add(value);
      }

      await modal.getByRole('button', { name: /^\s*agregar\s*$/i }).click();
      await expect(modal).toBeHidden({ timeout: 15_000 });
      // Wait for the modal backdrop to detach — a lingering backdrop intercepts
      // clicks on the fields below (e.g. the datos-públicos radio).
      await expect(page.locator('.modal-backdrop')).toHaveCount(0, { timeout: 10_000 });
      await new DynamicTable(page, 'Mercancías').expectRowExists(m.nombreComercial);
    });
  }

  /** RFC + "Buscar" autopopulates the representante's name fields (plaguicidas). */
  private static async fillRepresentanteLegalPlaguicidas(page: Page, d: RepresentanteLegalData): Promise<void> {
    await Logger.step('Fill Representante legal RFC and look up name (plaguicidas)', async () => {
      await new TextField(page, 'rfc', 'control').fill(d.rfc);
      await page.locator('[formcontrolname="rfc"]:visible')
        .locator('xpath=ancestor::div[contains(@class,"row")][1]')
        .getByRole('button', { name: /buscar/i }).click();
      await expect(page.locator('[formcontrolname="nombre"]:visible'))
        .not.toHaveValue('', { timeout: 10_000 });
    });
  }

  /** Verifies the representante legal name fields autofilled from the RFC lookup. */
  static async verifyRepresentanteAutofillPlaguicidas(page: Page, d: RepresentanteLegalData): Promise<void> {
    await Logger.step('Verify representante legal autofill (plaguicidas)', async () => {
      await new TextField(page, 'nombre', 'control').expectValue(d.nombre);
      await new TextField(page, 'apellidoPaterno', 'control').expectValue(d.apellidoPaterno);
      await new TextField(page, 'apellidoMaterno', 'control').expectValue(d.apellidoMaterno);
    });
  }

  // ─── Plaguicidas (260501) — Terceros relacionados ─────────────────────────

  /**
   * Opens a plaguicidas tercero modal. All three tercero tables render their
   * add-modal as an <app-modal> `.popup` inside the SAME component
   * (`app-terceros-fabricante`, with no Bootstrap id), but each modal carries a
   * distinct heading ("Agregar fabricante" / "Agregar formulador" / "Agregar
   * proveedor"). The three tables share unnamed "Agregar" buttons, so click each
   * visible one until the popup with the wanted heading appears, cancelling any
   * other opened by mistake.
   */
  private static async openTerceroPopup(page: Page, heading: RegExp): Promise<Locator> {
    const wanted = page.locator('.popup').locator('visible=true').filter({ hasText: heading }).first();
    if (await wanted.isVisible().catch(() => false)) return wanted;
    const agregars = page.locator('button')
      .filter({ hasText: /^\s*Agregar\s*$/ }).locator('visible=true');
    const count = await agregars.count();
    for (let i = 0; i < count; i++) {
      await agregars.nth(i).click();
      await page.locator('.popup').locator('visible=true').last()
        .waitFor({ state: 'visible', timeout: 4_000 }).catch(() => undefined);
      if (await wanted.isVisible().catch(() => false)) return wanted;
      await page.locator('.popup').locator('visible=true').last()
        .getByRole('button', { name: /cancelar/i }).click().catch(() => undefined);
      await page.locator('.popup').locator('visible=true').last()
        .waitFor({ state: 'hidden', timeout: 4_000 }).catch(() => undefined);
    }
    throw new Error(`Could not open tercero popup ${heading}`);
  }

  /**
   * Adds a tercero (Fabricante / Formulador / Proveedor) for plaguicidas.
   * The modal shape differs from the medicamentos tercero modals: nacionalidad
   * and tipoPersona radios carry ids (nacional/extranjero, fisica/moral), and
   * the name field is `nombre` (not `nombres`). Address selects are the same
   * cascading bare selects, driven by selectByLabelInModal.
   */
  static async addTerceroPlaguicidas(page: Page, heading: RegExp, t: TerceroData): Promise<void> {
    await Logger.step(`Add tercero (${heading.source})`, async () => {
      const popup = await CofeprisRegistrationFlow.openTerceroPopup(page, heading);

      if (t.nacionalidad) {
        const nacId = /extranjero/i.test(t.nacionalidad) ? 'extranjero' : 'nacional';
        await popup.locator(`input#${nacId}`).check();
      }
      const tipoId = /moral/i.test(t.tipoPersona) ? 'moral' : 'fisica';
      await popup.locator(`input#${tipoId}`).check();

      // RFC drives the modal: a registered RFC auto-derives CURP + name + the
      // whole domicilio via "Buscar" (like the representante legal), rendering
      // them disabled. Fill RFC, click Buscar, and wait for the name to populate.
      await popup.locator('[formcontrolname="rfc"]').fill(t.rfc);
      const buscar = popup.getByRole('button', { name: /buscar/i });
      if (await buscar.count()) {
        await buscar.first().click();
        await expect(popup.locator('[formcontrolname="nombre"]'))
          .not.toHaveValue('', { timeout: 10_000 });
      }
      // Any field the lookup did not fill (or when there is no lookup) is filled
      // only while still editable — auto-derived fields render disabled.
      const fillIfEnabled = async (fcn: string, value?: string): Promise<void> => {
        if (!value) return;
        const field = popup.locator(`[formcontrolname="${fcn}"]`).first();
        if (!(await field.isDisabled().catch(() => true))) await field.fill(value);
      };
      await fillIfEnabled('curp', t.curp);
      await fillIfEnabled('nombre', t.nombre);
      await fillIfEnabled('primerApellido', t.primerApellido);
      await fillIfEnabled('segundoApellido', t.segundoApellido);

      // A registered RFC auto-derives the whole domicilio (País, Estado,
      // Municipio, Localidad, CP, Colonia, Calle …) as disabled textboxes — no
      // cascading selects to drive. Only pick the address selects when the modal
      // actually renders editable ones (i.e. the RFC did not auto-fill it).
      if (await popup.locator('select:visible:not([disabled])').count()) {
        await CofeprisRegistrationFlow.selectByLabelInModal(popup, 'País', t.pais);
        await CofeprisRegistrationFlow.selectByLabelInModal(popup, 'Estado/localidad', t.estado);
        await CofeprisRegistrationFlow.selectByLabelInModal(popup, 'Municipio', t.municipio);
        await CofeprisRegistrationFlow.selectByLabelInModal(popup, 'Localidad', t.localidad);
        await CofeprisRegistrationFlow.selectByLabelInModal(popup, 'Código postal', t.codigoPostal);
        await CofeprisRegistrationFlow.selectByLabelInModal(popup, 'Colonia', t.colonia);
      }

      await fillIfEnabled('calle', t.calle);
      await fillIfEnabled('numeroExterior', t.numeroExterior);
      await fillIfEnabled('telefono', t.telefono);
      await fillIfEnabled('correoElectronico', t.correo);

      await popup.getByRole('button', { name: /guardar/i }).click();
      await expect(popup).toBeHidden({ timeout: 15_000 });
    });
  }

  /**
   * Advances Paso 1 → Paso 2 for procedures with no Pago de derechos tab
   * (e.g. the 3-tab 260604): a single Continuar with no "no requiere pago"
   * confirmation.
   */
  static async continueToPaso2(page: Page): Promise<void> {
    // On the 3-tab procedures (no Pago) the wizard advances from the last Paso-1
    // tab, so land on Terceros relacionados before clicking Continuar.
    await new Tab(page).click('Terceros relacionados');
    await CofeprisRegistrationFlow.continuarToPaso2(page, false);
  }

  /** The Manifiestos y declaraciones checkbox, or null when the form has none. */
  private static async locateManifiestosCheckbox(page: Page): Promise<Locator | null> {
    // The declaration checkbox carries a per-family formcontrolname — 'manifesto'
    // (medicamentos), sometimes 'cumplimiento', or 'mensaje' (plaguicidas 260501
    // and sustancias tóxicas 260512). Match those first so the procedures that
    // already pass are unaffected; if the control was renamed, fall back to the
    // checkbox inside the <app-manifiestos> "Manifiestos y declaraciones" panel,
    // located by container so it self-heals. Some procedures have no manifiestos
    // declaration at all (e.g. the aviso-exportación 260604) → return null.
    const known = page.locator(
      'input[type="checkbox"][formcontrolname="manifesto"]:visible, ' +
      'input[type="checkbox"][formcontrolname="cumplimiento"]:visible, ' +
      'input[type="checkbox"][formcontrolname="mensaje"]:visible',
    );
    if (await known.count()) return known.first();
    const fallback = page.locator('app-manifiestos input[type="checkbox"]:visible').first();
    return (await fallback.count()) ? fallback : null;
  }

  /** Accept the Manifiestos y declaraciones declaration (checkbox only). */
  private static async acceptManifiestos(page: Page): Promise<void> {
    await Logger.step('Accept Manifiestos y declaraciones', async () => {
      const box = await CofeprisRegistrationFlow.locateManifiestosCheckbox(page);
      if (!box) return;
      // A single click is unreliable here: the checkbox sits right below the
      // Mercancía modal, whose closing backdrop can intercept the click, and the
      // reactive form can re-render the <app-manifiestos> subtree mid-click so the
      // toggle lands on a detached element (verified live: the box stays unchecked
      // → "Faltan campos por capturar" on Continuar). Wait the backdrop out, then
      // click and VERIFY it stuck — retrying with a programmatic el.click() (which
      // bypasses overlay interception and fires the change event Angular's checkbox
      // accessor needs) until the box is actually checked.
      await expect(page.locator('.modal-backdrop')).toHaveCount(0, { timeout: 10_000 }).catch(() => undefined);
      await expect.poll(async () => {
        if (await box.isChecked().catch(() => false)) return true;
        await box.click().catch(() => undefined);
        if (await box.isChecked().catch(() => false)) return true;
        await box.evaluate((el: HTMLInputElement) => el.click()).catch(() => undefined);
        return box.isChecked().catch(() => false);
      }, { timeout: 15_000, intervals: [300, 500, 800] }).toBe(true);

      // Newer builds add a second declaration checkbox in the same panel — accept any
      // remaining unchecked ones (no-op when the panel holds just the one handled above).
      const others = page.locator(
        'app-manifiestos input[type="checkbox"]:visible, input[type="checkbox"][formcontrolname^="manifesto"]:visible',
      );
      for (let i = 0; i < await others.count(); i++) {
        const other = others.nth(i);
        await expect.poll(async () => {
          if (await other.isChecked().catch(() => false)) return true;
          await other.evaluate((el: HTMLInputElement) => el.click()).catch(() => undefined);
          return other.isChecked().catch(() => false);
        }, { timeout: 15_000, intervals: [300, 500, 800] }).toBe(true);
      }
    });
  }

  /**
   * Accept the Manifiestos declaration AND set the datos-públicos radio together
   * (plaguicidas 260501 / sustancias tóxicas 260512). Both controls live in the
   * same <app-manifiestos> component and re-render each other, so setting them as
   * two separate one-shot steps is flaky (~50% live): whichever is set second can
   * have its click eaten by the sibling's re-render. Reconcile both in one loop —
   * always (re)assert the checkbox FIRST (the reliable order; radio-first
   * hard-locks the checkbox), then the radio — until BOTH hold. The radio option's
   * `checked` lies, so its success signal is the app-input-radio group (located by
   * the option it contains, so no formcontrolname assumed) losing ng-invalid.
   */
  private static async acceptManifiestosAndSetDatosPublicos(page: Page, value: string): Promise<void> {
    await Logger.step(`Accept Manifiestos + set datos-públicos = ${value}`, async () => {
      await expect(page.locator('.modal-backdrop')).toHaveCount(0, { timeout: 10_000 }).catch(() => undefined);
      const box = await CofeprisRegistrationFlow.locateManifiestosCheckbox(page);
      const radio = page.locator(`input[type="radio"][id="${value}"]:visible`).first();
      const group = page.locator('app-input-radio')
        .filter({ has: page.locator(`input[type="radio"][id="${value}"]`) }).first();
      const radioValid = async (): Promise<boolean> => {
        const cls = await group.getAttribute('class').catch(() => null);
        if (cls !== null) return !cls.includes('ng-invalid');
        return radio.isChecked().catch(() => false);
      };
      const cbChecked = async (): Promise<boolean> => !box || (await box.isChecked().catch(() => false));
      await expect.poll(async () => {
        // Checkbox first — the reliable order.
        if (box && !(await box.isChecked().catch(() => false))) {
          await box.click().catch(() => undefined);
          if (!(await box.isChecked().catch(() => false))) {
            await box.evaluate((el: HTMLInputElement) => el.click()).catch(() => undefined);
          }
        }
        // Then the radio.
        if (!(await radioValid())) {
          await radio.scrollIntoViewIfNeeded().catch(() => undefined);
          await radio.check({ timeout: 1_500 }).catch(() => undefined);
          if (!(await radioValid())) {
            await radio.evaluate((el: HTMLInputElement) => el.click()).catch(() => undefined);
          }
        }
        return (await cbChecked()) && (await radioValid());
      }, { timeout: 40_000, intervals: [400, 700, 1_000] }).toBe(true);
    });
  }

  private static async setDatosPublicos(page: Page, value: string): Promise<void> {
    await Logger.step(`Set "hacer públicos los datos" = ${value}`, async () => {
      // Legacy builds key the radios by id ("Si"/"No"); newer ones don't, so fall
      // back to the group's question text.
      const byId = page.locator(`input[type="radio"][id="${value}"]:visible`);
      if (await byId.count()) {
        await RadioButton.byId(page, value).select();
      } else {
        await CofeprisRegistrationFlow.selectRadioByQuestion(page, /hacerlos públicos/i, value);
        // Newer builds re-render <app-manifiestos> when this radio changes and drop the
        // checkbox, so re-assert it (idempotent: returns at once when already checked).
        await CofeprisRegistrationFlow.acceptManifiestos(page);
      }
    });
  }

  /**
   * Selects Sí/No in the radio group whose question matches `question`. The
   * innermost container that holds both the question and its radios is `.last()`
   * (ancestors precede descendants in DOM order).
   */
  private static async selectRadioByQuestion(page: Page, question: RegExp, value: string): Promise<void> {
    const label = /^s[ií]$/i.test(value) ? 'Sí' : 'No';
    const group = page.locator('div')
      .filter({ hasText: question })
      .filter({ has: page.getByRole('radio') })
      .last();
    const radio = group.getByRole('radio', { name: label, exact: true });
    await expect.poll(async () => {
      if (await radio.isChecked().catch(() => false)) return true;
      await radio.scrollIntoViewIfNeeded().catch(() => undefined);
      await radio.evaluate((el: HTMLInputElement) => el.click()).catch(() => undefined);
      return radio.isChecked().catch(() => false);
    }, { timeout: 15_000, intervals: [200, 400, 800] }).toBe(true);
  }

  /**
   * "¿El Representante legal ha realizado trámites previos para el establecimiento?"
   * (REQ_02 new UI). Required when present; answered No by default because Sí reveals a
   * required "folio de trámite de referencia" field.
   */
  private static async answerTramitesPrevios(page: Page, value = 'No'): Promise<void> {
    const question = /ha realizado trámites previos/i;
    if (!(await page.getByText(question).first().isVisible().catch(() => false))) return;
    await Logger.step(`Answer "trámites previos" = ${value}`, async () => {
      await CofeprisRegistrationFlow.selectRadioByQuestion(page, question, value);
    });
  }

  /** RFC + "Buscar" autopopulates the representative's name fields. */
  private static async fillRepresentanteLegal(page: Page, d: RepresentanteLegalData): Promise<void> {
    await Logger.step('Fill Representante legal RFC and look up name', async () => {
      await new TextField(page, 'representanteRfc', 'control').fill(d.rfc);
      // The name fields populate only after clicking "Buscar" beside the RFC.
      await page.locator('[formcontrolname="representanteRfc"]')
        .locator('xpath=ancestor::div[contains(@class,"row")][1]')
        .getByRole('button', { name: /buscar/i }).click();
      await expect(page.locator('[formcontrolname="representanteNombre"]:visible'))
        .not.toHaveValue('', { timeout: 10_000 });
    });
    await CofeprisRegistrationFlow.answerTramitesPrevios(page);
  }

  static async verifyRepresentanteAutofill(page: Page, d: RepresentanteLegalData): Promise<void> {
    await Logger.step('Verify representante legal autofill', async () => {
      await new TextField(page, 'representanteNombre', 'control').expectValue(d.nombre);
      await new TextField(page, 'apellidoPaterno', 'control').expectValue(d.apellidoPaterno);
      await new TextField(page, 'apellidoMaterno', 'control').expectValue(d.apellidoMaterno);
    });
  }

  // ─── Sustancias tóxicas (260512) — Datos de la solicitud ──────────────────

  /**
   * The Datos de la solicitud tab for the 260512 "permiso de importación de
   * sustancias tóxicas" trámite. Reuses the plaguicidas building blocks
   * (establecimiento capture, the #modalAddAgent S.C.I.A.N. modal, the
   * `<crosslist>` Aduanas de entrada, the `mensaje` manifiestos checkbox and the
   * Buscar-driven representante legal); it diverges only in the Aviso de
   * funcionamiento checkbox (which coexists with the licencia here, unlike the
   * materias-primas form where it disables it), the datos-públicos radio keyed by
   * id, and its own Mercancía modal shape (see addMercanciaToxicas).
   */
  static async fillDatosSolicitudToxicas(page: Page, data: ToxicasSolicitudData): Promise<void> {
    await new Tab(page).click('Datos de la solicitud');
    await CofeprisRegistrationFlow.openEstablecimiento(page);
    await CofeprisRegistrationFlow.fillEstablecimientoPlaguicidas(page, data.establecimiento);
    await CofeprisRegistrationFlow.addScianPlaguicidas(page, data.scian);
    await Logger.step('Set Aviso de funcionamiento + No. de licencia sanitaria', async () => {
      // On tóxicas the Aviso checkbox and the licencia field coexist (verified
      // live: ticking Aviso does not disable licencia, unlike the 260202 form).
      if (data.avisoFuncionamiento) {
        await new Checkbox(page, 'avisoCheckbox', 'control').check();
      }
      await new TextField(page, 'licenciaSanitaria', 'control').fill(data.licenciaSanitaria);
    });
    await CofeprisRegistrationFlow.addAduana(page, data.aduana);
    await CofeprisRegistrationFlow.addMercanciaToxicas(page, data.mercancia);
    await CofeprisRegistrationFlow.acceptManifiestosAndSetDatosPublicos(page, data.datosPublicos);
    await CofeprisRegistrationFlow.fillRepresentanteLegalPlaguicidas(page, data.representanteLegal);
    // The establecimiento Código postal's async lookup can silently clear the
    // field during the later Datos steps (verified live: "Faltan campos por
    // capturar" on Continuar with an empty CP), so restore it (and re-assert the
    // aduana dual-list) before leaving the tab.
    await CofeprisRegistrationFlow.restoreCpAndAduana(page, data.establecimiento.codigoPostal, data.aduana);
  }

  /**
   * Add a Mercancía record via the sustancias-tóxicas "Datos mercancía" modal
   * (#modalAddAgentMercancias). Same modal container as plaguicidas but a distinct
   * field set: Nombre comercial / común / químico, a free-text Uso específico
   * (textarea), Estado físico, Número CAS (in place of plaguicidas' Número de
   * registro), Clasificación toxicológica + Objeto de la importación dropdowns,
   * and TWO país `<crosslist>` dual-lists (origen + procedencia). Descripción de
   * la fracción and the UMT unit are auto-derived (disabled) and left untouched.
   */
  static async addMercanciaToxicas(page: Page, m: ToxicasMercanciaData): Promise<void> {
    await Logger.step('Add Mercancía record (sustancias tóxicas)', async () => {
      const modal = await CofeprisRegistrationFlow.openAddModalById(page, 'modalAddAgentMercancias');

      await new TextField(page, 'nombreComercial', 'control').fill(m.nombreComercial);
      await new TextField(page, 'nombreComun', 'control').fill(m.nombreComun);
      await new TextField(page, 'nombreCientifico', 'control').fill(m.nombreCientifico);
      // Uso específico is a free-text <textarea> here (not a dual-list).
      await modal.locator('textarea[formcontrolname="usoEspecifico"]').fill(m.usoEspecifico);
      await new Dropdown(page, 'estadoFisico', 'control').select(m.estadoFisico);
      // fraccionArancelaria is a text input; descripcionFraccion auto-fills (disabled).
      await new TextField(page, 'fraccionArancelaria', 'control').fill(m.fraccionArancelaria);
      // cantidadUMT value is editable; the UMT unit is disabled/auto-derived.
      await new TextField(page, 'cantidadUMT', 'control').fill(m.cantidadUmt);
      await new TextField(page, 'cantidadUMC', 'control').fill(m.cantidadUmc);
      await new Dropdown(page, 'UMC', 'control').select(m.umc);
      await new TextField(page, 'numeroCas', 'control').fill(m.numeroCas);
      await new TextField(page, 'porcentajeConcentracion', 'control').fill(m.porcentajeConcentracion);
      await new Dropdown(page, 'clasificacionToxicologica', 'control').select(m.clasificacionToxicologica);
      await new Dropdown(page, 'objetoImportacion', 'control').select(m.objetoImportacion);

      // País de origen / procedencia are <crosslist> dual-lists in collapsible
      // panels; pre-expand each so its <crosslist> renders, then move the value
      // across via the CrossList component (which skips its own expand click once
      // rendered — the procedencia heading is longer than the panel title, so an
      // exact-text expand click would not match).
      const paises: [string, string | undefined][] = [
        ['País de origen', m.paisOrigen],
        ['País de procedencia', m.paisProcedencia],
      ];
      for (const [heading, value] of paises) {
        if (!value) continue;
        const panel = modal.locator('.panel').filter({ hasText: heading }).first();
        if ((await panel.locator('crosslist').count()) === 0) {
          await panel.getByText(heading, { exact: false }).first().click().catch(() => undefined);
          await panel.locator('crosslist').first().waitFor({ state: 'visible', timeout: 10_000 });
        }
        await new CrossList(page, heading, '#modalAddAgentMercancias').add(value);
      }

      await modal.getByRole('button', { name: /^\s*agregar\s*$/i }).click();
      await expect(modal).toBeHidden({ timeout: 15_000 });
      // Wait for the modal backdrop to detach — a lingering backdrop intercepts
      // clicks on the fields below (e.g. the datos-públicos radio).
      await expect(page.locator('.modal-backdrop')).toHaveCount(0, { timeout: 10_000 });
      await new DynamicTable(page, 'Mercancías').expectRowExists(m.nombreComercial);
    });
  }

  // ─── Consumo personal / muestra (260102) — Datos de la solicitud ──────────

  /**
   * The Datos de la solicitud tab for the 260102 "permiso sanitario de
   * importación de productos de muestra o consumo personal" trámite. Reuses the
   * medicamentos building blocks (establecimiento capture without RFC-del-
   * responsable, the S.C.I.A.N. modal, the `manifesto` checkbox, the `seleccion`
   * datos-públicos radio and the Buscar-driven representante) and adds: an Aviso
   * de funcionamiento checkbox (coexists with the licencia here), régimen +
   * aduana with an Aeropuerto-AICM checkbox (revealed by the AIFA aduana), and its
   * own Mercancía modal shape (see addMercanciaConsumoPersonal).
   */
  static async fillDatosSolicitudConsumoPersonal(page: Page, data: ConsumoPersonalSolicitudData): Promise<void> {
    await new Tab(page).click('Datos de la solicitud');
    await CofeprisRegistrationFlow.openEstablecimiento(page);
    await CofeprisRegistrationFlow.fillEstablecimiento(page, data.establecimiento);
    await CofeprisRegistrationFlow.addScian(page, data.scian);
    await Logger.step('Set Aviso de funcionamiento + No. de licencia sanitaria', async () => {
      if (data.avisoFuncionamiento) {
        await new Checkbox(page, 'aviso', 'control').check();
      }
      await new TextField(page, 'licenciaSanitaria', 'control').fill(data.licenciaSanitaria);
    });
    await Logger.step('Set régimen, aduana (+AICM)', async () => {
      const regimen = page.locator('app-catalogo-select[name="regimen"] select:visible');
      if (await regimen.count() && !(await regimen.first().isDisabled())) {
        await new Dropdown(page, 'regimen', 'control').select(data.regimen);
      }
      await new Dropdown(page, 'adunasDeEntradas', 'control').select(data.aduana);
      if (data.aduanaAicm) {
        // Selecting the AIFA aduana reveals the "Aeropuerto Internacional Ciudad
        // de México (AICM)" checkbox (formcontrolname="aeropuerto").
        await new Checkbox(page, 'aeropuerto', 'control').check();
      }
    });
    await CofeprisRegistrationFlow.addMercanciaConsumoPersonal(page, data.mercancia);
    await CofeprisRegistrationFlow.acceptManifiestos(page);
    await CofeprisRegistrationFlow.setDatosPublicos(page, data.datosPublicos);
    await CofeprisRegistrationFlow.fillRepresentanteLegal(page, data.representanteLegal);
  }

  /**
   * Add a Mercancía record via the consumo-personal "Datos mercancía" modal
   * (#mercanciaModal). A trimmed medicamentos shape: Clasificación + Especificar
   * del producto, Denominación específica, a "Marca" field (in place of
   * denominación distintiva), Tipo de producto, UMT/UMC quantities (the UMT unit
   * auto-derives and is disabled), and País de origen / procedencia / Uso
   * específico `<crosslist>` dual-lists. No denominación distintiva/común, forma
   * farmacéutica, estado físico, presentación or número de registro.
   */
  static async addMercanciaConsumoPersonal(page: Page, m: ConsumoPersonalMercanciaData): Promise<void> {
    await Logger.step('Add Mercancía record (consumo personal)', async () => {
      await page.locator('button[name="agregarMercancias"]')
        .filter({ hasText: /agregar/i }).locator('visible=true').first().click();

      // Clasificación + Especificar is an order-sensitive cascade that self-resets
      // (selecting Clasificación clears itself — and Especificar — ~1s later), so
      // drive it through the robust helper rather than two plain selects.
      await CofeprisRegistrationFlow.setClasificacionProducto(
        page, m.clasificacionProducto, m.especificarClasificacion);
      await new TextField(page, 'denominacionEspecificaProducto', 'control').fill(m.denominacionEspecifica);
      await new TextField(page, 'marca', 'control').fill(m.marca);
      await new Dropdown(page, 'tipoProducto', 'control').select(m.tipoProducto);
      // fraccionArancelaria is a text input; descripcionFraccion auto-fills (disabled).
      await new TextField(page, 'fraccionArancelaria', 'control').fill(m.fraccionArancelaria);
      // cantidadUmtValor is editable; the UMT unit (cantidadUmt) is disabled/auto-derived.
      await new TextField(page, 'cantidadUmtValor', 'control').fill(m.cantidadUmt);
      await new TextField(page, 'cantidadUmcValor', 'control').fill(m.cantidadUmc);
      await new Dropdown(page, 'cantidadUmc', 'control').select(m.umc);

      // País de origen / procedencia and Uso específico are <crosslist> dual-lists
      // in collapsible panels; pre-expand each so its <crosslist> renders, then move
      // the value across via the CrossList component.
      const lists: [string, string | undefined][] = [
        ['País de origen', m.paisOrigen],
        ['País de procedencia', m.paisProcedencia],
        ['Uso específico', m.usoEspecifico],
      ];
      const modal = page.locator('#mercanciaModal');
      for (const [heading, value] of lists) {
        if (!value) continue;
        const panel = modal.locator('.panel').filter({ hasText: heading }).first();
        if ((await panel.locator('crosslist').count()) === 0) {
          await panel.getByText(heading, { exact: false }).first().click().catch(() => undefined);
          await panel.locator('crosslist').first().waitFor({ state: 'visible', timeout: 10_000 });
        }
        await new CrossList(page, heading, '#mercanciaModal').add(value);
      }

      // Required "Clave de los lotes" sub-form: fill the clave + the two calendar
      // fields, then "Agregar" (name="agregarClave") to add a lote to the "Lista
      // Claves de los lotes" table (empty otherwise → the mercancía stays invalid).
      await new TextField(page, 'claveDeLos', 'control').fill(m.claveLote);
      await CofeprisRegistrationFlow.setFechaByLabel(page, 'Fecha de fabricación', m.fechaFabricacion);
      await CofeprisRegistrationFlow.setFechaByLabel(page, 'Fecha de caducidad', m.fechaCaducidad);
      await modal.locator('button[name="agregarClave"]').click();
      // The lote registers in Angular's model asynchronously; wait for the clave
      // input to reset (it clears once the lote row is added) before committing.
      await expect(modal.locator('input[formcontrolname="claveDeLos"]'))
        .toHaveValue('', { timeout: 10_000 }).catch(() => undefined);

      // The modal's footer commit button is name="agregarScian" (there is also a
      // name="agregarClave" that adds a "Clave de los lotes" sub-row, so an exact
      // "Agregar" role match is ambiguous — scope to the commit by name).
      await modal.locator('button[name="agregarScian"]').click();
      await expect(modal).toBeHidden({ timeout: 15_000 });
      await expect(page.locator('.modal-backdrop')).toHaveCount(0, { timeout: 10_000 });
      await new DynamicTable(page, 'Mercancías').expectRowExists(m.denominacionEspecifica);
    });
  }

  // ─── Terceros relacionados tab ────────────────────────────────────────────

  /**
   * Opens the tercero add-modal with the given id. All the tab's "Agregar"
   * buttons share `name="agregarMercancias"` and expose no distinguishing label,
   * so click them in turn until the wanted modal (`#fabricanteModal`,
   * `#destinatarioModal`, …) appears; cancel any other modal opened by mistake.
   */
  private static async openTerceroModal(page: Page, modalId: string): Promise<Locator> {
    const modal = page.locator(`#${modalId}`);
    const agregars = page.locator('button')
      .filter({ hasText: /^\s*Agregar\s*$/ }).locator('visible=true');
    const count = await agregars.count();
    for (let i = 0; i < count; i++) {
      await agregars.nth(i).click();
      try {
        await modal.waitFor({ state: 'visible', timeout: 4_000 });
        return modal;
      } catch {
        await page.getByRole('button', { name: /cancelar/i }).last().click().catch(() => undefined);
        await page.locator('.modal.show').last().waitFor({ state: 'hidden', timeout: 4_000 }).catch(() => undefined);
      }
    }
    throw new Error(`Could not open tercero modal #${modalId}`);
  }

  /**
   * Selects a value in one of the tercero modal's cascading location selects.
   * They are bare <select formcontrolname="selectControl"> (no wrapper name or
   * id), so target the first <select> following the label that contains the
   * given text.
   */
  private static async selectByLabelInModal(modal: Locator, labelContains: string, value: string): Promise<void> {
    const norm = (s: string) =>
      s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

    // Resolve the target select by its index among the modal's selects (document
    // order). "First label containing X, then its following select" is ambiguous:
    // "Colonia" also matches the hidden "Colonia o equivalente" variant
    // (extranjero/proveedor), which made the xpath resolve to two selects (strict-
    // mode violation). Prefer a label whose text (minus "*"/":") equals the
    // target, then take its nearest following select; fall back to the first
    // substring match. For single-match labels this is identical to before.
    const targetIndex = await modal.evaluate((root, target) => {
      const nrm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/\s+/g, ' ').trim();
      const strip = (s: string) => nrm(s).replace(/[*:]/g, '').trim();
      const t = nrm(target);
      const selects = Array.from(root.querySelectorAll('select'));
      const nearestFollowing = (label: Element) => selects.find(
        s => (label.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
      const labels = Array.from(root.querySelectorAll('label'))
        .filter(l => nrm(l.textContent).includes(t));
      const exact = labels.filter(l => strip(l.textContent || '') === strip(target));
      for (const l of [...exact, ...labels]) {
        const s = nearestFollowing(l);
        if (s) return selects.indexOf(s);
      }
      return -1;
    }, labelContains);
    if (targetIndex < 0) {
      throw new Error(`No select found for label "${labelContains}" in the tercero modal`);
    }
    const select = modal.locator('select').nth(targetIndex);

    // Some selects are auto-filled and permanently disabled (e.g. País is fixed
    // to MEXICO for a Nacional tercero). If the field is disabled but already
    // shows the wanted value, it's read-only by design — nothing to select.
    if (await select.isDisabled()) {
      const current = ((await select.locator('option:checked').textContent()) ?? '')
        .replace(/\s+/g, ' ').trim();
      if (norm(current) === norm(value) || norm(current).includes(norm(value)) || norm(value).includes(norm(current))) {
        return;
      }
    }

    // Cascading selects only enable + load their options once the parent is
    // chosen — wait for both before selecting.
    await expect(select).toBeEnabled();
    await expect.poll(async () => select.locator('option').count()).toBeGreaterThan(1);
    // Options may differ from test data by accents/case/spacing, so match
    // accent- and case-insensitively and select by the option's value (avoids
    // label-whitespace mismatches).
    const options = await select.locator('option').evaluateAll(els =>
      (els as HTMLOptionElement[]).map(e => ({ value: e.value, text: (e.textContent || '').replace(/\s+/g, ' ').trim() })));
    const match = options.find(o => norm(o.text) === norm(value)) ?? options.find(o => norm(o.text).includes(norm(value)));
    if (!match) {
      throw new Error(`No option ~ "${value}" for "${labelContains}". Got: ${options.map(o => o.text).slice(0, 8).join(' | ')}`);
    }
    await select.selectOption(match.value);
  }

  /**
   * Sets one of the tercero modal's location fields by its label, tolerating BOTH
   * shapes the modal uses depending on País: a cascading <select> (national —
   * MEXICO, with dependent Estado/Municipio/Localidad selects) or a plain text
   * <input> (foreign, e.g. INDIA, where Estado / Código postal become free text).
   * Blank values, and fields absent for the chosen País, are skipped. Selects go
   * through selectByLabelInModal (accent-insensitive option match); text inputs
   * are filled when editable.
   */
  private static async setAddressFieldInModal(modal: Locator, labelContains: string, value: string): Promise<void> {
    if (!value) return;
    const kind = await modal.evaluate((root, target) => {
      const nrm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/\s+/g, ' ').trim();
      const strip = (s: string) => nrm(s).replace(/[*:]/g, '').trim();
      const t = nrm(target);
      const fields = Array.from(root.querySelectorAll(
        'select, input:not([type=checkbox]):not([type=radio]):not([type=button])'));
      const nearestFollowing = (label: Element) => fields.find(
        f => (label.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
      const labels = Array.from(root.querySelectorAll('label')).filter(l => nrm(l.textContent).includes(t));
      const exact = labels.filter(l => strip(l.textContent || '') === strip(target));
      for (const l of [...exact, ...labels]) {
        const f = nearestFollowing(l);
        if (f) return { index: fields.indexOf(f), tag: f.tagName.toLowerCase() };
      }
      return null;
    }, labelContains);
    if (!kind) return; // field not present for this País — skip
    if (kind.tag === 'select') {
      await CofeprisRegistrationFlow.selectByLabelInModal(modal, labelContains, value);
      return;
    }
    const input = modal.locator(
      'select, input:not([type=checkbox]):not([type=radio]):not([type=button])').nth(kind.index);
    if (!(await input.isDisabled().catch(() => true))) {
      await input.fill(value);
    }
  }

  /**
   * Adds a tercero via the modal identified by `modalId` (e.g. 'fabricanteModal',
   * 'destinatarioModal'). Optional data fields (segundo apellido, teléfono,
   * correo, CURP) are filled only when the data supplies them, so a procedure
   * that omits them behaves exactly as before. Address fields tolerate both the
   * national (cascading selects) and foreign (free-text) modal shapes.
   */
  static async addTercero(page: Page, modalId: string, t: TerceroData): Promise<void> {
    await Logger.step(`Add tercero (${modalId})`, async () => {
      const modal = await CofeprisRegistrationFlow.openTerceroModal(page, modalId);

      // nacionalidad (Nacional/Extranjero) exists only on some tercero modals
      // (e.g. fabricante), where it enables tipoPersona; the destinatario modal
      // omits it entirely. Select it only when the radio is present.
      const nacionalidad = modal.locator(`#nacionalidad_${t.nacionalidad ?? 'Nacional'}`);
      if (await nacionalidad.count()) {
        await nacionalidad.check();
      }
      // tipoPersona radios carry an id (#tipoPersona_Fisica) only on some tercero
      // modals (fabricante); the destinatario modal's radios have none. Locate by
      // the visible label text inside the .form-check wrapper — works for both.
      await modal.locator('.form-check', { hasText: t.tipoPersona })
        .locator('input[type="radio"]').check();

      // Fill a modal field by formControlName only when it exists AND is editable
      // and a value is supplied. Tercero modals vary: the medicamentos fabricante/
      // destinatario carry R.F.C. + CURP, but the muestra/consumo-personal (260102)
      // modals have neither — so an unconditional rfc fill would time out there.
      const fillIfPresent = async (fcn: string, value?: string): Promise<void> => {
        if (!value) return;
        const field = modal.locator(`[formcontrolname="${fcn}"]`).first();
        if (await field.count() && !(await field.isDisabled().catch(() => true))) {
          await field.fill(value);
        }
      };

      await fillIfPresent('rfc', t.rfc);
      await fillIfPresent('curp', t.curp);
      await fillIfPresent('nombres', t.nombre);
      await fillIfPresent('primerApellido', t.primerApellido);
      await fillIfPresent('segundoApellido', t.segundoApellido);

      // Location fields — País is always a <select>; the dependent fields are
      // cascading selects for a national tercero (MEXICO) or free-text inputs for
      // a foreign one (INDIA). setAddressFieldInModal handles both and skips
      // blanks / fields absent for the chosen País.
      await CofeprisRegistrationFlow.selectByLabelInModal(modal, 'País', t.pais);
      // "Estado" (foreign, free text) or "Estado/localidad" (national select) —
      // the broad "Estado" substring matches both.
      await CofeprisRegistrationFlow.setAddressFieldInModal(modal, 'Estado', t.estado);
      await CofeprisRegistrationFlow.setAddressFieldInModal(modal, 'Municipio/alcaldía', t.municipio);
      await CofeprisRegistrationFlow.setAddressFieldInModal(modal, 'Localidad', t.localidad);
      await CofeprisRegistrationFlow.setAddressFieldInModal(modal, 'Código postal', t.codigoPostal);
      await CofeprisRegistrationFlow.setAddressFieldInModal(modal, 'Colonia', t.colonia);

      await fillIfPresent('calle', t.calle);
      await fillIfPresent('numeroExterior', t.numeroExterior);
      await fillIfPresent('telefono', t.telefono);
      await fillIfPresent('correoElectronico', t.correo);

      await modal.getByRole('button', { name: /guardar/i }).click();
      await expect(modal).toBeHidden({ timeout: 15_000 });
    });
  }

  /**
   * Adds a Facturador/Consignatario record on the Terceros relacionados tab —
   * the single MANDATORY tercero for the precursores trámite (260604). Its modal
   * (#facturadorModal) diverges from the medicamentos fabricante/destinatario
   * modals: no R.F.C./CURP, no Municipio/Localidad/Colonia. There is no
   * Nacional/Extranjero toggle, so for Persona Física País is fixed (disabled) to
   * MEXICO — selectByLabelInModal no-ops when the data already says MEXICO — and
   * Estado / Código postal are plain text inputs. Persona Moral would show
   * Denominación/razón social instead of Nombre + apellidos; the happy path uses
   * Física.
   */
  static async addFacturadorConsignatario(page: Page, t: TerceroData): Promise<void> {
    await Logger.step('Add Facturador/Consignatario', async () => {
      const modal = await CofeprisRegistrationFlow.openTerceroModal(page, 'facturadorModal');

      await modal.locator('.form-check', { hasText: t.tipoPersona })
        .locator('input[type="radio"]').check();

      await modal.locator('[formcontrolname="nombres"]').fill(t.nombre);
      await modal.locator('[formcontrolname="primerApellido"]').fill(t.primerApellido);
      if (t.segundoApellido) {
        await modal.locator('[formcontrolname="segundoApellido"]').fill(t.segundoApellido);
      }

      // País is the only cascading select on this modal. Estado / Código postal
      // are plain text inputs for a foreign País (guard for a MX select just in case).
      await CofeprisRegistrationFlow.selectByLabelInModal(modal, 'País', t.pais);
      const estadoSelect = modal.locator('app-catalogo-select[name="estado"] select:visible, app-catalogo-select[formcontrolname="estado"] select:visible');
      if (await estadoSelect.count()) {
        await CofeprisRegistrationFlow.selectByLabelInModal(modal, 'Estado', t.estado);
      } else {
        await modal.locator('input[formcontrolname="estado"]').fill(t.estado);
      }
      await modal.locator('input[formcontrolname="codigoPostal"]').fill(t.codigoPostal);
      await modal.locator('[formcontrolname="calle"]').fill(t.calle);
      await modal.locator('[formcontrolname="numeroExterior"]').fill(t.numeroExterior);
      if (t.telefono) {
        await modal.locator('[formcontrolname="telefono"]').fill(t.telefono);
      }
      if (t.correo) {
        await modal.locator('[formcontrolname="correoElectronico"]').fill(t.correo);
      }

      await modal.getByRole('button', { name: /guardar/i }).click();
      await expect(modal).toBeHidden({ timeout: 15_000 });
    });
  }

  // ─── Pago de derechos tab / advance to Paso 2 ─────────────────────────────

  /** Fill all payment fields, then Continuar to Paso 2. */
  static async fillPago(page: Page, d: PagoData): Promise<void> {
    await Logger.step('Fill Pago de derechos', async () => {
      await new Tab(page).click('Pago de derechos');
      // Reactive-form fields: labels carry a trailing ":" (so getByLabel exact
      // fails) and ids repeat — locate by formControlName like the rest of the form.
      await new TextField(page, 'claveReferencia', 'control').fill(d.claveReferencia);
      await new TextField(page, 'cadenaDependencia', 'control').fill(d.cadenaDependencia);
      // Banco wrapper is <app-catalogo-select formcontrolname="banco">.
      await new Dropdown(page, 'banco', 'control').select(d.banco);
      await new TextField(page, 'llavePago', 'control').fill(d.llavePago);
      await CofeprisRegistrationFlow.setFechaPago(page, d.fechaPago);
      await new TextField(page, 'importePago', 'control').fill(d.importePago);
    });
    await CofeprisRegistrationFlow.continuarToPaso2(page);
  }

  /**
   * Fill all Pago de derechos fields for plaguicidas, then Continuar to Paso 2.
   * Same fields as the medicamentos Pago tab but with divergent formControlNames
   * (claveDeReferencia / llaveDePago); the Banco select, the custom Fecha de pago
   * calendar and Importe are identical.
   */
  static async fillPagoPlaguicidas(page: Page, d: PagoData): Promise<void> {
    await Logger.step('Fill Pago de derechos (plaguicidas)', async () => {
      await new Tab(page).click('Pago de derechos');
      // The Pago tab re-renders as fields are filled (validation), which can drop
      // a value written into a field that is being re-created — so fill each text
      // field and verify it stuck, retrying until it holds.
      const fillText = async (fcn: string, value: string): Promise<void> => {
        const field = page.locator(`[formcontrolname="${fcn}"]:visible`).first();
        await expect.poll(async () => {
          if ((await field.inputValue().catch(() => '')) === value) return true;
          await field.fill(value).catch(() => undefined);
          return (await field.inputValue().catch(() => '')) === value;
        }, { timeout: 8_000, intervals: [200, 400, 600] }).toBe(true);
      };
      // Text fields, then the Banco select and Fecha calendar. The text values
      // are re-verified after the select/calendar interactions (which re-render
      // the Pago form and can silently drop a previously-typed value).
      const textFields: [string, string][] = [
        ['claveDeReferencia', d.claveReferencia],
        ['cadenaDependencia', d.cadenaDependencia],
        ['llaveDePago', d.llavePago],
        ['importePago', d.importePago],
      ];
      for (const [fcn, value] of textFields) await fillText(fcn, value);
      await new Dropdown(page, 'banco', 'control').select(d.banco);
      await CofeprisRegistrationFlow.setFechaPago(page, d.fechaPago);
      // Re-verify/re-fill every text field after the re-rendering interactions.
      for (const [fcn, value] of textFields) await fillText(fcn, value);
    });
    // Advance to Paso 2. A single Continuar can no-op while an async validation
    // settles, so retry until the Paso-2 document upload ("Cargar archivos")
    // appears (or an error banner if a field is genuinely missing).
    await Logger.step('Continue to Paso 2', async () => {
      // Capture any backend validation error (200 with an error body) so a
      // rejected submission surfaces a useful message instead of a bare timeout.
      const apiErrors: string[] = [];
      page.on('response', (resp) => {
        if (resp.request().method() !== 'POST' || !/guardar|solicitud/i.test(resp.url())) return;
        void resp.text().then((body) => {
          if (/ERROR_VALIDACION|error en la validaci/i.test(body)) apiErrors.push(body.slice(0, 400));
        }).catch(() => undefined);
      });
      // A single Continuar can no-op while an async validation settles, so retry
      // until the Paso-2 document upload ("Cargar archivos") appears.
      const cargar = page.getByRole('button', { name: /cargar archivos/i }).first();
      try {
        await expect.poll(async () => {
          if (await cargar.isVisible().catch(() => false)) return true;
          await page.getByRole('button', { name: /^\s*continuar\s*$/i }).first().click().catch(() => undefined);
          await page.waitForLoadState('networkidle').catch(() => undefined);
          return cargar.isVisible().catch(() => false);
        }, { timeout: 40_000, intervals: [1_000, 1_500, 2_000] }).toBe(true);
      } catch (e) {
        if (apiErrors.length) throw new Error(`Paso 1 rejected by backend: ${apiErrors[apiErrors.length - 1]}`);
        throw e;
      }
    });
  }

  /** Set Fecha de pago (custom calendar widget). */
  private static async setFechaPago(page: Page, iso: string): Promise<void> {
    await CofeprisRegistrationFlow.setFechaByLabel(page, 'Fecha de pago', iso);
  }

  /**
   * Picks a date in one of VUCEM's custom calendar widgets. These have no
   * <input> (their id "input_fecha" repeats across every date field), so the
   * calendar is opened via the icon next to its label, then year/month/day are
   * chosen from the popup. Shared by "Fecha de pago" (Pago tab) and "Fecha de
   * movimiento…" (precursores Mercancía modal, 260604).
   */
  private static async setFechaByLabel(page: Page, labelContains: string, iso: string): Promise<void> {
    await Logger.step(`Set ${labelContains}`, async () => {
      const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      const [year, month, dayNum] = iso.split('-');
      const monthName = months[Number(month) - 1];
      const day = String(Number(dayNum));

      // Open the calendar via the icon following this field's label.
      await page.locator(`label:has-text("${labelContains}")`)
        .locator('xpath=following::i[contains(@class,"bi-calendar-event")][1]')
        .click();

      // The popup has a year <select> (4-digit year options) and a month <select>
      // (Enero…Diciembre); neither carries a usable label, so identify each by an
      // option it uniquely contains, then pick year and month.
      await page.locator('select')
        .filter({ has: page.getByRole('option', { name: '2126', exact: true }) })
        .selectOption({ label: year });
      await page.locator('select')
        .filter({ has: page.getByRole('option', { name: 'Diciembre', exact: true }) })
        .selectOption({ label: monthName });

      // Days render as clickable list items alongside the weekday headers; scope to
      // that list (the one containing "Lun") so the day number isn't matched elsewhere.
      await page.getByRole('list')
        .filter({ has: page.getByText('Lun', { exact: true }) })
        .getByText(day, { exact: true })
        .click();
    });
  }

  /** Skip payment: go to Pago tab, Continuar → confirm "no requiere pago" → SI → Paso 2. */
  static async skipPagoAndContinue(page: Page): Promise<void> {
    await Logger.step('Skip Pago de derechos', async () => {
      await new Tab(page).click('Pago de derechos');
      await CofeprisRegistrationFlow.continuarToPaso2(page, true);
    });
  }

  private static async continuarToPaso2(page: Page, expectSkipModal = false): Promise<void> {
    await Logger.step('Continue to Paso 2', async () => {
      // Capture any backend validation error (Paso-1 guardar) so a rejected
      // submission surfaces a useful message instead of a bare timeout later.
      const apiErrors: string[] = [];
      page.on('response', (resp) => {
        if (resp.request().method() !== 'POST' || !/guardar|solicitud/i.test(resp.url())) return;
        void resp.text().then((body) => {
          if (/ERROR_VALIDACION|error en la validaci|errores_modelo|no cumple/i.test(body)) {
            apiErrors.push(body.slice(0, 500));
          }
        }).catch(() => undefined);
      });

      // Paso-2 signals — the mandatory-doc "Cargar archivos" screen or the
      // optional-doc "Agregar nuevo"/temporal-folio screen — and the Paso-3
      // signal. Counted by DOM presence, not viewport visibility, since Paso 2
      // may auto-scroll the banner/button out of view.
      const onPaso2 = page.getByText(/n[úu]mero temporal/i)
        .or(page.getByRole('button', { name: /cargar archivos|agregar nuevo/i }));
      const onPaso3 = page.getByRole('heading', { name: /firmar/i, level: 1 });

      // Confirms the "¿…no requiere los datos del Pago de derechos?" dialog when a
      // skip is expected. It is a role=dialog with an EMPTY heading (no accessible
      // name), so scope to the visible dialog by its body text.
      const confirmSkip = async (): Promise<void> => {
        if (!expectSkipModal) return;
        await page.getByRole('dialog')
          .filter({ hasText: /no requiere los datos del Pago de derechos/i })
          .getByRole('button', { name: /^\s*s[íi]\s*$/i })
          .click({ timeout: 15_000 }).catch(() => undefined);
      };

      // Click Continuar once, confirm the skip dialog, then WAIT (without clicking
      // again) for the page to land on Paso 2 or Paso 3. A premature second
      // Continuar is what skips Paso 2 straight to Paso 3 — so only re-click when
      // NEITHER has appeared, i.e. the first Continuar no-op'd while an async
      // validation settled and we are still on Paso 1.
      await page.getByRole('button', { name: /continuar/i }).click();
      await confirmSkip();
      await page.waitForLoadState('networkidle').catch(() => undefined);

      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          await expect.poll(
            async () => (await onPaso2.count().catch(() => 0)) + (await onPaso3.count().catch(() => 0)),
            { timeout: attempt === 0 ? 30_000 : 15_000, intervals: [500, 1_000] },
          ).toBeGreaterThan(0);
        } catch {
          // Still on Paso 1 — the Continuar no-op'd. Click once more and re-wait.
          await page.getByRole('button', { name: /^\s*continuar\s*$/i }).first().click().catch(() => undefined);
          await confirmSkip();
          await page.waitForLoadState('networkidle').catch(() => undefined);
          continue;
        }
        if ((await onPaso2.count().catch(() => 0)) > 0) return; // reached Paso 2 ✓
        // Only Paso 3 present — we advanced past the documentos step we needed.
        const detail = apiErrors.length ? ` Backend: ${apiErrors[apiErrors.length - 1]}` : '';
        throw new Error(`Advanced to Paso 3 (Firmar) without stopping on Paso 2 (documentos).${detail}`);
      }

      if (apiErrors.length) throw new Error(`Paso 1 rejected by backend: ${apiErrors[apiErrors.length - 1]}`);
      const errorBanner = await page.locator('text=/error de registro|faltan campos/i')
        .first().textContent().catch(() => null);
      throw new Error(errorBanner
        ? `Form validation failed: ${errorBanner.trim().slice(0, 200)}`
        : 'Never reached Paso 2 after Continuar');
    });
  }

  /**
   * Advances Paso 2 → Paso 3 (Firmar) after documents are uploaded. The upload
   * runs an ngx-spinner overlay and shows an info alert that both intercept
   * pointer events, and the Continuar button is briefly disabled — so wait the
   * overlay out and the button in, then fire a programmatic click that bypasses
   * any lingering overlay interception (the same tactic used for the
   * datos-públicos radio). The page interaction lives here, not duplicated
   * across the procedure classes.
   */
  static async continueToPaso3(page: Page): Promise<void> {
    await Logger.step('Continue to Paso 3', async () => {
      // After the upload the app runs a full-screen ngx-spinner overlay (and
      // shows an info alert) that intercept pointer events, and the Continuar
      // button is briefly disabled. Wait for the overlay to detach, then do a
      // REAL click with a generous timeout: its actionability wait covers the
      // disabled→enabled transition and still fails honestly if the button stays
      // unreachable — unlike a synthetic el.click(), which would force the click
      // through an overlay a real user could not click past.
      await expect(page.locator('.ngx-spinner-overlay')).toHaveCount(0, { timeout: 30_000 });
      await page.getByRole('button', { name: /^\s*continuar\s*$/i }).first()
        .click({ timeout: 30_000 });
      await page.waitForLoadState('networkidle');
    });
  }
}
