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
 * 260205 — Permiso sanitario de importación de medicamentos y materias primas
 * destinados a investigación en humanos (COFEPRIS).
 *
 * A medicamentos-shaped sibling of 260215: same four tabs, same standard Datos
 * de la solicitud form (driven by CofeprisRegistrationFlow.fillDatosSolicitud
 * with the default addMercanciaMedicamentos handler — its Mercancía modal has
 * forma-farmacéutica but no número-de-registro, both handled conditionally). It
 * verifies the full prefilled Solicitante address, adds Fabricante +
 * Destinatario terceros, skips Pago, uploads the mandatory Paso-2 document, then
 * signs and persists the folio/acuse.
 *
 * (The manual only defines TC01–TC06; the Datos/Terceros/Pago/document values are
 * derived live and reuse 260215's proven catalogue-valid data.)
 */

export interface T260205Data extends CofeprisRegistrationData {
  terceros: { fabricante: TerceroData; destinatario: TerceroData };
  documents: DocumentData[];
}

export class T260205 {

  // ─── Assertion locators ───────────────────────────────────────────────────
  readonly procedureTitle: Locator;
  readonly folioMessage: Locator;
  readonly acuseDocument: Locator;

  constructor(private readonly page: Page) {
    this.procedureTitle = page.getByRole('heading', {
      name: /permiso sanitario de importación de medicamentos y materias primas destinados a investigación en humanos/i,
    });
    this.folioMessage = page.getByText(/tu solicitud ha sido registrada con el siguiente número de folio/i);
    this.acuseDocument = page.getByText('Acuse de recepción de trámite', { exact: false });
  }

  // ─── Navigation & structure ─────────────────────────────────────────────────

  /** From the bandeja, navigate Trámites → Solicitudes nuevas → catalogue. */
  async startNewSubmission(): Promise<void> {
    await SubmissionFlow.startNewSolicitud(this.page);
  }

  /** Opens the 260205 row from the catalogue → routes to the wizard container. */
  async open(code: string): Promise<void> {
    await Logger.step(`Open procedure ${code} from catalogue`, async () => {
      await this.page.evaluate((c) => {
        const row = Array.from(document.querySelectorAll('tr, .card, li'))
          .find(r => (r.textContent || '').includes(c));
        const action = row?.querySelector('button, a, [role=button], i, svg');
        (action as HTMLElement | undefined)?.click();
      }, code).catch(() => { /* navigation tore down the context — expected */ });
      await this.page.waitForURL(/contenedor-de-pasos|solicitud|importacion|sanitario/i, { timeout: 60_000 });
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

  // ─── Datos de la solicitud tab (shared medicamentos form) ──────────────────

  async fillDatosSolicitud(data: T260205Data): Promise<void> {
    await CofeprisRegistrationFlow.fillDatosSolicitud(this.page, data);
  }

  async verifyRepresentanteAutofill(d: RepresentanteLegalData): Promise<void> {
    await CofeprisRegistrationFlow.verifyRepresentanteAutofill(this.page, d);
  }

  // ─── Terceros relacionados tab ─────────────────────────────────────────────

  /** 260205 adds Fabricante and Destinatario. */
  async fillTerceros(data: T260205Data): Promise<void> {
    await new Tab(this.page).click('Terceros relacionados');
    await CofeprisRegistrationFlow.addTercero(this.page, 'fabricanteModal', data.terceros.fabricante);
    await CofeprisRegistrationFlow.addTercero(this.page, 'destinatarioModal', data.terceros.destinatario);
  }

  // ─── Pago de derechos — not required → skip to Paso 2 ──────────────────────

  async skipPagoAndContinue(): Promise<void> {
    await CofeprisRegistrationFlow.skipPagoAndContinue(this.page);
  }

  // ─── Paso 2 — mandatory document upload ────────────────────────────────────

  async uploadDocuments(documents: DocumentData[]): Promise<void> {
    await DocumentUploadFlow.uploadAllWithConfirmation(this.page, documents);
    await CofeprisRegistrationFlow.continueToPaso3(this.page);
  }

  // ─── Paso 3 — firmar ────────────────────────────────────────────────────────

  async sign(creds: EfirmaCredentials): Promise<void> {
    await SigningFlow.signSubmission(this.page, creds);
  }

  // ─── Acuse — capture folio + download document, persist both ───────────────

  /** Reads the generated folio from the acuse message and persists it. */
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

  /**
   * Downloads the "Acuse de recepción de trámite" document and saves it under
   * executed-procedure-artifacts/documents/ with the procedure code appended.
   */
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
