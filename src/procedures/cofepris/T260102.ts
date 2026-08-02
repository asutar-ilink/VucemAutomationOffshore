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
  ConsumoPersonalSolicitudData,
  SolicitanteData,
  RepresentanteLegalData,
  TerceroData,
} from '../../types/cofepris';

/**
 * 260102 — Permiso sanitario de importación de productos de muestra o consumo
 * personal (para donación, investigación científica, pruebas de laboratorio y
 * exhibición) (COFEPRIS).
 *
 * Medicamentos-family structure (four tabs: Solicitante, Datos de la solicitud,
 * Terceros relacionados, Pago de derechos), but Pago is skipped ("no requiere
 * pago" → Sí). The Datos tab reuses the medicamentos building blocks with three
 * divergences handled in CofeprisRegistrationFlow.fillDatosSolicitudConsumoPersonal:
 * an Aviso-de-funcionamiento checkbox (coexists with the licencia), an AICM
 * checkbox revealed by the AIFA aduana, and its own Mercancía modal shape (Marca,
 * no denominación distintiva/común). Terceros = Fabricante (foreign) + Destinatario
 * (national). Paso 2 takes two mandatory documents, then Paso 3 firmar.
 *
 * NOTE: the manual's TC01 mislabels the title as "Permiso sanitario de importación
 * de medicamentos destinados a pruebas de laboratorio"; the live catalogue confirms
 * the real title used below.
 */

export interface T260102Data extends ConsumoPersonalSolicitudData {
  procedureCode: string;
  procedureTitle: string;
  tabs: string[];
  solicitante: SolicitanteData;
  terceros: { fabricante: TerceroData; destinatario: TerceroData };
  documents: DocumentData[];
}

export class T260102 {
  readonly procedureTitle: Locator;
  readonly folioMessage: Locator;
  readonly acuseDocument: Locator;

  constructor(private readonly page: Page) {
    this.procedureTitle = page.getByRole('heading', {
      name: /permiso sanitario de importación de productos de muestra o consumo personal/i,
    });
    this.folioMessage = page.getByText(/tu solicitud ha sido registrada con el siguiente número de folio/i);
    this.acuseDocument = page.getByText('Acuse de recepción de trámite', { exact: false });
  }

  async startNewSubmission(): Promise<void> {
    await SubmissionFlow.startNewSolicitud(this.page);
  }

  async open(code: string): Promise<void> {
    await SubmissionFlow.openProcedureFromCatalogue(this.page, code);
  }

  async expectTabsPresent(tabLabels: string[]): Promise<void> {
    await Logger.step('Verify all procedure tabs are present', async () => {
      for (const label of tabLabels) {
        await expect(this.page.getByText(label, { exact: true }).first()).toBeVisible();
      }
    });
  }

  async verifySolicitante(data: SolicitanteData): Promise<void> {
    await CofeprisRegistrationFlow.verifySolicitante(this.page, data);
  }

  async fillDatosSolicitud(data: T260102Data): Promise<void> {
    await CofeprisRegistrationFlow.fillDatosSolicitudConsumoPersonal(this.page, data);
  }

  async verifyRepresentanteAutofill(d: RepresentanteLegalData): Promise<void> {
    await CofeprisRegistrationFlow.verifyRepresentanteAutofill(this.page, d);
  }

  // ─── Terceros relacionados — Fabricante (foreign) + Destinatario (national) ──

  async fillTerceros(data: T260102Data): Promise<void> {
    await new Tab(this.page).click('Terceros relacionados');
    await CofeprisRegistrationFlow.addTercero(this.page, 'fabricanteModal', data.terceros.fabricante);
    await CofeprisRegistrationFlow.addTercero(this.page, 'destinatarioModal', data.terceros.destinatario);
  }

  // ─── Pago de derechos — skipped ("no requiere pago" → Sí → Paso 2) ──────────

  async skipPago(): Promise<void> {
    await CofeprisRegistrationFlow.skipPagoAndContinue(this.page);
  }

  // ─── Paso 2 — two mandatory documents ──────────────────────────────────────

  async uploadDocuments(documents: DocumentData[]): Promise<void> {
    await DocumentUploadFlow.uploadAllWithConfirmation(this.page, documents);
    await Logger.step('Continue to Paso 3', async () => {
      await this.page.getByRole('button', { name: /continuar/i }).click();
      await this.page.waitForLoadState('networkidle');
    });
  }

  async sign(creds: EfirmaCredentials): Promise<void> {
    await SigningFlow.signSubmission(this.page, creds);
  }

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
