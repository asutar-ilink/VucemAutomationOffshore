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
  MateriasPrimasSolicitudData,
  SolicitanteData,
  RepresentanteLegalData,
  TerceroData,
} from '../../types/cofepris';

/**
 * 260202 — Permiso sanitario de importación de materias primas (COFEPRIS).
 *
 * A materias-primas sibling of 260203/260204: the same four form tabs
 * (Solicitante, Datos de la solicitud, Terceros relacionados, Pago de derechos)
 * and 3-step wizard (Paso 1 form → Paso 2 documents → Paso 3 firmar → Acuse),
 * with login handled by the authenticatedPage fixture.
 *
 * The Datos-de-la-solicitud tab diverges from the medicamentos siblings (see
 * CofeprisRegistrationFlow.fillDatosSolicitudMateriasPrimas): it adds several
 * S.C.I.A.N. claves and deletes one, declares an "Aviso de funcionamiento"
 * (a checkbox that disables the licencia field) instead of a licencia value,
 * ticks the AIFA→AICM checkbox, and adds several Mercancía records and deletes
 * one. Its Mercancía modal is the medicamentos shape (no Número de registro
 * field), so it uses the default addMercanciaMedicamentos handler.
 *
 * This class holds only 260202's specifics: its data shape, the terceros it adds
 * (fabricante + destinatario), skipping Pago, its document upload, and its
 * assertion locators.
 */

export interface T260202Data extends MateriasPrimasSolicitudData {
  procedureCode: string;
  procedureTitle: string;
  tabs: string[];
  solicitante: SolicitanteData;
  terceros: { fabricante: TerceroData; destinatario: TerceroData };
  /** Paso-2 mandatory documents (Requisitos obligatorios). */
  documents: DocumentData[];
}

export class T260202 {

  // ─── Assertion locators ───────────────────────────────────────────────────
  readonly procedureTitle: Locator;
  readonly folioMessage: Locator;
  readonly acuseDocument: Locator;

  constructor(private readonly page: Page) {
    this.procedureTitle = page.getByRole('heading', {
      name: /permiso sanitario de importación de materias primas/i,
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
   * Opens the 260202 row from the catalogue → routes to the wizard container.
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
      // Prefilled, disabled inputs addressed by their real ids. #codigoPostal is
      // duplicated (the establecimiento copy carries a formcontrolname); the
      // solicitante field is the one without it.
      await expect(this.page.locator('#rfc')).toHaveValue(data.rfc);
      await expect(this.page.locator('#razonSocial')).toHaveValue(data.razonSocial);
      await expect(this.page.locator('#correo')).toHaveValue(data.correo);
      await expect(this.page.locator('#estado')).toHaveValue(data.estado);
      await expect(this.page.locator('#codigoPostal:not([formcontrolname])')).toHaveValue(data.codigoPostal);
    });
  }

  // ─── Datos de la solicitud tab (materias-primas variant) ───────────────────

  async fillDatosSolicitud(data: T260202Data): Promise<void> {
    await CofeprisRegistrationFlow.fillDatosSolicitudMateriasPrimas(this.page, data);
  }

  async verifyRepresentanteAutofill(d: RepresentanteLegalData): Promise<void> {
    await CofeprisRegistrationFlow.verifyRepresentanteAutofill(this.page, d);
  }

  // ─── Terceros relacionados tab ─────────────────────────────────────────────

  /** 260202 adds both terceros: Fabricante and Destinatario. */
  async fillTerceros(data: T260202Data): Promise<void> {
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
