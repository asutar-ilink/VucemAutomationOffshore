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
 * 260210 — Permiso sanitario de importación de medicamentos destinados a
 * pruebas de laboratorio (COFEPRIS).
 *
 * Registration journey (manual TC 16659–16714): same four form tabs as its
 * sibling 260204 (Solicitante, Datos de la solicitud, Terceros relacionados,
 * Pago de derechos) followed by the 3-step wizard (Paso 1 form → Paso 2
 * documents → Paso 3 firmar → Acuse).
 *
 * The Paso-1 form and the Terceros modals are byte-identical to 260204, so that
 * shared behaviour is driven from CofeprisRegistrationFlow. This class holds
 * only 260210's specifics:
 *   - it adds a single tercero (Destinatario destino final),
 *   - Pago de derechos is not required, so it skips it,
 *   - Paso 2 has NO mandatory documents — one optional document is added via the
 *     "Tipo de documento" dropdown, then uploaded (manual TC 16711),
 *   - after signing it captures the generated folio and downloads the acuse,
 *     persisting both under executed-procedure-artifacts/ via ArtifactStore.
 */

export interface T260210Data extends CofeprisRegistrationData {
  /** The only tercero this procedure requires (manual TC 16708). */
  destinatario: TerceroData;
  /** The optional Paso-2 document (type label + file path). */
  optionalDocument: DocumentData;
}

export class T260210 {

  // ─── Assertion locators ───────────────────────────────────────────────────
  readonly procedureTitle: Locator;
  readonly folioMessage: Locator;
  readonly acuseDocument: Locator;

  constructor(private readonly page: Page) {
    this.procedureTitle = page.getByRole('heading', {
      name: /permiso sanitario de importación de medicamentos destinados a pruebas de laboratorio/i,
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
   * Opens the 260210 row from the catalogue → routes to the wizard container.
   * 260210 lands on `.../contenedor-de-pasos`, so wait for that (or the generic
   * solicitud route) rather than the 260204-only "solicitud" URL.
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

  async fillDatosSolicitud(data: T260210Data): Promise<void> {
    await CofeprisRegistrationFlow.fillDatosSolicitud(this.page, data);
  }

  async verifyRepresentanteAutofill(d: RepresentanteLegalData): Promise<void> {
    await CofeprisRegistrationFlow.verifyRepresentanteAutofill(this.page, d);
  }

  // ─── Terceros relacionados tab ─────────────────────────────────────────────

  /** 260210 requires only the Destinatario (destino final). */
  async fillTerceros(data: T260210Data): Promise<void> {
    await new Tab(this.page).click('Terceros relacionados');
    await CofeprisRegistrationFlow.addTercero(this.page, 'destinatarioModal', data.destinatario);
  }

  // ─── Pago de derechos — not required → skip to Paso 2 ──────────────────────

  async skipPagoAndContinue(): Promise<void> {
    await CofeprisRegistrationFlow.skipPagoAndContinue(this.page);
  }

  // ─── Paso 2 — optional document upload ─────────────────────────────────────

  async uploadOptionalDocument(doc: DocumentData): Promise<void> {
    await DocumentUploadFlow.uploadOptionalDocument(this.page, doc.type, doc.path);
    await Logger.step('Continue to Paso 3', async () => {
      await this.page.getByRole('button', { name: /continuar/i }).click();
      await this.page.waitForLoadState('networkidle');
    });
  }

  // ─── Paso 3 — firmar ────────────────────────────────────────────────────────

  async sign(creds: EfirmaCredentials): Promise<void> {
    await SigningFlow.signSubmission(this.page, creds);
  }

  // ─── Acuse — capture folio + download document, persist both ───────────────

  /**
   * Reads the generated folio from the acuse success message and appends it to
   * executed-procedure-artifacts/folios.txt as "<code> <folio>". Folios are a
   * long (~25-digit) run, so extract that from the message region.
   */
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
   * Returns the saved absolute path.
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
