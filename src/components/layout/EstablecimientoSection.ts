import { Page, Locator, expect } from '@playwright/test';

/**
 * Wrapper for the Paso-1 "Datos del establecimiento" subsection (REQ_02 §6.2.3):
 * the "Seleccionar establecimiento" button is gone and every field is captured manually.
 * Fields are addressed by formcontrolname (ids repeat with the Solicitante section).
 */
export interface EstablecimientoValues {
  rfcSanitario?: string;
  denominacionRazon: string;
  correoElectronico: string;
  codigoPostal: string;
  estado: string;
  municipioAlcaldia: string;
  calle: string;
  telefono: string;
}

export class EstablecimientoSection {
  /** Text inputs of the subsection, in form order. `estado` is a select and handled separately. */
  static readonly TEXT_FIELDS = [
    'rfcSanitario', 'denominacionRazon', 'correoElectronico', 'codigoPostal',
    'municipioAlcaldia', 'calle', 'telefono',
  ] as const;

  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  get heading(): Locator {
    return this.page.getByRole('heading', { name: /datos del establecimiento/i });
  }

  get seleccionarButton(): Locator {
    return this.page.getByRole('button', { name: /seleccionar establecimiento/i });
  }

  /** Any visible message about searching / connecting to an establishment. */
  get searchOrConnectionError(): Locator {
    return this.page.getByText(/(error|no se pudo|no fue posible|fall[oó]).{0,80}(b[uú]squeda|conexi[oó]n|conectar|buscar)/i);
  }

  control(name: string): Locator {
    // "estado" is an <app-catalogo-select> wrapping a native <select>.
    if (name === 'estado') {
      return this.page.locator(
        'app-catalogo-select[name="estado"] select:visible, app-catalogo-select[formcontrolname="estado"] select:visible',
      ).first();
    }
    return this.page.locator(`[formcontrolname="${name}"]:visible`).first();
  }

  /** Names of the text fields that exist on this form (rfcSanitario is absent on some). */
  async presentTextFields(): Promise<string[]> {
    const present: string[] = [];
    for (const name of EstablecimientoSection.TEXT_FIELDS) {
      if (await this.page.locator(`[formcontrolname="${name}"]:visible`).count()) present.push(name);
    }
    return present;
  }

  async expectAllEnabled(): Promise<void> {
    for (const name of [...(await this.presentTextFields()), 'estado']) {
      await expect.soft(this.control(name), `${name} should be enabled`).toBeEnabled();
    }
  }

  async fill(v: EstablecimientoValues): Promise<void> {
    for (const name of await this.presentTextFields()) {
      const value = v[name as keyof EstablecimientoValues];
      if (value !== undefined) await this.control(name).fill(value);
    }
    await this.control('estado').selectOption({ label: v.estado });
  }

  /** Current values: text inputs by control name, estado as its visible option text. */
  async values(): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const name of await this.presentTextFields()) out[name] = await this.control(name).inputValue();
    out.estado = await this.control('estado').evaluate((s: HTMLSelectElement) => s.options[s.selectedIndex]?.text ?? '');
    return out;
  }

  /**
   * Form-agnostic scan: every visible input/select/textarea between the "Datos del
   * establecimiento" heading and the next section heading, with its enabled/readonly state.
   * (Field names differ per procedure family, so fixed formcontrolnames cannot be assumed.)
   */
  async fieldStates(): Promise<{ name: string; enabled: boolean; readOnly: boolean }[]> {
    return this.page.evaluate(() => {
      const heads = Array.from(document.querySelectorAll('h3'));
      const start = heads.find((h) => /datos del establecimiento/i.test(h.textContent || ''));
      if (!start) return [];
      const next = heads[heads.indexOf(start) + 1];
      const out: { name: string; enabled: boolean; readOnly: boolean }[] = [];
      const all = Array.from(document.querySelectorAll('input, select, textarea')) as HTMLInputElement[];
      for (const el of all) {
        const afterStart = !!(start.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
        const beforeNext = !next || !!(next.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING);
        const visible = !!el.offsetParent && el.type !== 'hidden';
        if (afterStart && beforeNext && visible) {
          const host = el.closest('[formcontrolname], [name]');
          out.push({
            name: el.getAttribute('formcontrolname') || host?.getAttribute('formcontrolname') || host?.getAttribute('name') || el.id || el.tagName,
            enabled: !el.disabled,
            readOnly: !!el.readOnly,
          });
        }
      }
      return out;
    });
  }
}
