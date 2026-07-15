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
      await page.getByRole('button', { name: /seleccionar establecimiento/i }).click();
      await page.getByRole('button', { name: /^\s*aceptar\s*$/i }).click();
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

  static async addMercanciaPrecursores(page: Page, m: MercanciaData): Promise<void> {
    await Logger.step('Add Mercancía record (precursores químicos)', async () => {
      await page.locator('button[name="agregarMercancias"]')
        .filter({ hasText: /agregar/i }).locator('visible=true').first().click();

      await new Dropdown(page, 'clasificacionProducto', 'control').select(m.clasificacionProducto);
      await new Dropdown(page, 'especificarClasificacionProducto', 'control').select(m.especificarClasificacion);
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

      // Selecting país de destino auto-derives país de procedencia and re-renders
      // the modal; let Angular finish that re-render before the uso dual-list,
      // otherwise the re-render corrupts a just-moved uso value.
      await CofeprisRegistrationFlow.settle(1200);

      // Uso específico is a dual-list in a COLLAPSED panel (no <crosslist> wrapper,
      // so CrossList can't drive it). Expand it, select the value in the source
      // <select multiple>, then click its VISIBLE "Agregar selección" (hidden país
      // dual-lists carry the same button label), verifying the value lands.
      if (m.usoEspecifico) {
        if (!(await modal.locator('select[multiple]:visible').first().count())) {
          await modal.getByText('Uso específico', { exact: true }).first().click();
          await modal.locator('select[multiple]:visible').first().waitFor({ state: 'visible', timeout: 10_000 });
        }
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
        const isMoved = () => modal.evaluate((root, u) => {
          const n = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
          const vis = (e: Element) => !!(e as HTMLElement).offsetParent;
          const sels = Array.from(root.querySelectorAll('select[multiple]')).filter(vis) as HTMLSelectElement[];
          // the "seleccionado" list is the small one (source holds the whole catalogue).
          return sels.some(s => s.options.length > 0 && s.options.length < 10
            && Array.from(s.options).some(o => n(o.textContent).includes(n(u))));
        }, uso);
        let ok = false;
        for (let attempt = 0; attempt < 6 && !ok; attempt++) {
          await source.selectOption(match.value);
          await modal.locator('button').filter({ hasText: /Agregar selección/ })
            .locator('visible=true').first().click();
          ok = await isMoved();
          if (!ok) {
            await source.waitFor({ state: 'visible' }).catch(() => undefined);
          }
        }
        if (!ok) {
          throw new Error(`Uso específico "${uso}" could not be moved to the selected list`);
        }
        // Let Angular's reactive-form model catch up with the moved uso before commit.
        await CofeprisRegistrationFlow.settle(800);
      }

      // Commit (single Agregar in the modal once the país/uso widgets have settled).
      await modal.getByRole('button', { name: /^\s*agregar\s*$/i }).click();
      await expect(modal).toBeHidden({ timeout: 15_000 });
      await new DynamicTable(page, 'Mercancías').expectRowExists(m.marcaComercial ?? m.denominacionDistintiva);
    });
  }

  /**
   * Advances Paso 1 → Paso 2 for procedures with no Pago de derechos tab
   * (e.g. the 3-tab 260604): a single Continuar with no "no requiere pago"
   * confirmation.
   */
  static async continueToPaso2(page: Page): Promise<void> {
    await CofeprisRegistrationFlow.continuarToPaso2(page, false);
  }

  /** Accept the Manifiestos y declaraciones declaration. */
  private static async acceptManifiestos(page: Page): Promise<void> {
    await Logger.step('Accept Manifiestos y declaraciones', async () => {
      await new Checkbox(page, 'manifesto', 'control').check();
    });
  }

  private static async setDatosPublicos(page: Page, value: string): Promise<void> {
    await Logger.step(`Set "hacer públicos los datos" = ${value}`, async () => {
      // Radio options carry no per-option label; they are keyed by id ("Si"/"No").
      await RadioButton.byId(page, value).select();
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
  }

  static async verifyRepresentanteAutofill(page: Page, d: RepresentanteLegalData): Promise<void> {
    await Logger.step('Verify representante legal autofill', async () => {
      await new TextField(page, 'representanteNombre', 'control').expectValue(d.nombre);
      await new TextField(page, 'apellidoPaterno', 'control').expectValue(d.apellidoPaterno);
      await new TextField(page, 'apellidoMaterno', 'control').expectValue(d.apellidoMaterno);
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
   * Adds a tercero via the modal identified by `modalId` (e.g. 'fabricanteModal',
   * 'destinatarioModal'). Optional data fields (segundo apellido, teléfono,
   * correo, CURP) are filled only when the data supplies them, so a procedure
   * that omits them behaves exactly as before.
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

      await modal.locator('[formcontrolname="rfc"]').fill(t.rfc);
      if (t.curp) {
        await modal.locator('[formcontrolname="curp"]').fill(t.curp);
      }
      await modal.locator('[formcontrolname="nombres"]').fill(t.nombre);
      await modal.locator('[formcontrolname="primerApellido"]').fill(t.primerApellido);
      if (t.segundoApellido) {
        await modal.locator('[formcontrolname="segundoApellido"]').fill(t.segundoApellido);
      }

      // Cascading selects — each populates after the previous is chosen.
      await CofeprisRegistrationFlow.selectByLabelInModal(modal, 'País', t.pais);
      await CofeprisRegistrationFlow.selectByLabelInModal(modal, 'Estado/localidad', t.estado);
      await CofeprisRegistrationFlow.selectByLabelInModal(modal, 'Municipio/alcaldía', t.municipio);
      await CofeprisRegistrationFlow.selectByLabelInModal(modal, 'Localidad', t.localidad);
      await CofeprisRegistrationFlow.selectByLabelInModal(modal, 'Código postal', t.codigoPostal);
      await CofeprisRegistrationFlow.selectByLabelInModal(modal, 'Colonia', t.colonia);

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
      await page.getByRole('button', { name: /continuar/i }).click();
      if (expectSkipModal) {
        // The "¿…no requiere los datos del Pago de derechos?" confirmation is a
        // role=dialog with an EMPTY heading (no accessible name), so it can't be
        // matched by title — scope to the visible dialog carrying its body text
        // and click SI.
        const dialog = page.getByRole('dialog')
          .filter({ hasText: /no requiere los datos del Pago de derechos/i });
        await expect(dialog).toBeVisible();
        await dialog.getByRole('button', { name: /^\s*s[íi]\s*$/i }).click();
        await expect(dialog).toBeHidden({ timeout: 15_000 });
      }
      await page.waitForLoadState('networkidle');
    });
  }
}
