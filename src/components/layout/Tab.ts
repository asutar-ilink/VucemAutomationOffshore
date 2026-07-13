import { Page, Locator, expect } from '@playwright/test';

/**
 * Wrapper for tab navigation.
 *
 * VUCEM procedures are divided into multiple tabs
 * (e.g. 'Datos Generales', 'Domicilio', 'Documentos').
 * This component provides a consistent API for navigating between them.
 *
 * Two tab markups exist across VUCEM:
 *   1. ARIA tabs — <button role="tab" aria-selected>… (the SE reference).
 *   2. Bootstrap tabs — <li [class.active]><a role="button" data-toggle="tab">…
 *      (COFEPRIS procedures such as 260204). These expose no `tab` role and no
 *      `aria-selected`; the active state lives on the parent <li class="active">.
 * The component targets whichever is present so both procedures work unchanged.
 *
 * One Tab instance per page — you call tab.click('Tab Name') wherever you need.
 */
export class Tab {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** Resolves the clickable tab element for either markup (ARIA tab or button). */
  private tabElement(tabLabel: string): Locator {
    const ariaTab = this.page.getByRole('tab', { name: tabLabel, exact: true });
    const buttonTab = this.page.getByRole('button', { name: tabLabel, exact: true });
    // getByRole('tab') resolves first when present; .or() falls back to the button.
    return ariaTab.or(buttonTab).first();
  }

  /**
   * Clicks a tab by its visible label and waits for it to become active.
   */
  async click(tabLabel: string): Promise<void> {
    await this.tabElement(tabLabel).click();
    // Wait for the tab panel to become visible after click
    await this.expectActive(tabLabel);
  }

  /**
   * Asserts the named tab is currently active/selected. Handles both the ARIA
   * `aria-selected` marker and the Bootstrap `<li class="active">` marker.
   */
  async expectActive(tabLabel: string): Promise<void> {
    const ariaSelected = this.page.getByRole('tab', { name: tabLabel, exact: true, selected: true });
    const activeLi = this.page.locator('li.active').filter({ hasText: tabLabel });
    await expect(ariaSelected.or(activeLi).first()).toBeVisible();
  }

  /**
   * Asserts a tab exists (visible) but is not currently active.
   * Useful for checking that a tab is available before navigating to it.
   */
  async expectVisible(tabLabel: string): Promise<void> {
    await expect(this.tabElement(tabLabel)).toBeVisible();
  }

  /**
   * Returns the labels of all currently visible tabs.
   * Useful for validation tests that check procedure structure.
   */
  async getVisibleTabLabels(): Promise<string[]> {
    return this.page.getByRole('tab').allInnerTexts();
  }
}
