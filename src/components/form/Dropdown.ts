import { Page, Locator, expect } from '@playwright/test';

/**
 * Wrapper for dropdown/select controls.
 *
 * VUCEM uses two styles of dropdowns:
 *   1. Native <select> elements
 *   2. Custom styled dropdowns (div-based, aria-role="listbox")
 *
 * This class handles both transparently.
 * Flows don't need to know which type they're dealing with.
 */
/**
 * How to locate the dropdown:
 *   'label'   — by visible label text (default; SE-style native selects).
 *   'control' — by the COFEPRIS <app-catalogo-select name="…"> wrapper, whose
 *               inner native <select> has id="undefined"/formcontrolname=
 *               "selectControl" and so cannot be found by label or id. Scoped to
 *               `:visible` so the on-screen select wins over hidden modal copies.
 */
type LocateBy = 'label' | 'control';

export class Dropdown {
  private readonly container: Locator;
  private readonly label: string;

  constructor(page: Page, target: string, by: LocateBy = 'label') {
    this.label = target;
    if (by === 'control') {
      // The <app-catalogo-select> wrapper identifies the field by either `name`
      // or `formcontrolname`, depending on the form; match both.
      this.container = page.locator(
        `app-catalogo-select[name="${target}"] select:visible, app-catalogo-select[formcontrolname="${target}"] select:visible`,
      );
    } else {
      // getByLabel covers both native <select> and aria-labelled custom dropdowns
      this.container = page.getByLabel(target, { exact: true });
    }
  }

  /**
   * Selects an option by its visible text.
   * Works for both native <select> and custom ARIA listboxes.
   */
  async select(optionText: string): Promise<void> {
    const tagName = await this.container.evaluate(el => el.tagName.toLowerCase());

    if (tagName === 'select') {
      await this.container.selectOption({ label: optionText });
    } else {
      // Custom dropdown: click to open, then click the option
      await this.container.click();
      await this.container.page()
        .getByRole('option', { name: optionText })
        .click();
    }
  }

  /**
   * Returns the currently selected option text.
   */
  async getSelected(): Promise<string> {
    const tagName = await this.container.evaluate(el => el.tagName.toLowerCase());

    if (tagName === 'select') {
      return this.container.evaluate((el: HTMLSelectElement) =>
        el.options[el.selectedIndex]?.text ?? ''
      );
    } else {
      return this.container.innerText();
    }
  }

  /**
   * Asserts the currently selected option matches the expected text.
   */
  async expectSelected(expected: string): Promise<void> {
    const selected = await this.getSelected();
    expect(selected).toContain(expected);
  }

  /**
   * Returns all available option texts (useful for validation tests).
   */
  async getOptions(): Promise<string[]> {
    const tagName = await this.container.evaluate(el => el.tagName.toLowerCase());

    if (tagName === 'select') {
      return this.container.evaluate((el: HTMLSelectElement) =>
        Array.from(el.options).map(o => o.text)
      );
    } else {
      await this.container.click();
      const options = await this.container.page()
        .getByRole('option')
        .allInnerTexts();
      // Close the dropdown by pressing Escape
      await this.container.page().keyboard.press('Escape');
      return options;
    }
  }
}
