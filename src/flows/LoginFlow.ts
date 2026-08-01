import { Page, FrameLocator } from '@playwright/test';
import { TextField } from '../components/form/TextField';
import { Logger } from '../utils/Logger';
import { EfirmaCredentials } from '../types';

/** A scope that can hold the e.firma widget — the top-level page or an iframe. */
type EfirmaScope = Page | FrameLocator;

/** The portal entry point that hosts the (iframed) e.firma solicitante login. */
const SOLICITANTE_LOGIN_URL = 'https://portal-v30.cloud-ultrasist.net/portal/login-solicitante';

/** The authenticated workspace landing (bandeja de tareas pendientes). */
const BANDEJA_PATH = '/bandeja-de-tareas-pendientes';

/**
 * LoginFlow handles authentication for the VUCEM portal.
 *
 * Two paths, both used by the authenticatedPage fixture:
 *   1. loginWithEfirma + selectRole — a real e.firma (FIEL) login. Used by
 *      auth.setup.ts to establish a session and save browser state to disk,
 *      and as the fixture's fallback when no valid saved state exists.
 *   2. restoreSession — the fast path: rehydrate a saved state and land on the
 *      bandeja WITHOUT re-logging in. front.v30 keeps its 30-min access token
 *      in sessionStorage (which storageState does NOT persist), but silently
 *      re-mints it from the 24h refresh_token cookie that the saved state DOES
 *      carry. So a restored context is fully authenticated once it hits an app
 *      route — no e.firma cert upload per test.
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
   *        password → "Iniciar sesión" → seleccion-rol.
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
    // navigates top-level to front.v30/seleccion-rol. The submit button is
    // labelled "Iniciar sesión" (older builds used "Ingresar") — accept both.
    const loginFrame = page.frameLocator('iframe[src*="/login"]');
    await LoginFlow.submitEfirmaCredentials(loginFrame, creds, /iniciar sesión|ingresar/i);

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
   * Fast path: reuse a saved session instead of logging in.
   *
   * Navigates straight to the bandeja on an already state-restored context and
   * waits for the authenticated workspace to render. Role selection is skipped
   * entirely — that page (seleccion-rol) only builds its dropdown from the
   * one-time login URL fragment, which a restored session never has; the app
   * defaults to the user's principal role, which is what every spec assumes.
   *
   * Returns true when the workspace loaded (session live), false when the app
   * bounced back to login (state missing/expired) so the caller can fall back
   * to a full e.firma login.
   */
  static async restoreSession(page: Page): Promise<boolean> {
    return Logger.step('Restore saved session (bandeja)', async () => {
      await page.goto(BANDEJA_PATH);
      // The Trámites toggle is the first authenticated-workspace control the
      // DOM needs (SubmissionFlow.startNewSolicitud waits on the same signal).
      // If the session is dead the app renders the e.firma login iframe instead
      // and this never appears.
      try {
        await page
          .getByRole('button', { name: 'Trámites' })
          .first()
          .waitFor({ state: 'visible', timeout: 15_000 });
        return true;
      } catch {
        Logger.info('Saved session is stale — falling back to e.firma login');
        return false;
      }
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
