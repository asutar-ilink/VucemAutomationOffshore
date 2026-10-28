import { Page, Locator } from '@playwright/test';

/**
 * Wrapper for the phone fields of REQ_02 §6.2.5: "Lada" is removed and "Teléfono" is a single
 * field in the Solicitante domicilio, the Establecimiento domicilio and the Destinatario final
 * modal. Field names differ per procedure family, so everything is detected by visible
 * label / control name inside a scope, never by a fixed formcontrolname.
 */
export interface PhoneScan {
  ladaVisible: boolean;
  phone: { present: boolean; enabled: boolean; readOnly: boolean; value: string; maxLength: number; invalid: boolean };
}

export class PhoneFields {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** Visible content of the active tab. */
  get main(): Locator {
    return this.page.locator('main').first();
  }

  /** The Bootstrap modal currently open. */
  get openModal(): Locator {
    return this.page.locator('.modal.show').last();
  }

  /** Scans `scope` for a visible Lada field and the (single) Teléfono field. */
  async scan(scope: Locator): Promise<PhoneScan> {
    return scope.evaluate((root) => {
      const visible = (el: Element): boolean => !!(el as HTMLElement).offsetParent;
      const labelOf = (el: Element): string => {
        const id = el.getAttribute('id');
        const byFor = id ? root.querySelector(`label[for="${id}"]`) : null;
        const wrap = el.closest('div')?.parentElement?.querySelector('label');
        return ((byFor || wrap)?.textContent || '').trim();
      };
      const controls = Array.from(root.querySelectorAll('input, select, textarea')).filter(visible) as HTMLInputElement[];
      const key = (el: HTMLInputElement): string =>
        [el.getAttribute('formcontrolname'), el.closest('[formcontrolname]')?.getAttribute('formcontrolname'),
          el.getAttribute('name'), el.id, labelOf(el)].join(' ');
      const labels = Array.from(root.querySelectorAll('label')).filter(visible).map((l) => (l.textContent || '').trim());
      const lada = controls.some((c) => /\blada\b/i.test(key(c))) || labels.some((t) => /^\s*lada\b/i.test(t));
      const phoneEl = controls.find((c) => /tel[eé]fono|telefono/i.test(key(c)));
      return {
        ladaVisible: lada,
        phone: {
          present: !!phoneEl,
          enabled: !!phoneEl && !phoneEl.disabled,
          readOnly: !!phoneEl && phoneEl.readOnly,
          value: phoneEl?.value ?? '',
          maxLength: phoneEl && phoneEl.maxLength > 0 ? phoneEl.maxLength : -1,
          invalid: !!phoneEl && /ng-invalid/.test(phoneEl.className),
        },
      };
    });
  }

  /** The Teléfono control inside `scope`. */
  phoneControl(scope: Locator): Locator {
    return scope.locator(
      'input[formcontrolname*="elefono" i]:visible, input[name*="elefono" i]:visible, input[id*="elefono" i]:visible',
    ).first();
  }

  /**
   * Opens the "Agregar Destinatario" modal on the Terceros relacionados tab and returns it, or
   * null when the form has no Destinatario section. Terceros tabs hold several "Agregar" buttons
   * (fabricante, destinatario, proveedor …), so each is tried and the modal's own title decides.
   */
  async openDestinatarioModal(): Promise<Locator | null> {
    const buttons = this.page.getByRole('button', { name: /^\s*agregar\s*$/i }).locator('visible=true');
    const count = await buttons.count();
    for (let i = 0; i < count; i++) {
      await buttons.nth(i).click();
      const modal = this.openModal;
      const shown = await modal.waitFor({ state: 'visible', timeout: 4_000 }).then(() => true).catch(() => false);
      if (shown && /destinatario/i.test(await modal.locator('h1,h2,h3,h4,h5,.modal-title').first().innerText().catch(() => ''))) {
        return modal;
      }
      if (shown) await this.closeModal();
    }
    return null;
  }

  /** "Datos de la solicitud" tab — 260402 labels it "Datos de la Solicitud", so match case-insensitively. */
  async openDatosTab(): Promise<void> {
    await this.page.getByRole('button', { name: /^\s*datos de la solicitud\s*$/i }).first().click();
  }

  async closeModal(): Promise<void> {
    const modal = this.openModal;
    await modal.getByRole('button', { name: /cancelar|cerrar/i }).first().click().catch(() => undefined);
    await modal.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => undefined);
  }
}
