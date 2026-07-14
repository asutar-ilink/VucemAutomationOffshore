import { Page, Locator, expect } from '@playwright/test';

/**
 * Wrapper for data tables in VUCEM.
 *
 * VUCEM displays tables of procedures, observations, and documents.
 * This component provides row-level operations:
 * finding a row by content, clicking actions within a row,
 * and asserting table state.
 *
 * Locate the table by its accessible caption or a heading above it,
 * not by a generic CSS selector — headings don't change between app versions.
 */
export class DynamicTable {
  private readonly page: Page;
  private readonly table: Locator;
  private readonly caption: string;

  constructor(page: Page, caption: string) {
    this.page = page;
    this.caption = caption;
    // First try: table with a visible caption element
    this.table = page.locator('table', { has: page.locator('caption', { hasText: caption }) })
      .or(page.locator('[role="grid"]', { hasText: caption }));
  }

  /**
   * Clicks the 'Agregar' (add) button associated with this table.
   *
   * VUCEM forms show several tables on one tab, each with its own 'Agregar'
   * button (S.C.I.A.N., Mercancías, Fabricante, …). The button is scoped to the
   * section/region that contains this table's caption so the right one is
   * clicked when multiple tables are present. Typically opens an "add record"
   * modal which the caller then fills.
   */
  async clickAdd(buttonLabel: string = 'Agregar'): Promise<void> {
    const region = this.page
      .locator('section, [role="region"], .card, .panel, fieldset')
      .filter({ hasText: this.caption })
      .first();
    await region.getByRole('button', { name: buttonLabel }).first().click();
  }

  /**
   * Returns the row that contains the given text anywhere in the row.
   * Throws if no row is found.
   */
  getRowByText(text: string): Locator {
    return this.table.getByRole('row', { name: text });
  }

  /**
   * Clicks an action button (e.g. 'Ver', 'Editar', 'Eliminar')
   * within the row identified by rowText.
   */
  async clickActionInRow(rowText: string, actionLabel: string): Promise<void> {
    const row = this.getRowByText(rowText);
    await row.getByRole('button', { name: actionLabel }).click();
  }

  /**
   * Returns the text content of all cells in the specified column (by header name).
   * Useful for asserting the state of a whole column.
   */
  async getColumnValues(columnHeader: string): Promise<string[]> {
    const headers = this.table.getByRole('columnheader');
    const allHeaders = await headers.allInnerTexts();
    const columnIndex = allHeaders.findIndex(h => h.trim() === columnHeader);

    if (columnIndex === -1) {
      throw new Error(`Column "${columnHeader}" not found in table "${this.caption}"`);
    }

    const rows = this.table.getByRole('row').filter({ hasNot: this.table.getByRole('columnheader') });
    const cells = await rows.all();

    return Promise.all(
      cells.map(row =>
        row.getByRole('cell').nth(columnIndex).innerText()
      )
    );
  }

  /**
   * Asserts a row containing the given text is visible.
   *
   * VUCEM's `app-tabla-dinamica` tables carry no <caption> (the label sits in a
   * <th> or a heading above the table), so the caption-scoped `this.table` may
   * not resolve. This check is therefore page-scoped: it confirms a visible
   * table row containing the text exists — enough to verify an add-record
   * modal committed its row. Hidden duplicate rows (in closed modals) are
   * excluded by the visibility assertion.
   */
  async expectRowExists(text: string): Promise<void> {
    const row = this.page.getByRole('row').filter({ hasText: text });
    await expect(row.first()).toBeVisible();
  }

  /**
   * Ticks the row-select checkbox of the (visible) row containing the given text.
   *
   * COFEPRIS add-record tables (`app-tabla-dinamica`) carry no <caption>, so the
   * row is located page-scoped like expectRowExists. Each data row has a leading
   * checkbox used to mark it before clicking the table's "Eliminar" button.
   */
  async selectRowByText(text: string): Promise<void> {
    const row = this.page.getByRole('row').filter({ hasText: text }).first();
    await row.locator('input[type="checkbox"]').first().check();
  }

  /**
   * Asserts no visible row contains the given text — e.g. after a delete.
   * Hidden duplicate rows (in closed modals) are excluded by the visibility
   * intersection, so a stale template row never masks a real deletion.
   */
  async expectRowAbsent(text: string): Promise<void> {
    const visibleRow = this.page.getByRole('row')
      .filter({ hasText: text })
      .and(this.page.locator(':visible'));
    await expect(visibleRow).toHaveCount(0);
  }

  /**
   * Asserts the table contains exactly N rows (excluding the header row).
   */
  async expectRowCount(count: number): Promise<void> {
    const rows = this.table.getByRole('row').filter({
      hasNot: this.table.getByRole('columnheader'),
    });
    await expect(rows).toHaveCount(count);
  }

  /**
   * Asserts the table is empty (no data rows).
   */
  async expectEmpty(): Promise<void> {
    await this.expectRowCount(0);
  }
}
