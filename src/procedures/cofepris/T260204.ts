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
  PagoData,
} from '../../types/cofepris';

/**
 * 260204 — Permiso sanitario de importación de medicamentos con registro
 * sanitario (COFEPRIS).
 *
 * Covers the citizen registration journey (manual TC01–TC13): the procedure
 * has four form tabs (Solicitante, Datos de la solicitud, Terceros
 * relacionados, Pago de derechos) followed by a 3-step wizard
 * (Paso 1 form → Paso 2 documents → Paso 3 firmar → Acuse).
 *
 * The Paso-1 form and the Terceros modals are shared with sibling COFEPRIS
 * medicamento procedures (e.g. 260210), so that behaviour lives in
 * CofeprisRegistrationFlow. This class keeps only what is specific to 260204:
 * its tab set, which terceros it adds (fabricante + destinatario), its Pago
 * handling, its mandatory-document upload, and its assertion locators.
 */

// ─── Procedure-specific data shape ────────────────────────────────────────────

export interface T260204Data extends CofeprisRegistrationData {
  terceros: { fabricante: TerceroData; destinatario: TerceroData };
  pago: PagoData;
  documents: DocumentData[];
}

export class T260204 {
  // ─── Assertion locators (TC05 / TC12 / TC13) ────────────────────────────────
  readonly procedureTitle: Locator;
  readonly folioMessage: Locator;
  readonly acuseDocument: Locator;

  constructor(private readonly page: Page) {
    this.procedureTitle = page.getByRole('heading', {
      name: /permiso sanitario de importación de medicamentos/i,
    });
    this.folioMessage = page.getByText(
      /tu solicitud ha sido registrada con el siguiente número de folio/i
    );
    this.acuseDocument = page.getByText('Acuse de recepción de trámite', { exact: false });
  }

  // ─── Navigation & structure (TC03–TC05) ──────────────────────────────────────

  /**
   * Prerequisite (TC03–TC04): from the bandeja de tareas pendientes, navigate
   * Trámites → Solicitudes nuevas, landing on the selección-de-trámite catalogue.
   */
  async startNewSubmission(): Promise<void> {
    await SubmissionFlow.startNewSolicitud(this.page);
  }

  /** TC04 — opens the 260204 row from the catalogue → routes to the form. */
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
    await Logger.step('Verify Solicitante prefilled details', async () => {
      // Solicitante is the default section on form load. Fields are prefilled,
      // disabled inputs addressed by their real ids. #codigoPostal is duplicated
      // (the establecimiento copy carries a formcontrolname); the solicitante
      // field is the one without it.
      await expect(this.page.locator('#rfc')).toHaveValue(data.rfc);
      await expect(this.page.locator('#razonSocial')).toHaveValue(data.razonSocial);
      await expect(this.page.locator('#correo')).toHaveValue(data.correo);
      await expect(this.page.locator('#estado')).toHaveValue(data.estado);
      await expect(this.page.locator('#codigoPostal:not([formcontrolname])')).toHaveValue(
        data.codigoPostal
      );
    });
  }

  // ─── TC07 — Datos de la solicitud tab (shared COFEPRIS form) ──────────────────

  async fillDatosSolicitud(data: T260204Data): Promise<void> {
    await CofeprisRegistrationFlow.fillDatosSolicitud(this.page, data);
  }

  async verifyRepresentanteAutofill(d: RepresentanteLegalData): Promise<void> {
    await CofeprisRegistrationFlow.verifyRepresentanteAutofill(this.page, d);
  }

  // ─── TC08 — Terceros relacionados tab ─────────────────────────────────────────

  async fillTerceros(data: T260204Data): Promise<void> {
    await new Tab(this.page).click('Terceros relacionados');
    await CofeprisRegistrationFlow.addTercero(
      this.page,
      'fabricanteModal',
      data.terceros.fabricante
    );
    await CofeprisRegistrationFlow.addTercero(
      this.page,
      'destinatarioModal',
      data.terceros.destinatario
    );
  }

  // ─── TC09 — Pago de derechos tab ──────────────────────────────────────────────

  /** TC09 (16723) — fill all payment fields, then Continuar to Paso 2. */
  async fillPago(d: PagoData): Promise<void> {
    await CofeprisRegistrationFlow.fillPago(this.page, d);
  }

  /** TC09 (16635) — skip payment: Continuar → confirm "no requiere pago" modal → SI. */
  async skipPagoAndContinue(): Promise<void> {
    await CofeprisRegistrationFlow.skipPagoAndContinue(this.page);
  }

  // ─── TC10 — Paso 2 documents ──────────────────────────────────────────────────

  async uploadDocuments(documents: DocumentData[]): Promise<void> {
    await DocumentUploadFlow.uploadAllWithConfirmation(this.page, documents);
    await CofeprisRegistrationFlow.continueToPaso3(this.page);
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

  /**
   * TC13 — downloads the "Acuse de recepción de trámite" document and saves it
   * under executed-procedure-artifacts/documents/ with the procedure code
   * appended (mirrors 260203's behaviour via ArtifactStore).
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
