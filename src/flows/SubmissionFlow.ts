import { Page } from '@playwright/test';
import { TextField } from '../components/form/TextField';
import { Dropdown } from '../components/form/Dropdown';
import { Tab } from '../components/layout/Tab';
import { Modal } from '../components/layout/Modal';
import { Logger } from '../utils/Logger';
import { ApplicantData } from '../types';

/**
 * SubmissionFlow contains the reusable steps for completing a procedure form.
 *
 * ~70% of the VUCEM UI is shared across procedures.
 * This flow captures all of that shared behaviour in one place.
 *
 * Procedures call these static methods and pass their data.
 * If a procedure needs a variation (different tab order, extra fields),
 * it calls the relevant methods directly and adds its own steps around them.
 *
 * Static methods are used deliberately — no need to instantiate a flow object.
 * This keeps the call site clean: SubmissionFlow.fillGeneralTab(page, data)
 */
export class SubmissionFlow {

  /**
   * Navigates from the dashboard to the specified procedure's form.
   * Shared by every department procedure.
   */
  static async navigateToProcedure(page: Page, procedureCode: string): Promise<void> {
    await Logger.step(`Navigate to procedure ${procedureCode}`, async () => {
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');

      // VUCEM dashboard has a searchable procedure catalogue
      const searchField = new TextField(page, 'Buscar trámite');
      await searchField.fill(procedureCode);
      await page.getByRole('link', { name: procedureCode }).first().click();

      await page.waitForLoadState('networkidle');
    });
  }

  /**
   * From the bandeja de tareas pendientes, navigates the real VUCEM menu path
   * "Trámites → Solicitudes nuevas", landing on the selección-de-trámite
   * catalogue. Shared entry point for every new-submission journey;
   * openNewProcedure builds on this to open a specific procedure row.
   */
  static async startNewSolicitud(page: Page): Promise<void> {
    await Logger.step('Open "Trámites → Solicitudes nuevas"', async () => {
      // The nav renders a beat after the bandeja settles, so wait for the
      // Trámites toggle first — this is what the DOM needs before the menu
      // items exist. The toggle is <a role="button">Trámites</a> (the gob.mx
      // header "Trámites" is a link, so it does not clash); the navbar is
      // duplicated (desktop + mobile), hence .first().
      await page.getByRole('button', { name: 'Trámites' }).first().waitFor({ state: 'visible' });

      // A duplicated navbar and an overlaying header subtree intercept real
      // pointer events, and the Bootstrap dropdown only opens on a genuine
      // click — so rather than click the toggle, dispatch the click on the menu
      // item directly. It is an <a> with no href whose Angular (click) routes to
      // /seleccion-tramite, and that handler fires on a programmatic click even
      // while the menu is collapsed. Exact-text equality skips the sibling
      // "Solicitudes nuevas (1)". The SPA navigation tears down the evaluate
      // context (surfaces as an error) — expected, so it is swallowed and the
      // navigation asserted via waitForURL.
      await page.evaluate(() => {
        const item = Array.from(document.querySelectorAll('a.dropdown-item'))
          .find(el => (el.textContent || '').trim() === 'Solicitudes nuevas');
        (item as HTMLElement | undefined)?.click();
      }).catch(() => { /* navigation tore down the context — expected */ });

      await page.waitForURL(/seleccion-tramite/i, { timeout: 60_000 });
      await page.waitForLoadState('domcontentloaded');
    });
  }

  /**
   * From the selección-de-trámite catalogue, opens the row matching the given
   * procedure code → routes to the procedure form. Prerequisite: the page must
   * already be on the catalogue (call startNewSolicitud first).
   */
  static async openProcedureFromCatalogue(page: Page, procedureCode: string): Promise<void> {
    await Logger.step(`Open procedure ${procedureCode} from catalogue`, async () => {
      // Open the procedure row (matched by its homoclave) → routes to the form.
      await page.evaluate((code) => {
        const row = Array.from(document.querySelectorAll('tr, .card, li'))
          .find(r => (r.textContent || '').includes(code));
        const action = row?.querySelector('button, a, [role=button], i, svg');
        (action as HTMLElement | undefined)?.click();
      }, procedureCode).catch(() => { /* navigation tore down the context — expected */ });
      // Most procedure form routes contain "solicitud"; some COFEPRIS trámites
      // route to a named path instead (e.g. plaguicidas → /permiso-plaguicidas/
      // plaguicidas), so accept either — the point is that the catalogue is left.
      await page.waitForURL(/solicitud|plaguicid/i, { timeout: 60_000 });
      await page.waitForLoadState('domcontentloaded');
    });
  }

  /**
   * Opens a brand-new submission for the given procedure code via the real
   * VUCEM menu path: Trámites → Solicitudes nuevas → search → open. Convenience
   * wrapper that chains startNewSolicitud + openProcedureFromCatalogue.
   *
   * Shared by every new-submission journey (manual TC03–TC04). Procedures with
   * a different entry point can navigate themselves instead of calling this.
   */
  static async openNewProcedure(page: Page, procedureCode: string): Promise<void> {
    await SubmissionFlow.startNewSolicitud(page);
    await SubmissionFlow.openProcedureFromCatalogue(page, procedureCode);
  }

  /**
   * Fills the 'Datos Generales' tab — present on virtually every procedure.
   * Fills only the fields present in the data object; skips undefined fields.
   */
  static async fillGeneralTab(page: Page, data: ApplicantData): Promise<void> {
    await Logger.step('Fill Datos Generales tab', async () => {
      const tab = new Tab(page);
      await tab.click('Datos Generales');

      if (data.name) {
        const nameField = new TextField(page, 'Nombre o Razón Social');
        await nameField.fill(data.name);
      }

      if (data.rfc) {
        const rfcField = new TextField(page, 'RFC');
        await rfcField.fill(data.rfc);
      }

      if (data.curp) {
        const curpField = new TextField(page, 'CURP');
        await curpField.fill(data.curp);
      }

      if (data.email) {
        const emailField = new TextField(page, 'Correo Electrónico');
        await emailField.fill(data.email);
      }

      if (data.phone) {
        const phoneField = new TextField(page, 'Teléfono');
        await phoneField.fill(data.phone);
      }
    });
  }

  /**
   * Fills the 'Domicilio' tab — shared by most procedures.
   */
  static async fillAddressTab(page: Page, data: ApplicantData): Promise<void> {
    await Logger.step('Fill Domicilio tab', async () => {
      const tab = new Tab(page);
      await tab.click('Domicilio');

      if (data.state) {
        const stateDropdown = new Dropdown(page, 'Estado');
        await stateDropdown.select(data.state);
      }

      if (data.municipality) {
        const municipalityDropdown = new Dropdown(page, 'Municipio');
        await municipalityDropdown.select(data.municipality);
      }

      if (data.address) {
        const addressField = new TextField(page, 'Calle y Número');
        await addressField.fill(data.address);
      }

      if (data.postalCode) {
        const postalCodeField = new TextField(page, 'Código Postal');
        await postalCodeField.fill(data.postalCode);
      }
    });
  }

  /**
   * Clicks 'Enviar Solicitud', handles the confirmation modal,
   * and waits for the acknowledgement page to appear.
   * Shared by every procedure that has a standard submission flow.
   */
  static async submitAndConfirm(page: Page): Promise<void> {
    await Logger.step('Submit the procedure form', async () => {
      await page.getByRole('button', { name: /enviar solicitud/i }).click();

      const confirmModal = new Modal(page, 'Confirmar envío');
      await confirmModal.confirm();

      // Wait for VUCEM's post-submission acknowledgement page
      await page.waitForURL('**/acuse**', { timeout: 60_000 });
      await page.waitForLoadState('networkidle');
    });
  }

  /**
   * Saves the form as a draft without submitting.
   */
  static async saveDraft(page: Page): Promise<void> {
    await Logger.step('Save as draft', async () => {
      await page.getByRole('button', { name: /guardar borrador/i }).click();
      const successToast = page.getByRole('status', { name: /guardado/i });
      await successToast.waitFor();
    });
  }
}
