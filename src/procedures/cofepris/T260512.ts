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
  ToxicasSolicitudData,
  SolicitanteData,
  RepresentanteLegalData,
  PagoData,
} from '../../types/cofepris';

/**
 * 260512 — Permiso de importación de sustancias tóxicas (COFEPRIS).
 *
 * Citizen registration journey (manual TC01–TC06): four form tabs
 * (Solicitante, Datos de la solicitud, Terceros relacionados, Pago de derechos)
 * followed by the 3-step wizard (Paso 1 form → Paso 2 documents → Paso 3 firmar
 * → Acuse).
 *
 * A sibling of plaguicidas (260501): the Datos-de-la-solicitud tab reuses the
 * plaguicidas establecimiento / S.C.I.A.N. / Aduanas-de-entrada / manifiestos /
 * representante building blocks, diverging only in its own Mercancía modal shape
 * (Número CAS, Estado físico, Clasificación toxicológica, Objeto de la
 * importación, país origen + procedencia) and an Aviso-de-funcionamiento
 * checkbox that coexists with the licencia. That behaviour lives in
 * CofeprisRegistrationFlow.*Toxicas / *Plaguicidas; this class keeps only what is
 * specific to 260512: it relates NO terceros (TC03), fills the mandatory Pago de
 * derechos (medicamentos-style fields), uploads its three mandatory documents,
 * and holds its assertion locators.
 */

// ─── Procedure-specific data shape ────────────────────────────────────────────

export interface T260512Data extends ToxicasSolicitudData {
  procedureCode: string;
  procedureTitle: string;
  tabs: string[];
  solicitante: SolicitanteData;
  pago: PagoData;
  documents: DocumentData[];
}

export class T260512 {
  // ─── Assertion locators (TC01 / TC06) ───────────────────────────────────────
  readonly procedureTitle: Locator;
  readonly folioMessage: Locator;
  readonly acuseDocument: Locator;

  constructor(private readonly page: Page) {
    this.procedureTitle = page.getByRole('heading', {
      name: /permiso de importación de sustancias tóxicas/i,
    });
    this.folioMessage = page.getByText(
      /tu solicitud ha sido registrada con el siguiente número de folio/i
    );
    this.acuseDocument = page.getByText('Acuse de recepción de trámite', { exact: false });
  }

  // ─── Navigation & structure (TC04–TC05) ──────────────────────────────────────

  async startNewSubmission(): Promise<void> {
    await SubmissionFlow.startNewSolicitud(this.page);
  }

  /** TC05 — opens the 260512 row from the catalogue → routes to the form. */
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

  // ─── TC02 — Datos de la solicitud tab ─────────────────────────────────────────

  async fillDatosSolicitud(data: T260512Data): Promise<void> {
    await CofeprisRegistrationFlow.fillDatosSolicitudToxicas(this.page, data);
  }

  async verifyRepresentanteAutofill(d: RepresentanteLegalData): Promise<void> {
    await CofeprisRegistrationFlow.verifyRepresentanteAutofillPlaguicidas(this.page, d);
  }

  // ─── TC03 — Terceros relacionados tab (no terceros for this trámite) ──────────

  /**
   * TC03 — this trámite relates no terceros: the tab renders with no data
   * tables. Navigate to it and assert no result tables are shown.
   */
  async verifyNoTerceros(): Promise<void> {
    const tab = new Tab(this.page);
    await tab.click('Terceros relacionados');
    await Logger.step('Verify Terceros relacionados shows no tables', async () => {
      await tab.expectActive('Terceros relacionados');
      await expect(
        this.page.locator('.tab-pane:visible table:visible, [role="tabpanel"]:visible table:visible')
      ).toHaveCount(0);
    });
  }

  // ─── TC04 — Pago de derechos tab (mandatory; fill → Paso 2) ───────────────────

  /**
   * Pago de derechos is mandatory for 260512 (four tabs). Its fields use the
   * medicamentos formControlNames (claveReferencia / llavePago), so the shared
   * CofeprisRegistrationFlow.fillPago drives it.
   */
  async fillPago(d: PagoData): Promise<void> {
    await CofeprisRegistrationFlow.fillPago(this.page, d);
  }

  // ─── TC05 — Paso 2 documents ──────────────────────────────────────────────────

  async uploadDocuments(documents: DocumentData[]): Promise<void> {
    await DocumentUploadFlow.uploadAllWithConfirmation(this.page, documents);
    await CofeprisRegistrationFlow.continueToPaso3(this.page);
  }

  // ─── TC06 — Paso 3 firmar ─────────────────────────────────────────────────────

  async sign(creds: EfirmaCredentials): Promise<void> {
    await SigningFlow.signSubmission(this.page, creds);
  }

  // ─── Acuse — capture folio + download document, persist both ──────────────────

  /** TC06 — reads the generated folio from the acuse message and persists it. */
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

  /** TC06 — downloads the "Acuse de recepción de trámite" document and saves it. */
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
