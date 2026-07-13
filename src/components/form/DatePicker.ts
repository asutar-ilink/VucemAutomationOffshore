import { Page, Locator, expect } from '@playwright/test';

/**
 * Wrapper for date picker controls.
 *
 * VUCEM has two date input styles:
 *   1. Native <input type="date"> — accepts ISO format (YYYY-MM-DD)
 *   2. Text <input> with a calendar widget — requires typed dd/mm/yyyy
 *
 * This class detects which style is in use and handles both.
 * Always pass dates as ISO strings (YYYY-MM-DD) — this class converts them.
 */
export class DatePicker {
  private readonly input: Locator;
  private readonly label: string;

  constructor(page: Page, label: string) {
    this.label = label;
    this.input = page.getByLabel(label, { exact: true });
  }

  /**
   * Sets the date value.
   * @param isoDate Date string in YYYY-MM-DD format, e.g. '2024-06-15'
   */
  async setDate(isoDate: string): Promise<void> {
    const inputType = await this.input.getAttribute('type');

    if (inputType === 'date') {
      // Native date input — fill directly with ISO format
      await this.input.fill(isoDate);
    } else {
      // Text input with calendar widget — convert to dd/mm/yyyy
      const [year, month, day] = isoDate.split('-');
      const formatted = `${day}/${month}/${year}`;
      await this.input.click();
      await this.input.clear();
      await this.input.fill(formatted);
      // Close any open calendar by pressing Tab
      await this.input.press('Tab');
    }
  }

  /**
   * Returns the current date value as an ISO string (YYYY-MM-DD).
   */
  async getValue(): Promise<string> {
    const raw = await this.input.inputValue();
    // If already ISO format, return as-is
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    // Convert dd/mm/yyyy → YYYY-MM-DD
    const [day, month, year] = raw.split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  /**
   * Asserts the date field holds the expected ISO date.
   */
  async expectValue(expectedIsoDate: string): Promise<void> {
    const current = await this.getValue();
    expect(current).toBe(expectedIsoDate);
  }
}
