import { Page, Locator, expect } from '@playwright/test';
import { SubmissionFlow } from '../../flows/SubmissionFlow';
import { DocumentUploadFlow } from '../../flows/DocumentUploadFlow';
import { SigningFlow } from '../../flows/SigningFlow';
import { CofeprisRegistrationFlow } from '../../flows/CofeprisRegistrationFlow';
import { Tab } from '../../components/layout/Tab';
import { Logger } from '../../utils/Logger';
import { ArtifactStore } from '../../utils/ArtifactStore';
import { EfirmaCredentials, DocumentData } from '../../types';
import {
  PlaguicidasSolicitudData,
  SolicitanteData,
  RepresentanteLegalData,
  TerceroData,
  PagoData,
} from '../../types/cofepris';

/**
 * 260501 — Permiso de importación de plaguicidas (COFEPRIS).
 *
 * Citizen registration journey (manual TC01–TC13): four form tabs
 * (Solicitante, Datos de la solicitud, Terceros relacionados, Pago de derechos)
 * followed by the 3-step wizard (Paso 1 form → Paso 2 documents → Paso 3 firmar
 * → Acuse).
 *
 * The plaguicidas Datos-de-la-solicitud tab diverges from the medicamentos
 * siblings (establecimiento field names, a `<crosslist>` Aduanas de entrada, a
 * distinct Mercancía modal with Clasificación toxicológica / Objeto de la
 * importación and four país dual-lists, the `mensaje` manifiestos checkbox, and
 * a Buscar-driven representante legal). That behaviour lives in
 * CofeprisRegistrationFlow.*Plaguicidas; this class keeps only what is specific
 * to 260501: its three terceros (fabricante, formulador, proveedor), the
 * pago-skip, its mandatory-document upload, and its assertion locators.
 */

// ─── Procedure-specific data shape ────────────────────────────────────────────

export interface T260501Data extends PlaguicidasSolicitudData {
  procedureCode: string;
  procedureTitle: string;
  tabs: string[];
  solicitante: SolicitanteData;
  terceros: { fabricante: TerceroData; formulador: TerceroData; proveedor: TerceroData };
  pago: PagoData;
  documents: DocumentData[];
}

export class T260501 {
  // ─── Assertion locators (TC05 / TC12 / TC13) ────────────────────────────────
  readonly procedureTitle: Locator;
  readonly folioMessage: Locator;
  readonly acuseDocument: Locator;

  constructor(private readonly page: Page) {
    this.procedureTitle = page.getByRole('heading', {
      name: /permiso de importación de plaguicidas/i,
    });
    this.folioMessage = page.getByText(
      /tu solicitud ha sido registrada con el siguiente número de folio/i
    );
    this.acuseDocument = page.getByText('Acuse de recepción de trámite', { exact: false });
  }

  // ─── Navigation & structure (TC03–TC05) ──────────────────────────────────────

  async startNewSubmission(): Promise<void> {
    await SubmissionFlow.startNewSolicitud(this.page);
  }

  /** TC04 — opens the 260501 row from the catalogue → routes to the form. */
  async open(code: string): Promise<void> {
    await SubmissionFlow.openProcedureFromCatalogue(this.page, code);
  }

  /** TC05 — asserts every expected tab label is present on the form. */
  async expectTabsPresent(tabLabels: string[]): Promise<void> {
    await Logger.step('Verify all procedure tabs are present', async () => {
      for (const label of tabLabels) {
        await expect(this.page.getByText(label, { exact: true }).first()).toBeVisible();
      }
    });
  }

  // ─── TC06 — Solicitante tab (prefilled, read-only) ────────────────────────────

  async verifySolicitante(data: SolicitanteData): Promise<void> {
    await CofeprisRegistrationFlow.verifySolicitante(this.page, data);
  }

  // ─── TC07 — Datos de la solicitud tab ─────────────────────────────────────────

  async fillDatosSolicitud(data: T260501Data): Promise<void> {
    await CofeprisRegistrationFlow.fillDatosSolicitudPlaguicidas(this.page, data);
  }

  async verifyRepresentanteAutofill(d: RepresentanteLegalData): Promise<void> {
    await CofeprisRegistrationFlow.verifyRepresentanteAutofillPlaguicidas(this.page, d);
  }

  // ─── TC08 — Terceros relacionados tab (Fabricante, Formulador, Proveedor) ─────

  async fillTerceros(data: T260501Data): Promise<void> {
    await new Tab(this.page).click('Terceros relacionados');
    await CofeprisRegistrationFlow.addTerceroPlaguicidas(
      this.page, /agregar fabricante/i, data.terceros.fabricante);
    await CofeprisRegistrationFlow.addTerceroPlaguicidas(
      this.page, /agregar formulador/i, data.terceros.formulador);
    await CofeprisRegistrationFlow.addTerceroPlaguicidas(
      this.page, /agregar proveedor/i, data.terceros.proveedor);
  }

  // ─── TC09 — Pago de derechos tab (fill → Paso 2) ──────────────────────────────

  /**
   * Pago de derechos is mandatory for plaguicidas (unlike the manual's TC09
   * "skip" wording — the live form blocks Continuar with "Faltan campos por
   * capturar" and offers no skip confirmation), so all payment fields are filled.
   */
  async fillPago(d: PagoData): Promise<void> {
    await CofeprisRegistrationFlow.fillPagoPlaguicidas(this.page, d);
  }

  // ─── TC10 — Paso 2 documents ──────────────────────────────────────────────────

  async uploadDocuments(documents: DocumentData[]): Promise<void> {
    await DocumentUploadFlow.uploadAllWithConfirmation(this.page, documents);
    await Logger.step('Continue to Paso 3', async () => {
      await this.page.getByRole('button', { name: /continuar/i }).click();
      await this.page.waitForLoadState('networkidle');
    });
  }

  // ─── TC11 — Paso 3 firmar ─────────────────────────────────────────────────────

  async sign(creds: EfirmaCredentials): Promise<void> {
    await SigningFlow.signSubmission(this.page, creds);
  }

  // ─── Acuse — capture folio + download document, persist both ──────────────────

  /** TC12 — reads the generated folio from the acuse message and persists it. */
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

  /** TC13 — downloads the "Acuse de recepción de trámite" document and saves it. */
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
