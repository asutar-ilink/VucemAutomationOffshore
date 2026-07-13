import { Page, Locator, expect } from '@playwright/test';

/**
 * Wrapper for radio-button groups.
 *
 * COFEPRIS procedures use several radio groups whose option labels repeat
 * across the page (e.g. 'Sí' / 'No', 'Física' / 'Moral'). To disambiguate,
 * construct with the group's question/label so the component scopes its search
 * to the correct fieldset before selecting the option.
 *
 *   // Unambiguous option — no group needed:
 *   await new RadioButton(page, 'Nacional').select();
 *
 *   // Repeated option — scope to its group:
 *   await new RadioButton(page, 'Física', 'Tipo persona').select();
 *
 * ALL radio locator logic lives here.
 */
export class RadioButton {
  private readonly option: Locator;

  constructor(page: Page, optionLabel: string, groupLabel?: string, byId = false) {
    if (byId) {
      // Locate by element id — for COFEPRIS groups whose options carry no
      // per-option label (e.g. "hacer públicos los datos": id="Si"|"No").
      this.option = page.locator(`input[type="radio"][id="${optionLabel}"]:visible`);
    } else if (groupLabel) {
      // Scope to the fieldset / region that holds the group question,
      // then pick the option inside it.
      const group = page
        .locator('fieldset, [role="radiogroup"], .form-group, .field')
        .filter({ hasText: groupLabel })
        .first();
      this.option = group.getByRole('radio', { name: optionLabel, exact: true });
    } else {
      this.option = page.getByRole('radio', { name: optionLabel, exact: true });
    }
  }

  /**
   * Locates a radio option by its element id. Needed for COFEPRIS groups whose
   * options carry no per-option label (e.g. the "hacer públicos los datos"
   * group with <input type="radio" id="Si"|"No">). Scoped to `:visible`.
   */
  static byId(page: Page, id: string): RadioButton {
    return new RadioButton(page, id, undefined, true);
  }

  async select(): Promise<void> {
    await this.option.check();
  }

  async isSelected(): Promise<boolean> {
    return this.option.isChecked();
  }

  async expectSelected(): Promise<void> {
    await expect(this.option).toBeChecked();
  }
}
