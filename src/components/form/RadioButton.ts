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
  private readonly page: Page;
  private readonly option: Locator;
  private readonly idValue?: string;

  constructor(page: Page, optionLabel: string, groupLabel?: string, byId = false) {
    this.page = page;
    if (byId) {
      // Locate by element id — for COFEPRIS groups whose options carry no
      // per-option label (e.g. "hacer públicos los datos": id="Si"|"No").
      this.idValue = optionLabel;
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
    const box = this.option.first();
    // COFEPRIS radios can be un-clickable for a spell after a sibling modal
    // closes (a lingering backdrop swallows the click, so check() reports "did
    // not change its state") and the app-input-radio re-renders around form
    // updates. Poll: scroll in, retry check(), then dispatch a real click
    // straight to the input (bypasses any intercepting overlay) until it sticks.
    await expect.poll(async () => {
      if (await box.isChecked().catch(() => false)) return true;
      await box.scrollIntoViewIfNeeded().catch(() => undefined);
      await box.check({ timeout: 1_500 }).catch(() => undefined);
      if (await box.isChecked().catch(() => false)) return true;
      // A programmatic el.click() runs the radio's default action (checks it) and
      // fires change so Angular registers, while bypassing coordinate-based click
      // interception (a lingering overlay) that can defeat check().
      await box.evaluate((el: HTMLInputElement) => el.click()).catch(() => undefined);
      return box.isChecked().catch(() => false);
    }, { timeout: 15_000, intervals: [200, 400, 800] }).toBe(true);
  }

  async isSelected(): Promise<boolean> {
    return this.option.isChecked();
  }

  async expectSelected(): Promise<void> {
    await expect(this.option).toBeChecked();
  }
}
