import { Download } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { Logger } from './Logger';

/**
 * ArtifactStore — persists the tangible outputs of a completed registration to
 * a stable, human-browsable location under the project root:
 *
 *   executed-procedure-artifacts/
 *     folios.txt            ← one line per run: "<procedureCode> <folio>"
 *     documents/            ← each downloaded acuse, saved with the procedure
 *                             code appended: e.g. "acuse-de-recibo_260210.pdf"
 *
 * A single folios.txt accumulates every procedure's folio (append-only), and
 * every generated document lands in the documents/ folder tagged by procedure,
 * so re-running a procedure keeps a full history rather than overwriting.
 */
export class ArtifactStore {
  private static readonly ROOT = path.resolve(process.cwd(), 'executed-procedure-artifacts');
  private static readonly FOLIOS_FILE = path.join(ArtifactStore.ROOT, 'folios.txt');
  private static readonly DOCUMENTS_DIR = path.join(ArtifactStore.ROOT, 'documents');

  /**
   * Appends "<procedureCode> <folio>" to the shared folios.txt (creating the
   * folder/file on first use).
   */
  static async saveFolio(procedureCode: string, folio: string): Promise<void> {
    fs.mkdirSync(ArtifactStore.ROOT, { recursive: true });
    fs.appendFileSync(ArtifactStore.FOLIOS_FILE, `${procedureCode} ${folio}\n`, 'utf8');
    Logger.info(`Folio saved: ${procedureCode} ${folio} → ${ArtifactStore.FOLIOS_FILE}`);
    // Surface the folio on the Allure report as the run's headline outcome.
    await Logger.attach(`Folio ${procedureCode}`, folio);
  }

  /**
   * Saves a downloaded document into documents/, appending the procedure code to
   * the file's base name (before the extension). Returns the absolute path.
   */
  static async saveDocument(procedureCode: string, download: Download): Promise<string> {
    fs.mkdirSync(ArtifactStore.DOCUMENTS_DIR, { recursive: true });
    const suggested = download.suggestedFilename();
    const ext = path.extname(suggested);
    const base = path.basename(suggested, ext);
    const target = path.join(ArtifactStore.DOCUMENTS_DIR, `${base}_${procedureCode}${ext}`);
    await download.saveAs(target);
    Logger.info(`Document saved: ${target}`);
    // Attach the acuse to the Allure report so it is downloadable from the run.
    await Logger.attachFile(`${base}_${procedureCode}${ext}`, target);
    return target;
  }
}
