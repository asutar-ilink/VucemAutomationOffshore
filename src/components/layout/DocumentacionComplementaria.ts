import { Page, Locator, expect } from '@playwright/test';

/**
 * Wrapper for the Paso-2 "Documentación complementaria" subsection
 * (formerly "Requisitos Opcionales", REQ_02 §6.2.1).
 *
 * The section holds the instructions block, a "Tipo de documento" ng-select
 * (only "Otro" is offered), "Agregar" / "Agregar nuevo" and the loaded rows.
 */
export class DocumentacionComplementaria {
  static readonly TITLE = 'Documentación complementaria';
  static readonly OLD_TITLE = 'Requisitos Opcionales';

  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** Subsection heading (<h3>). Matched case-insensitively so a casing deviation is reported by an assertion, not a timeout. */
  get title(): Locator {
    return this.page.getByRole('heading', { name: /documentaci[oó]n complementaria/i, level: 3 }).first();
  }

  /** Container of the subsection: the innermost div holding the heading and the "Agregar" button. */
  get section(): Locator {
    return this.page
      .locator('div')
      .filter({ has: this.page.getByRole('heading', { name: /documentaci[oó]n complementaria/i, level: 3 }) })
      .filter({ has: this.page.getByRole('button', { name: /^\s*agregar\s*$/i }) })
      .last();
  }

  get oldTitle(): Locator {
    return this.page.getByText(DocumentacionComplementaria.OLD_TITLE, { exact: true });
  }

  /** Normalised visible text of the subsection (whitespace collapsed). */
  async text(): Promise<string> {
    const raw = await this.section.innerText();
    return raw.replace(/\s+/g, ' ').trim();
  }

  /** Labels offered by the "Tipo de documento" ng-select. */
  async documentTypeOptions(): Promise<string[]> {
    await this.section.locator('ng-select').first().click();
    const options = this.page.locator('.ng-dropdown-panel .ng-option');
    await options.first().waitFor({ state: 'visible', timeout: 15_000 });
    const labels = (await options.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
    await this.page.keyboard.press('Escape');
    return labels;
  }

  async selectType(label: string): Promise<void> {
    await this.section.locator('ng-select').first().click();
    await this.page.locator('.ng-dropdown-panel .ng-option', { hasText: label }).first().click();
    await this.page.keyboard.press('Escape');
  }

  async add(): Promise<void> {
    await this.page.getByRole('button', { name: /^\s*agregar( nuevo)?\s*$/i }).first().click();
  }

  async attachToLastRow(filePath: string): Promise<void> {
    await this.page.locator('input[type="file"]').last().setInputFiles(filePath);
  }

  /** Number of visible file inputs on the page (mandatory rows included — compare deltas). */
  async fileInputCount(): Promise<number> {
    return this.page.locator('input[type="file"]:visible').count();
  }

  async expectFileInputCount(count: number): Promise<void> {
    await expect.soft(this.page.locator('input[type="file"]:visible'), 'a second "Otro" row should exist (Agregar nuevo)').toHaveCount(count, { timeout: 5_000 });
  }
}
