import { Page, Locator, expect } from '@playwright/test';

/**
 * Wrapper for modal dialogs.
 *
 * VUCEM uses modals in two situations:
 *   1. Confirmation prompts before destructive actions (submit, delete)
 *   2. Information dialogs after completed actions
 *
 * Always construct with the modal title so the component
 * scopes its actions to the correct modal when multiple are possible.
 */
export class Modal {
  private readonly dialog: Locator;
  private readonly title: string;

  constructor(page: Page, title: string) {
    this.title = title;
    // Scope all actions to the specific modal by its title
    this.dialog = page.getByRole('dialog', { name: title });
  }

  /**
   * Waits for the modal to appear and become visible.
   */
  async waitForOpen(): Promise<void> {
    await expect(this.dialog).toBeVisible();
  }

  /**
   * Clicks the primary confirm/accept button and waits for the modal to close.
   */
  async confirm(): Promise<void> {
    await this.waitForOpen();
    const confirmButton = this.dialog.getByRole('button', {
      name: /confirmar|aceptar|sí|enviar/i,
    });
    await confirmButton.click();
    await expect(this.dialog).not.toBeVisible();
  }

  /**
   * Clicks the cancel/close button and waits for the modal to close.
   */
  async cancel(): Promise<void> {
    await this.waitForOpen();
    const cancelButton = this.dialog.getByRole('button', {
      name: /cancelar|cerrar|no/i,
    });
    await cancelButton.click();
    await expect(this.dialog).not.toBeVisible();
  }

  /**
   * Clicks a named button inside the modal (e.g. 'Agregar', 'Continuar').
   * Use when the action button is not one of the standard confirm/cancel
   * verbs handled by confirm()/cancel() — common for "add record" dialogs.
   */
  async clickButton(buttonName: string | RegExp): Promise<void> {
    await this.waitForOpen();
    await this.dialog.getByRole('button', { name: buttonName }).click();
  }

  /**
   * Returns the full text content of the modal body.
   * Useful for asserting error or status messages.
   */
  async getBodyText(): Promise<string> {
    await this.waitForOpen();
    return this.dialog.locator('[role="document"], .modal-body, [data-modal-body]').innerText();
  }

  /**
   * Asserts the modal body contains the expected text.
   */
  async expectBodyText(text: string): Promise<void> {
    await this.waitForOpen();
    await expect(this.dialog).toContainText(text);
  }

  /**
   * Returns true if the modal is currently visible.
   */
  async isOpen(): Promise<boolean> {
    return this.dialog.isVisible();
  }
}
