import { Page, Locator, expect } from '@playwright/test';

/**
 * Wrapper for VUCEM's `<crosslist>` dual-list control (available → selected).
 *
 * COFEPRIS forms use it for multi-select fields — e.g. the Mercancía modal
 * (País de origen, País de procedencia, Uso específico). Each `<crosslist>` has:
 *   - a source `<select multiple>` (available options),
 *   - a target `<select multiple>` (chosen options, initially empty),
 *   - buttons: "Agregar todos" / "Agregar selección" / "Restar selección" / "Restar todos".
 *
 * Each control sits inside a collapsible panel and only renders when the panel
 * is expanded, so it is located by the panel heading. Pass `withinSelector` to
 * scope the search (e.g. to a modal) when the same heading could appear twice.
 *
 * ALL crosslist locator logic lives here.
 */
export class CrossList {
  private readonly panel: Locator;
  private readonly heading: string;

  constructor(page: Page, heading: string, withinSelector?: string) {
    this.heading = heading;
    const base = withinSelector ? `${withinSelector} .panel` : '.panel';
    this.panel = page.locator(base).filter({ hasText: heading }).first();
  }

  /** Expands the panel if its `<crosslist>` has not rendered yet. */
  private async ensureExpanded(): Promise<Locator> {
    const crosslist = this.panel.locator('crosslist');
    if ((await crosslist.count()) === 0) {
      await this.panel.getByText(this.heading, { exact: true }).first().click();
    }
    return crosslist;
  }

  /**
   * Moves an option from the available list to the selected list:
   * highlights it in the source select, then clicks "Agregar selección".
   *
   * The option is matched accent- and case-insensitively (VUCEM's country/uso
   * catalogues render without diacritics — e.g. "ALEMANIA (REPUBLICA FEDERAL
   * DE)" — while test data may carry the accented spelling), and selected by the
   * option's value to avoid label-whitespace mismatches.
   */
  async add(optionText: string): Promise<void> {
    const crosslist = await this.ensureExpanded();
    const source = crosslist.locator('select').first();
    const norm = (s: string) =>
      s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

    await expect.poll(async () => source.locator('option').count()).toBeGreaterThan(0);
    const options = await source.locator('option').evaluateAll(els =>
      (els as HTMLOptionElement[]).map(e => ({ value: e.value, text: (e.textContent || '').replace(/\s+/g, ' ').trim() })));
    const match = options.find(o => norm(o.text) === norm(optionText))
      ?? options.find(o => norm(o.text).includes(norm(optionText)));
    if (!match) {
      throw new Error(`No crosslist option ~ "${optionText}" under "${this.heading}". Got: ${options.map(o => o.text).slice(0, 8).join(' | ')}`);
    }
    await source.selectOption(match.value);
    await crosslist.getByRole('button', { name: 'Agregar selección' }).click();
  }
}
