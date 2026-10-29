import { Page, Locator } from '@playwright/test';

/**
 * Wrapper for the Paso-1 "No. de Aviso de funcionamiento o Licencia sanitaria" field
 * (REQ_02 §6.2.7: new label, always visible, mandatory or optional per form).
 * The control name differs per family, so the field is located by its visible label.
 */
export interface LicenciaState {
  found: boolean;
  /** Label text as shown, e.g. "No. de Aviso de funcionamiento o Licencia sanitaria*:" */
  label: string;
  /** Label without the "*" / ":" decorations. */
  labelText: string;
  /** The label carries the mandatory "*" indicator. */
  requiredMark: boolean;
  visible: boolean;
  enabled: boolean;
  /** Control carries the ng-invalid class (Angular validation state). */
  invalid: boolean;
  /** A visible validation message sits with the field (e.g. "Este campo es obligatorio."). */
  errorMessage: string;
  value: string;
}

export class LicenciaField {
  static readonly LABEL = 'No. de Aviso de funcionamiento o Licencia sanitaria';

  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  get main(): Locator {
    return this.page.locator('main').first();
  }

  /** Opens the Datos de la solicitud tab (button or plain <li>, any capitalisation). */
  async openDatosTab(): Promise<void> {
    const label = /^\s*datos de la solicitud\s*$/i;
    await this.page.getByRole('button', { name: label }).or(this.page.locator('li').filter({ hasText: label })).first().click();
  }

  async clickContinuar(): Promise<void> {
    await this.page.getByRole('button', { name: /^\s*continuar\s*$/i }).first().click();
  }

  /** Reads the field's current state from the DOM, located by label text. */
  async state(): Promise<LicenciaState> {
    return this.main.evaluate((root) => {
      const visible = (el: Element | null): boolean => !!el && !!(el as HTMLElement).offsetParent;
      const labels = Array.from(root.querySelectorAll('label')).filter(visible);
      const norm = (t: string): string => t.replace(/\s+/g, ' ').trim();
      // Prefer the new label, then any licencia/aviso label.
      const label =
        labels.find((l) => /aviso de funcionamiento o licencia sanitaria/i.test(l.textContent || '')) ||
        labels.find((l) => /licencia sanitaria|aviso de funcionamiento/i.test(l.textContent || ''));
      if (!label) {
        return { found: false, label: '', labelText: '', requiredMark: false, visible: false, enabled: false, invalid: false, errorMessage: '', value: '' };
      }
      const forId = label.getAttribute('for');
      let control: HTMLInputElement | null = forId ? (root.querySelector(`#${CSS.escape(forId)}`) as HTMLInputElement | null) : null;
      let scope: Element | null = label.parentElement;
      for (let i = 0; !control && scope && i < 4; i++, scope = scope.parentElement) {
        control = scope.querySelector('input[type="text"], input:not([type]), input[type="number"], textarea');
      }
      const container = control?.closest('div')?.parentElement ?? label.parentElement;
      const err = container
        ? Array.from(container.querySelectorAll('*'))
            .filter((e) => visible(e) && e.children.length === 0 && /obligatorio|requerido|inv[aá]lid/i.test(e.textContent || ''))
            .map((e) => norm(e.textContent || ''))[0]
        : '';
      const text = norm(label.textContent || '');
      return {
        found: true,
        label: text,
        labelText: text.replace(/[*:]/g, '').replace(/\s+/g, ' ').trim(),
        requiredMark: /\*/.test(text),
        visible: visible(control),
        enabled: !!control && !control.disabled,
        invalid: !!control && /ng-invalid/.test(control.className),
        errorMessage: err || '',
        value: control?.value ?? '',
      };
    });
  }

  /** Clears the field (when present and editable). */
  async clear(): Promise<void> {
    const label = this.main.locator('label').filter({ hasText: /licencia sanitaria|aviso de funcionamiento/i }).first();
    const input = label.locator('xpath=following::input[1]');
    if (await input.isEditable().catch(() => false)) await input.fill('');
  }
}
