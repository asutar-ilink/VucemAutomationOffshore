import { Page, Locator, expect } from '@playwright/test';

/**
 * Wrapper for checkbox controls.
 *
 * COFEPRIS procedures (e.g. 260204) include declaration checkboxes such as the
 * 'Manifiestos y declaraciones' acceptance. The checkbox is located by its
 * visible label text — the same label-first strategy used by every other
 * form component.
 *
 * ALL checkbox locator logic lives here. Flows and procedures call check(),
 * isChecked(), etc. — never page.locator() directly.
 */
/**
 * How to locate the checkbox:
 *   'label'   — by visible label text (default).
 *   'control' — by Angular formControlName. Needed for COFEPRIS declaration
 *               checkboxes (e.g. 'manifesto') whose visible label is just '*'.
 *               Scoped to `:visible` to skip identical hidden copies in modals.
 */
type LocateBy = 'label' | 'control';

export class Checkbox {
  private readonly input: Locator;
  private readonly label: string;

  constructor(page: Page, target: string, by: LocateBy = 'label') {
    this.label = target;
    this.input = by === 'control'
      ? page.locator(`input[type="checkbox"][formcontrolname="${target}"]:visible`)
      : page.getByLabel(target, { exact: false });
  }

  async check(): Promise<void> {
    await this.input.check();
  }

  async uncheck(): Promise<void> {
    await this.input.uncheck();
  }

  async isChecked(): Promise<boolean> {
    return this.input.isChecked();
  }

  async expectChecked(): Promise<void> {
    await expect(this.input).toBeChecked();
  }

  async expectUnchecked(): Promise<void> {
    await expect(this.input).not.toBeChecked();
  }
}
