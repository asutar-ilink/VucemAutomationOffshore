import { Page, FrameLocator } from '@playwright/test';
import { TextField } from '../components/form/TextField';
import { Logger } from '../utils/Logger';
import { EfirmaCredentials } from '../types';

/** A scope that can hold the e.firma widget — the top-level page or an iframe. */
type EfirmaScope = Page | FrameLocator;

/** The portal entry point that hosts the (iframed) e.firma solicitante login. */
const SOLICITANTE_LOGIN_URL = 'https://portal-v30.cloud-ultrasist.net/portal/login-solicitante';

/**
 * LoginFlow handles authentication for the VUCEM portal.
 *
 * This is used in two ways:
 *   1. In auth.setup.ts to perform a real login and save browser state to disk.
 *   2. In tests that explicitly need to test the login flow itself.
 *
 * Most tests never call this directly — they receive an already-authenticated
 * page via the authenticatedPage fixture (which restores the saved state).
 */
export class LoginFlow {

  /**
   * Performs a full login sequence and waits for the dashboard to appear.
   * After this call, the page is on the VUCEM dashboard and authenticated.
   */
  static async login(page: Page, username: string, password: string): Promise<void> {
    await Logger.step('Navigate to login page', async () => {
      await page.goto('/login');
      await page.waitForLoadState('networkidle');
    });

    await Logger.step(`Enter credentials for ${username}`, async () => {
      const usernameField = new TextField(page, 'Usuario');
      const passwordField = new TextField(page, 'Contraseña');

      await usernameField.fill(username);
      await passwordField.fill(password);
    });

    await Logger.step('Submit login form', async () => {
      await page.getByRole('button', { name: /iniciar sesión|ingresar/i }).click();
    });

    await Logger.step('Wait for dashboard', async () => {
      // Wait for the dashboard element that confirms successful login
      await page.waitForURL('**/dashboard**', { timeout: 30_000 });
      await page.getByRole('heading', { name: /bienvenido|dashboard/i }).waitFor();
    });

    Logger.info(`Login successful for user: ${username}`);
  }

  /**
   * Performs an e.firma (FIEL) certificate login as a *solicitante* (citizen).
   *
   * This is VUCEM's real authentication method: the user uploads a certificate
   * (.cer) and private key (.key) and types the private-key password. Used by
   * COFEPRIS / SE procedures such as 260204.
   *
   * Path: /portal/login-solicitante → "Con e.firma" → upload .cer + .key →
   *        password → Ingresar → dashboard.
   */
  static async loginWithEfirma(page: Page, creds: EfirmaCredentials): Promise<void> {
    await Logger.step('Navigate to solicitante login page', async () => {
      // The e.firma form is served inside an iframe on the portal login page.
      // Logging in directly at front.v30/login does not establish a session —
      // the submission must happen within the portal-hosted iframe.
      await page.goto(SOLICITANTE_LOGIN_URL);
      await page.waitForLoadState('networkidle');
    });

    // Scope credential entry to the login iframe; after submit the whole page
    // navigates top-level to front.v30/seleccion-rol.
    const loginFrame = page.frameLocator('iframe[src*="/login"]');
    await LoginFlow.submitEfirmaCredentials(loginFrame, creds, /ingresar/i);

    await Logger.step('Wait for post-login (role selection)', async () => {
      await page.waitForURL(/seleccion-rol|home|dashboard/i, { timeout: 60_000 });
    });

    Logger.info('e.firma login successful (solicitante)');
  }

  /**
   * Selects the working role after login (e.g. 'Persona Moral') and accepts.
   * The role picker is a native <select> with no associated label, so it is
   * targeted directly here rather than via the label-based Dropdown component.
   */
  static async selectRole(page: Page, role: string): Promise<void> {
    await Logger.step(`Select role: ${role}`, async () => {
      await page.locator('select').first().selectOption({ label: role });
      await page.getByRole('button', { name: /aceptar/i }).click();
      // Lands on the solicitante workspace (bandeja de tareas pendientes).
      await page.waitForURL(/bandeja/i, { timeout: 60_000 });
      await page.waitForLoadState('networkidle');
    });
  }

  /**
   * Uploads the .cer / .key, types the private-key password, and clicks the
   * given submit button. Shared by solicitante login and document signing,
   * which present the same e.firma credential widget (inputs #cer/#key/#password).
   */
  static async submitEfirmaCredentials(
    scope: EfirmaScope,
    creds: EfirmaCredentials,
    submitButton: RegExp,
  ): Promise<void> {
    await Logger.step('Upload e.firma certificate (.cer)', async () => {
      await scope.locator('#cer').setInputFiles(creds.cerPath);
    });

    await Logger.step('Upload e.firma private key (.key)', async () => {
      await scope.locator('#key').setInputFiles(creds.keyPath);
    });

    await Logger.step('Enter private-key password', async () => {
      await scope.locator('#password').fill(creds.password);
    });

    await Logger.step('Submit e.firma credentials', async () => {
      await scope.getByRole('button', { name: submitButton }).click();
    });
  }

  /**
   * Logs out of the current session.
   */
  static async logout(page: Page): Promise<void> {
    await Logger.step('Logout', async () => {
      await page.getByRole('button', { name: /cerrar sesión|salir/i }).click();
      await page.waitForURL('**/login**');
    });
  }
}
