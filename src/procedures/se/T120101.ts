import { Page, Locator, expect } from '@playwright/test';
import { SubmissionFlow } from '../../flows/SubmissionFlow';
import { SigningFlow } from '../../flows/SigningFlow';
import { CofeprisRegistrationFlow } from '../../flows/CofeprisRegistrationFlow';
import { Tab } from '../../components/layout/Tab';
import { TextField } from '../../components/form/TextField';
import { Logger } from '../../utils/Logger';
import { ArtifactStore } from '../../utils/ArtifactStore';
import { EfirmaCredentials } from '../../types';
import { SolicitanteData } from '../../types/cofepris';

export interface ConsultarCupoData {
  tipo: string;
  pais: string;
  fraccionArancelaria: string;
  cupoNombre: string;
  estadoRepresentacion: string;
  municipioRepresentacion: string;
  descripcionBienFinal: string;
}

export interface InsumoData {
  descripcion: string;
  fraccion: string;
  cantidad: string;
  unidad: string;
}

export interface ProcesoProductivoData {
  checkboxIndex: string;
  paisOrigen: string;
  pais: string;
}

export interface T120101Data {
  procedureCode: string;
  procedureTitle: string;
  tabs: string[];
  solicitante: SolicitanteData;
  consultarCupo: ConsultarCupoData;
  insumos: InsumoData[];
  procesoProductivo: ProcesoProductivoData;
}

export class T120101 {

  // ─── Assertion locators ───────────────────────────────────────────────────
  readonly procedureTitle: Locator;
  readonly folioMessage: Locator;
  readonly acuseDocument: Locator;

  // SE TPL positional selects — codegen-derived; no accessible label or id exposed
  private readonly tipoCupoSelect: Locator;
  private readonly paisTratadoSelect: Locator;
  private readonly buscarBtn: Locator;
  private readonly estadoRepFedSelect: Locator;
  private readonly municipioRepFedSelect: Locator;
  private readonly continuarBtn: Locator;
  private readonly agregarInsumoBtn: Locator;
  private readonly cantidadInsumoSelect: Locator;
  private readonly unidadInsumoSelect: Locator;
  private readonly modalAgregarBtn: Locator;
  private readonly procesoOrigenSelect: Locator;
  private readonly procesoPaisSelect: Locator;

  constructor(private readonly page: Page) {
    this.procedureTitle = page.getByRole('heading', { name: /inscripción en el registro de bienes textiles/i });
    this.folioMessage   = page.getByText(/tu solicitud ha sido registrada con el siguiente número de folio/i);
    this.acuseDocument  = page.getByText('Acuse de recepción de trámite', { exact: false });

    // Consultar cupo
    this.tipoCupoSelect       = page.locator('div:nth-of-type(2) > div:nth-of-type(2) select').first();
    this.paisTratadoSelect    = page.locator('paso-uno > div > div > div:nth-of-type(1) div:nth-of-type(3) select');
    this.buscarBtn            = page.locator('paso-uno > div > div > div:nth-of-type(1) button');
    this.estadoRepFedSelect   = page.locator('representacion-federal div:nth-of-type(2) > div:nth-of-type(1) select');
    this.municipioRepFedSelect = page.locator('representacion-federal div:nth-of-type(2) > div:nth-of-type(2) select');
    this.continuarBtn         = page.locator('btn-continuar button.btn-primary');
    // Insumos
    this.agregarInsumoBtn     = page.locator('app-insumos div:nth-of-type(2) button:nth-of-type(3)');
    this.cantidadInsumoSelect = page.locator('paso-uno > div > div > div:nth-of-type(2) div:nth-of-type(3) select');
    this.unidadInsumoSelect   = page.locator('paso-uno > div > div > div:nth-of-type(2) div:nth-of-type(4) select');
    this.modalAgregarBtn      = page.locator('#modalAddAgentMercancias button:nth-of-type(2)');
    // Proceso productivo
    this.procesoOrigenSelect  = page.locator('div:nth-of-type(3) div.row > div:nth-of-type(1) select');
    this.procesoPaisSelect    = page.locator('div:nth-of-type(3) div.row > div:nth-of-type(2) select');
  }

  // ─── Navigation ───────────────────────────────────────────────────────────

  async startNewSubmission(): Promise<void> {
    await SubmissionFlow.startNewSolicitud(this.page);
  }

  async open(code: string): Promise<void> {
    await SubmissionFlow.openProcedureFromCatalogue(this.page, code);
  }

  // ─── Structure ───────────────────────────────────────────────────────────

  async expectTabsPresent(tabLabels: string[]): Promise<void> {
    await Logger.step('Verify all procedure tabs are present', async () => {
      for (const label of tabLabels) {
        await expect(this.page.getByText(label, { exact: true }).first()).toBeVisible();
      }
    });
  }

  // ─── Solicitante tab (prefilled, read-only) ───────────────────────────────

  async verifySolicitante(data: SolicitanteData): Promise<void> {
    await CofeprisRegistrationFlow.verifySolicitante(this.page, data);
  }

  // ─── Consultar cupo tab ───────────────────────────────────────────────────

  async fillConsultarCupo(data: ConsultarCupoData): Promise<void> {
    await Logger.step('Fill Consultar cupo tab', async () => {
      await new Tab(this.page).click('Consultar cupo');

      await this.tipoCupoSelect.selectOption(data.tipo);
      await this.paisTratadoSelect.selectOption(data.pais);
      await new TextField(this.page, 'fraccionArancelaria', 'id').fill(data.fraccionArancelaria);
      await this.buscarBtn.click();

      await this.page.getByText(data.cupoNombre).first().dblclick();

      await this.estadoRepFedSelect.selectOption(data.estadoRepresentacion);
      await this.municipioRepFedSelect.selectOption(data.municipioRepresentacion);
      await new TextField(this.page, 'descripcionBienFinal', 'id').fill(data.descripcionBienFinal);
      await this.continuarBtn.click();
    });
  }

  // ─── Insumos tab ─────────────────────────────────────────────────────────

  async fillInsumos(insumos: InsumoData[]): Promise<void> {
    await Logger.step('Fill Insumos tab', async () => {
      await new Tab(this.page).click('Insumos');
      for (const insumo of insumos) {
        await this.agregarInsumoBtn.click();
        await new TextField(this.page, 'descripcionInsumo', 'id').fill(insumo.descripcion);
        await new TextField(this.page, 'fraccion', 'id').fill(insumo.fraccion);
        // Tab-blur triggers Angular's change detection on fraccion without dismissing the modal
        await this.page.keyboard.press('Tab');
        await this.cantidadInsumoSelect.selectOption(insumo.cantidad);
        await this.unidadInsumoSelect.selectOption(insumo.unidad);
        await this.modalAgregarBtn.click();
      }
    });
  }

  // ─── Proceso productivo tab ───────────────────────────────────────────────

  async fillProcesoProductivo(data: ProcesoProductivoData): Promise<void> {
    await Logger.step('Fill Proceso productivo tab', async () => {
      await new Tab(this.page).click('Proceso productivo');
      // id="1" starts with a digit — use attribute selector to avoid invalid CSS
      await this.page.locator(`[id="${data.checkboxIndex}"]`).check();
      await this.procesoOrigenSelect.selectOption(data.paisOrigen);
      await this.procesoPaisSelect.selectOption(data.pais);
      await this.continuarBtn.click();
    });
  }

  // ─── Paso 3 — firmar ──────────────────────────────────────────────────────

  async sign(creds: EfirmaCredentials): Promise<void> {
    await SigningFlow.signSubmission(this.page, creds);
  }

  // ─── Acuse — capture folio + download document, persist both ─────────────

  async captureFolio(procedureCode: string): Promise<string> {
    return Logger.step('Capture generated folio', async () => {
      await expect(this.folioMessage).toBeVisible();
      const text = await this.page.locator('body').innerText();
      const match = text.match(/n[úu]mero de folio[^\d]*(\d{10,})/i) ?? text.match(/(\d{18,})/);
      if (!match) {
        throw new Error('Could not extract folio number from the acuse page');
      }
      const folio = match[1];
      await ArtifactStore.saveFolio(procedureCode, folio);
      return folio;
    });
  }

  async downloadAndSaveAcuse(procedureCode: string): Promise<string> {
    return Logger.step('Download and save Acuse de recepción de trámite', async () => {
      const downloadPromise = this.page.waitForEvent('download');
      await this.page
        .getByRole('row', { name: /acuse de recepción de trámite/i })
        .getByRole('button')
        .click();
      const download = await downloadPromise;
      return ArtifactStore.saveDocument(procedureCode, download);
    });
  }
}
