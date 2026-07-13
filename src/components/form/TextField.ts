import { Page, Locator, expect } from '@playwright/test';

/**
 * Wrapper for a single text input field, located by its visible label.
 *
 * ALL locator logic for text fields lives here.
 * Flows and procedures call fill(), getValue(), etc. — never page.locator() directly.
 *
 * Why getByLabel?
 * VUCEM's inputs are always accompanied by a <label> element.
 * getByLabel is robust to HTML changes (id, class, position) as long
 * as the visible label text stays the same — which it almost always does.
 */
/**
 * How to locate the input:
 *   'label'   — by visible label text (default; the SE-style forms).
 *   'control' — by Angular formControlName. Needed for COFEPRIS reactive forms
 *               where ids repeat across sections and labels are ambiguous; the
 *               formControlName is unique per field. Scoped to `:visible` so the
 *               visible field wins over identical hidden copies inside modals.
 *   'id'      — by element id.
 */
type LocateBy = 'label' | 'control' | 'id';

export class TextField {
  private readonly input: Locator;
  private readonly label: string;

  constructor(page: Page, target: string, by: LocateBy = 'label') {
    this.label = target;
    if (by === 'control') {
      this.input = page.locator(`[formcontrolname="${target}"]:visible`);
    } else if (by === 'id') {
      this.input = page.locator(`#${target}:visible`);
    } else {
      this.input = page.getByLabel(target, { exact: true });
    }
  }

  /**
   * Clears any existing value and types the new one.
   * Always clears first — VUCEM forms sometimes pre-populate fields.
   */
  async fill(value: string): Promise<void> {
    await this.input.clear();
    await this.input.fill(value);
  }

  /**
   * Returns the current value of the input.
   */
  async getValue(): Promise<string> {
    return this.input.inputValue();
  }

  /**
   * Blurs the field. Some VUCEM fields trigger a lookup/autofill on blur
   * (e.g. an RFC that populates read-only name fields), which fill() alone
   * does not fire.
   */
  async blur(): Promise<void> {
    await this.input.blur();
  }

  /**
   * Asserts the field currently holds the expected value.
   * Use in validations, not in flows.
   */
  async expectValue(expected: string): Promise<void> {
    await expect(this.input).toHaveValue(expected);
  }

  /**
   * Asserts an error message is visible below this field.
   * Looks for the standard VUCEM validation error pattern.
   */
  async expectError(message: string): Promise<void> {
    // VUCEM renders field errors in a sibling span with aria-describedby
    const errorLocator = this.input.page().locator(
      `[aria-describedby="${await this.input.getAttribute('id')}-error"]`
    );
    await expect(errorLocator).toContainText(message);
  }

  /**
   * Returns true if the field is disabled.
   */
  async isDisabled(): Promise<boolean> {
    return this.input.isDisabled();
  }

  /**
   * Returns true if the field is visible in the current view.
   */
  async isVisible(): Promise<boolean> {
    return this.input.isVisible();
  }
}
