import { Page } from '@playwright/test';
import { LoginFlow } from './LoginFlow';
import { Logger } from '../utils/Logger';
import { EfirmaCredentials } from '../types';

/**
 * SigningFlow — FIEL (e.firma) document signing.
 *
 * Almost every VUCEM procedure ends with a "Firmar solicitud" step (Paso 3):
 * the applicant re-presents their certificate (.cer), private key (.key) and
 * private-key password to digitally sign the submission, which then produces
 * the acknowledgement ("Acuse de Recibo").
 *
 * The credential form is identical to the e.firma login form, so the actual
 * upload + password + submit is delegated to LoginFlow.submitEfirmaCredentials.
 * This flow owns the navigation/landing expectations specific to signing.
 *
 * Shared by all procedures — and later by the government dictamen flows, which
 * sign with the funcionario certificate. Keep procedure-specific assertions in
 * the procedure class, not here.
 */
export class SigningFlow {

  /**
   * Signs the current submission with the given e.firma credentials and waits
   * for the acknowledgement ("Acuse") page to load.
   */
  static async signSubmission(page: Page, creds: EfirmaCredentials): Promise<void> {
    await Logger.step('Sign submission with e.firma (Firmar)', async () => {
      await LoginFlow.submitEfirmaCredentials(page, creds, /firmar/i);
      // VUCEM routes to the acknowledgement (Acuse de Recibo) page after signing.
      await page.waitForURL(/acuse/i, { timeout: 60_000 });
      await page.waitForLoadState('networkidle');
    });
  }
}
