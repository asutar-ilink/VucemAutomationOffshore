import { Page, expect } from '@playwright/test';
import path from 'path';
import { FileUpload } from '../components/form/FileUpload';
import { Tab } from '../components/layout/Tab';
import { Modal } from '../components/layout/Modal';
import { Logger } from '../utils/Logger';
import { DocumentData } from '../types';

/**
 * DocumentUploadFlow handles document uploads for procedure forms.
 *
 * VUCEM requires applicants to upload supporting documents
 * (acta constitutiva, poder notarial, etc.) in a dedicated 'Documentos' tab.
 *
 * This flow is identical across all procedures — only the required document
 * types differ, which is controlled by the data passed in from the procedure.
 */
export class DocumentUploadFlow {

  /**
   * Navigates to the Documentos tab and uploads all documents in the list.
   * Documents are uploaded in the order they appear in the array.
   */
  static async uploadAll(page: Page, documents: DocumentData[]): Promise<void> {
    await Logger.step('Navigate to Documentos tab', async () => {
      const tab = new Tab(page);
      await tab.click('Documentos');
    });

    for (const doc of documents) {
      await Logger.step(`Upload document: ${doc.type}`, async () => {
        // The section label in the UI comes from the document type
        const sectionLabel = DocumentUploadFlow.getUiLabel(doc.type);
        const uploader = new FileUpload(page, sectionLabel);
        await uploader.upload(doc.path);
      });
    }
  }

  /**
   * Upload variant used by COFEPRIS wizard procedures (e.g. 260204).
   *
   * Unlike uploadAll (one file-chooser + success icon per section), this flow
   * attaches every document's file to its section, then triggers a single
   * "Cargar archivos" action which raises a confirmation modal describing the
   * PDF requirements. Accepting that modal performs the upload.
   *
   * Sequence (manual TC10): attach files → "Cargar archivos" → confirm modal.
   */
  static async uploadAllWithConfirmation(page: Page, documents: DocumentData[]): Promise<void> {
    for (const doc of documents) {
      await Logger.step(`Attach document: ${doc.type}`, async () => {
        const sectionLabel = DocumentUploadFlow.getUiLabel(doc.type);
        // Each document is a row (label <span> + its own <input type="file">);
        // scope to the row carrying this label, then attach to its file input.
        const section = page.locator('div.row.py-3', { hasText: sectionLabel });
        await section.locator('input[type="file"]').setInputFiles(doc.path);
      });
    }

    await Logger.step('Confirm bulk upload (Cargar archivos)', async () => {
      await page.getByRole('button', { name: /cargar archivos/i }).first().click();
      const requirementsModal = new Modal(page, 'Carga de archivos');
      // The modal lists PDF requirements; its confirm button is also labelled
      // "Cargar archivos" (scoped to the dialog, so unambiguous).
      await requirementsModal.clickButton(/cargar archivos|aceptar|continuar/i);
    });
  }

  /**
   * Optional-document upload used by COFEPRIS Paso-2 screens that have NO
   * mandatory document rows — instead the applicant picks a type from a "Tipo de
   * documento" dropdown, clicks "Agregar" to add a row, attaches a file, then
   * commits with "Cargar archivos" (which raises the PDF-requirements
   * confirmation modal). Used by 260210 (manual TC 16711).
   *
   * Sequence: select type → Agregar → attach file → "Cargar archivos" → confirm.
   */
  static async uploadOptionalDocument(page: Page, docType: string, filePath: string): Promise<void> {
    await Logger.step(`Add optional document type: ${docType}`, async () => {
      // "Tipo de documento" is an <ng-select> (custom searchable combobox), not a
      // native <select>: open it, then pick the requested option — or the first
      // real one, since the manual only needs any document type (TC 16711).
      const combo = page.locator('ng-select:visible').first();
      await combo.click();
      const options = page.locator('.ng-dropdown-panel .ng-option');
      await options.first().waitFor({ state: 'visible', timeout: 15_000 });
      const wanted = options.filter({
        hasText: new RegExp(docType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
      }).first();
      const target = (await wanted.count()) > 0 ? wanted : options.first();
      await target.click();
      // ng-select-multiple keeps the panel open; close it before clicking Agregar.
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: /^\s*agregar\s*$/i }).first().click();
    });

    await Logger.step('Attach and upload optional document', async () => {
      // Attach the file to the newly-added row's file input; the bottom "Cargar
      // archivos" button enables once a file is present.
      await page.locator('input[type="file"]').last()
        .setInputFiles(path.resolve(process.cwd(), filePath));
      await page.getByRole('button', { name: /^\s*cargar archivos\s*$/i }).first().click();
      // A PDF-requirements confirmation dialog appears; its confirm button is also
      // labelled "Cargar archivos". The dialog carries no accessible name, so scope
      // to the visible dialog by its body text rather than by title.
      const dialog = page.getByRole('dialog').filter({ hasText: /cargar|archivo|pdf/i }).last();
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: /cargar archivos|aceptar|continuar/i }).click();
      await expect(dialog).toBeHidden({ timeout: 30_000 });
    });
  }

  /**
   * Verifies that all required documents have been uploaded successfully.
   * Call this after uploadAll to confirm everything went through.
   */
  static async verifyAllUploaded(page: Page, documents: DocumentData[]): Promise<void> {
    await Logger.step('Verify all documents uploaded', async () => {
      for (const doc of documents) {
        const sectionLabel = DocumentUploadFlow.getUiLabel(doc.type);
        const uploader = new FileUpload(page, sectionLabel);
        await uploader.expectUploadSuccess();
      }
    });
  }

  /**
   * Maps a document type key to its visible label in the VUCEM UI.
   * Centralised here so procedures don't embed UI strings.
   *
   * When VUCEM changes a document label, update it here once.
   */
  private static getUiLabel(documentType: string): string {
    const labels: Record<string, string> = {
      acta_constitutiva:      'Acta Constitutiva',
      poder_notarial:         'Poder Notarial',
      identificacion_oficial: 'Identificación Oficial',
      comprobante_domicilio:  'Comprobante de Domicilio',
      solicitud_firmada:      'Solicitud Firmada',
      dictamen_tecnico:       'Dictamen Técnico',
      registro_sanitario:     'Registro Sanitario',

      // ─── COFEPRIS 260204 — Permiso sanitario de importación de medicamentos ──
      // Match the visible span text (which is suffixed with "*:"); use a
      // period-free substring so hasText matches regardless of the label's punctuation.
      licencia_sanitaria_o_aviso: 'Licencia Sanitaria o Aviso de Funcionamiento',
      licencia_sanitaria_vigente: 'Licencia Sanitaria vigente con el giro correspondiente',
      // 260202 (materias primas) combines licencia + aviso de funcionamiento in a
      // single row ("Licencia Sanitaria vigente, con el giro correspondiente o …
      // Aviso de funcionamiento") — the comma breaks the 260204 substring, so use
      // the shorter distinctive prefix which matches only this row.
      licencia_o_aviso_funcionamiento: 'Licencia Sanitaria vigente',
      aviso_responsable:          'Aviso de responsable',
      registro_sanitario_vigente: 'Registro Sanitario vigente y sus modificaciones',
      proyectos_de_marbete:       'Proyectos de marbete.',
      pago_de_derechos:           'Pago de derechos',
      // ─── COFEPRIS 260501 — Permiso de importación de plaguicidas ────────────
      // Distinctive substrings of the three mandatory Paso-2 requisitos.
      personalidad_juridica:            'personalidad jurídica del promovente',
      aviso_o_licencia_sanitaria:       'Aviso de funcionamiento o número de licencia sanitaria',
      registro_sanitario_actualizado:   'registro sanitario actualizado del producto',

      // 260215 (dispositivos médicos, investigación) mandatory requisito.
      carta_tecnica:              'Carta técnica del producto',
      // 260205 (medicamentos y materias primas, investigación) mandatory requisito
      // (distinctive prefix of a long label).
      oficio_protocolo_investigacion: 'Oficio de aprobación del protocolo de investigación',
      otro:                       'Otro',
    };

    const label = labels[documentType];
    if (!label) {
      throw new Error(
        `Unknown document type: "${documentType}". ` +
        `Add it to DocumentUploadFlow.getUiLabel().`
      );
    }
    return label;
  }
}
