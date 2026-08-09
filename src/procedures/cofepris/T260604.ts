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
  CofeprisRegistrationData,
  SolicitanteData,
  RepresentanteLegalData,
  TerceroData,
} from '../../types/cofepris';

/**
 * 260604 — Aviso de exportación de precursores químicos o productos químicos
 * esenciales (COFEPRIS).
 *
 * Unlike the medicamentos siblings this is a THREE-tab procedure (Solicitante,
 * Datos de la solicitud, Terceros relacionados — no Pago de derechos), and its
 * Mercancía modal is the precursores shape (marca comercial / DCI, porcentaje de
 * concentración, valor comercial, "Fecha de movimiento" calendar, País de
 * origen/destino/procedencia dropdowns). Its establecimiento has no
 * "RFC del responsable sanitario" field.
 *
 * The Datos tab is still driven by CofeprisRegistrationFlow.fillDatosSolicitud
 * (which fills rfcSanitario only when present) with the addMercanciaPrecursores
 * handler. Paso 1 advances straight to Paso 2 via Continuar (no Pago); Paso 2
 * takes one optional document ("Otro"), then Paso 3 firmar.
 */

export interface T260604Data extends CofeprisRegistrationData {
  /** The mandatory Facturador/Consignatario tercero (Terceros relacionados tab). */
  terceros: { facturador: TerceroData };
  /** Paso-2 optional documents (this trámite has no mandatory requisitos). */
  documents: DocumentData[];
}

export class T260604 {

  // ─── Assertion locators ───────────────────────────────────────────────────
  readonly procedureTitle: Locator;
  readonly folioMessage: Locator;
  readonly acuseDocument: Locator;

  constructor(private readonly page: Page) {
    this.procedureTitle = page.getByRole('heading', {
      name: /aviso de exportación de precursores químicos o productos químicos esenciales/i,
    });
    this.folioMessage = page.getByText(/tu solicitud ha sido registrada con el siguiente número de folio/i);
    this.acuseDocument = page.getByText('Acuse de recepción de trámite', { exact: false });
  }

  // ─── Navigation & structure ─────────────────────────────────────────────────

  async startNewSubmission(): Promise<void> {
    await SubmissionFlow.startNewSolicitud(this.page);
  }

  async open(code: string): Promise<void> {
    await Logger.step(`Open procedure ${code} from catalogue`, async () => {
      await this.page.evaluate((c) => {
        const row = Array.from(document.querySelectorAll('tr, .card, li'))
          .find(r => (r.textContent || '').includes(c));
        const action = row?.querySelector('button, a, [role=button], i, svg');
        (action as HTMLElement | undefined)?.click();
      }, code).catch(() => { /* navigation tore down the context — expected */ });
      await this.page.waitForURL(/contenedor-de-pasos|solicitud|importacion|exportacion|sanitario|precursor/i, { timeout: 60_000 });
      await this.page.waitForLoadState('domcontentloaded');
    });
  }

  /** Asserts every expected tab label is present on the form. */
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

  // ─── Datos de la solicitud tab (precursores) ───────────────────────────────

  async fillDatosSolicitud(data: T260604Data): Promise<void> {
    await CofeprisRegistrationFlow.fillDatosSolicitud(
      this.page, data, CofeprisRegistrationFlow.addMercanciaPrecursores,
    );
  }

  async verifyRepresentanteAutofill(d: RepresentanteLegalData): Promise<void> {
    await CofeprisRegistrationFlow.verifyRepresentanteAutofill(this.page, d);
  }

  // ─── Terceros relacionados tab (mandatory Facturador/Consignatario) ─────────

  async fillTerceros(data: T260604Data): Promise<void> {
    await new Tab(this.page).click('Terceros relacionados');
    await CofeprisRegistrationFlow.addFacturadorConsignatario(this.page, data.terceros.facturador);
  }

  // ─── No Pago tab → advance Paso 1 to Paso 2 ────────────────────────────────

  async continueToPaso2(): Promise<void> {
    await CofeprisRegistrationFlow.continueToPaso2(this.page);
  }

  // ─── Paso 2 — optional document upload ─────────────────────────────────────

  async uploadDocuments(documents: DocumentData[]): Promise<void> {
    for (const doc of documents) {
      await DocumentUploadFlow.uploadOptionalDocument(this.page, doc.type, doc.path);
    }
    await CofeprisRegistrationFlow.continueToPaso3(this.page);
  }

  // ─── Paso 3 — firmar ────────────────────────────────────────────────────────

  async sign(creds: EfirmaCredentials): Promise<void> {
    await SigningFlow.signSubmission(this.page, creds);
  }

  // ─── Acuse — capture folio + download document, persist both ───────────────

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
