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
 * 260203 — Permiso sanitario de importación de medicamentos (COFEPRIS).
 *
 * A sibling of 260204 / 260210: the same four form tabs (Solicitante, Datos de
 * la solicitud, Terceros relacionados, Pago de derechos) followed by the 3-step
 * wizard (Paso 1 form → Paso 2 documents → Paso 3 firmar → Acuse).
 *
 * The Paso-1 form and the Terceros modals are shared with its siblings, so that
 * behaviour is driven from CofeprisRegistrationFlow. This class holds only
 * 260203's specifics:
 *   - it adds a single Destinatario tercero,
 *   - Pago de derechos is skipped,
 *   - Paso 2 takes one optional document (added via the "Tipo de documento"
 *     ng-select), and
 *   - after signing it captures the folio and downloads the acuse, persisting
 *     both under executed-procedure-artifacts/ via ArtifactStore.
 */

export interface T260203Data extends CofeprisRegistrationData {
  /** Both terceros are mandatory for 260203 (Fabricante* + Destinatario*). */
  fabricante: TerceroData;
  destinatario: TerceroData;
  /** Paso-2 mandatory documents (Requisitos obligatorios). */
  documents: DocumentData[];
}

export class T260203 {

  // ─── Assertion locators ───────────────────────────────────────────────────
  readonly procedureTitle: Locator;
  readonly folioMessage: Locator;
  readonly acuseDocument: Locator;

  constructor(private readonly page: Page) {
    this.procedureTitle = page.getByRole('heading', {
      name: /materias primas destinadas a la elaboración de medicamentos/i,
    });
    this.folioMessage = page.getByText(/tu solicitud ha sido registrada con el siguiente número de folio/i);
    this.acuseDocument = page.getByText('Acuse de recepción de trámite', { exact: false });
  }

  // ─── Navigation & structure ─────────────────────────────────────────────────

  /** From the bandeja, navigate Trámites → Solicitudes nuevas → catalogue. */
  async startNewSubmission(): Promise<void> {
    await SubmissionFlow.startNewSolicitud(this.page);
  }

  /**
   * Opens the 260203 row from the catalogue → routes to the wizard container.
   * Wait for the wizard/solicitud route rather than a procedure-specific URL.
   */
  async open(code: string): Promise<void> {
    await Logger.step(`Open procedure ${code} from catalogue`, async () => {
      await this.page.evaluate((c) => {
        const row = Array.from(document.querySelectorAll('tr, .card, li'))
          .find(r => (r.textContent || '').includes(c));
        const action = row?.querySelector('button, a, [role=button], i, svg');
        (action as HTMLElement | undefined)?.click();
      }, code).catch(() => { /* navigation tore down the context — expected */ });
      await this.page.waitForURL(/contenedor-de-pasos|solicitud/i, { timeout: 60_000 });
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
    await Logger.step('Verify Solicitante prefilled details', async () => {
      await expect(this.page.locator('#rfc')).toHaveValue(data.rfc);
      await expect(this.page.locator('#razonSocial')).toHaveValue(data.razonSocial);
      await expect(this.page.locator('#correo')).toHaveValue(data.correo);
      await expect(this.page.locator('#estado')).toHaveValue(data.estado);
      await expect(this.page.locator('#codigoPostal:not([formcontrolname])')).toHaveValue(data.codigoPostal);
    });
  }

  // ─── Datos de la solicitud tab (shared COFEPRIS form) ──────────────────────

  async fillDatosSolicitud(data: T260203Data): Promise<void> {
    // 260203 is a materias-primas procedure — its Mercancía modal uses the
    // detalle sub-form variant rather than the medicamentos default.
    await CofeprisRegistrationFlow.fillDatosSolicitud(
      this.page, data, CofeprisRegistrationFlow.addMercanciaMateriasPrimas,
    );
  }

  async verifyRepresentanteAutofill(d: RepresentanteLegalData): Promise<void> {
    await CofeprisRegistrationFlow.verifyRepresentanteAutofill(this.page, d);
  }

  // ─── Terceros relacionados tab ─────────────────────────────────────────────

  /** 260203 requires both mandatory terceros: Fabricante and Destinatario. */
  async fillTerceros(data: T260203Data): Promise<void> {
    await new Tab(this.page).click('Terceros relacionados');
    await CofeprisRegistrationFlow.addTercero(this.page, 'fabricanteModal', data.fabricante);
    await CofeprisRegistrationFlow.addTercero(this.page, 'destinatarioModal', data.destinatario);
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
      // The Descargar control is an icon button with no accessible name; the
      // acuse row has exactly one button, so locate it without a name filter.
      await this.page
        .getByRole('row', { name: /acuse de recepción de trámite/i })
        .getByRole('button')
        .click();
      const download = await downloadPromise;
      return ArtifactStore.saveDocument(procedureCode, download);
    });
  }
}
