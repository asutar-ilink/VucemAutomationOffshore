import { Page, expect } from '@playwright/test';
import path from 'path';

/**
 * Wrapper for file upload controls.
 *
 * Handles VUCEM's document upload pattern:
 * a button that opens a file chooser, followed by
 * a progress indicator and a success confirmation.
 *
 * The upload button is located by the document type label visible in the UI
 * (e.g. 'Acta Constitutiva'), not by a generic file input locator.
 */
export class FileUpload {
  private readonly page: Page;
  private readonly sectionLabel: string;

  constructor(page: Page, sectionLabel: string) {
    this.page = page;
    this.sectionLabel = sectionLabel;
  }

  /**
   * Uploads a file to the section identified by sectionLabel.
   * Waits for the upload to complete before returning.
   *
   * @param filePath Path relative to the project root.
   */
  async upload(filePath: string): Promise<void> {
    const absolutePath = path.resolve(process.cwd(), filePath);

    // Find the upload button within the section for this document type
    const section = this.page.locator('[data-section]', {
      hasText: this.sectionLabel,
    });

    const uploadButton = section.getByRole('button', { name: /cargar|subir|adjuntar/i });

    // Set up the file chooser listener before clicking
    const fileChooserPromise = this.page.waitForEvent('filechooser');
    await uploadButton.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(absolutePath);

    // Wait for the upload success indicator
    await this.expectUploadSuccess();
  }

  /**
   * Asserts that a file was uploaded successfully to this section.
   * Looks for VUCEM's standard success icon/badge next to the section.
   */
  async expectUploadSuccess(): Promise<void> {
    const section = this.page.locator('[data-section]', {
      hasText: this.sectionLabel,
    });
    // VUCEM shows a checkmark icon after successful upload
    const successIcon = section.locator('[data-status="uploaded"]');
    await expect(successIcon).toBeVisible({ timeout: 30_000 });
  }

  /**
   * Returns the filename of the currently uploaded file in this section.
   */
  async getUploadedFileName(): Promise<string> {
    const section = this.page.locator('[data-section]', {
      hasText: this.sectionLabel,
    });
    const fileNameElement = section.locator('[data-filename]');
    return fileNameElement.innerText();
  }
}
