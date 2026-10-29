/**
 * REQ_02 §6.2.7 across every applicable form (Form Coverage sheet): the Paso-1 field
 * "No. de Aviso de funcionamiento o Licencia sanitaria" — new label, always visible,
 * mandatory in some forms and optional in others.
 *
 * Per form: TC_043 (label), TC_044 (visible), TC_046 (mandatory: empty blocks Continuar with a
 * message), TC_048 (optional: empty raises no validation), TC_049 (optional: no mandatory mark).
 * TC_047 (mandatory: can continue when filled) runs the Paso-1 journey up to Paso 2 for the
 * forms that have one; it does NOT send the request. TC_045 / TC_050 need a BackOffice funcionario
 * and are reported N/A. Results: executed-procedure-artifacts/req_6_2_7_results.json.
 */

import fs from 'fs';
import path from 'path';
import { test, expect } from '../../src/fixtures';
import { T260202, T260202Data } from '../../src/procedures/cofepris/T260202';
import { T260203, T260203Data } from '../../src/procedures/cofepris/T260203';
import { T260204, T260204Data } from '../../src/procedures/cofepris/T260204';
import { T260205, T260205Data } from '../../src/procedures/cofepris/T260205';
import { T260210, T260210Data } from '../../src/procedures/cofepris/T260210';
import { T260212 } from '../../src/procedures/cofepris/T260212';
import { T260215 } from '../../src/procedures/cofepris/T260215';
import { CofeprisRegistrationFlow } from '../../src/flows/CofeprisRegistrationFlow';
import { LicenciaField } from '../../src/components/layout/LicenciaField';
import { Tab } from '../../src/components/layout/Tab';
import d202 from '../../test-data/procedures/260202.json';
import d203 from '../../test-data/procedures/260203.json';
import d204 from '../../test-data/procedures/260204.json';
import d205 from '../../test-data/procedures/260205.json';
import d210 from '../../test-data/procedures/260210.json';

type Page = ConstructorParameters<typeof T260210>[0];

/** Form → [tramite, mandatory?] from the Form Coverage sheet. */
const FORMS: Record<string, [string, boolean]> = {
  '260202': ['COFEPRIS-01-009-A', true], '260203': ['COFEPRIS-01-009-B', true], '260204': ['COFEPRIS-01-009-C', true],
  '260205': ['COFEPRIS-01-010-A', true], '260206': ['COFEPRIS-01-010-B', false], '260207': ['COFEPRIS-01-010-C', true],
  '260208': ['COFEPRIS-01-010-D', false], '260209': ['COFEPRIS-01-010-E', true], '260210': ['COFEPRIS-01-010-F', true],
  '260212': ['COFEPRIS-01-015-A', false], '260213': ['COFEPRIS-01-015-B', false], '260214': ['COFEPRIS-01-015-C', true],
  '260215': ['COFEPRIS-01-015-D', true], '260216': ['COFEPRIS-01-015-E', true], '260217': ['COFEPRIS-01-015-F', true],
  '260218': ['COFEPRIS-01-015-G', true], '260201': ['COFEPRIS-01-016', true], '260103': ['COFEPRIS-01-002-C', false],
};
const ONLY = process.env.FORMS ? process.env.FORMS.split(',') : Object.keys(FORMS);
const ADUANA = 'ALTAMIRA'; // QA's catalogue no longer offers the Aduana used in some shared data

/** Pago data with a fresh llave de pago — the backend rejects a key already used by another trámite. */
const uniquePago = (): typeof d204.pago => ({ ...d204.pago, llavePago: `PAY${Math.random().toString(36).slice(2, 11).toUpperCase()}` });

/** Mandatory forms that have a Paso-1 journey in the framework (TC_047). */
const JOURNEYS: Record<string, (page: Page) => Promise<void>> = {
  '260202': async (page) => {
    const d = d202 as T260202Data; const p = new T260202(page);
    await p.startNewSubmission(); await p.open(d.procedureCode);
    await p.fillDatosSolicitud(d); await p.fillTerceros(d);
    await CofeprisRegistrationFlow.fillPago(page, uniquePago()); // QA now requires Pago de derechos
  },
  '260203': async (page) => {
    const d = { ...(d203 as T260203Data), aduana: ADUANA } as T260203Data; const p = new T260203(page);
    await p.startNewSubmission(); await p.open(d.procedureCode);
    await p.fillDatosSolicitud(d); await p.fillTerceros(d);
    await CofeprisRegistrationFlow.fillPago(page, uniquePago()); // QA now requires Pago de derechos
  },
  '260204': async (page) => {
    const d = d204 as T260204Data; const p = new T260204(page);
    await p.startNewSubmission(); await p.open(d.procedureCode);
    await p.fillDatosSolicitud(d); await p.fillTerceros(d); await p.fillPago(d.pago);
  },
  '260205': async (page) => {
    const d = d205 as T260205Data; const p = new T260205(page);
    await p.startNewSubmission(); await p.open(d.procedureCode);
    await p.fillDatosSolicitud(d); await p.fillTerceros(d);
    await CofeprisRegistrationFlow.fillPago(page, uniquePago()); // QA now requires Pago de derechos
  },
  '260210': async (page) => {
    const d = { ...(d210 as T260210Data), aduana: ADUANA } as T260210Data; const p = new T260210(page);
    await p.startNewSubmission(); await p.open(d.procedureCode);
    await p.fillDatosSolicitud(d); await p.fillTerceros(d);
    await CofeprisRegistrationFlow.fillPago(page, uniquePago()); // QA now requires Pago de derechos
  },
};

type Status = 'PASS' | 'FAIL' | 'N/A';
const resultsFile = path.resolve(process.cwd(), 'executed-procedure-artifacts', 'req_6_2_7_results.json');

function record(form: string, tc: string, status: Status, detail = ''): void {
  fs.mkdirSync(path.dirname(resultsFile), { recursive: true });
  const all: Record<string, unknown>[] = fs.existsSync(resultsFile) ? JSON.parse(fs.readFileSync(resultsFile, 'utf8')) : [];
  const rest = all.filter((r) => !(r.form === form && r.tc === tc));
  rest.push({ form, tramite: FORMS[form][0], mandatory: FORMS[form][1], tc, status, detail: detail.slice(0, 900) });
  fs.writeFileSync(resultsFile, JSON.stringify(rest, null, 1));
}

async function check(form: string, tc: string, fn: () => Promise<[Status, string?] | void>): Promise<void> {
  try {
    const out = await fn();
    record(form, tc, out ? out[0] : 'PASS', out?.[1] ?? '');
  } catch (e) {
    record(form, tc, 'FAIL', (e as Error).message.split('\n')[0]);
  }
}

test.describe('6.2.7 — "No. de Aviso de funcionamiento o Licencia sanitaria", all forms', () => {
  for (const form of ONLY) {
    const mandatory = FORMS[form][1];

    test(`${form} ${FORMS[form][0]} (${mandatory ? 'mandatory' : 'optional'}) — field checks`, async ({ authenticatedPage: page }) => {
      const procedure = form === '260212' ? new T260212(page) : form === '260215' ? new T260215(page) : new T260210(page);
      const field = new LicenciaField(page);
      const tcs = ['TC_043', 'TC_044', 'TC_046', 'TC_048', 'TC_049'];

      await procedure.startNewSubmission();
      try {
        await procedure.open(form);
        await new Tab(page).click('Solicitante');
        await field.openDatosTab();
        await expect(page.getByRole('heading', { name: /datos del establecimiento/i })).toBeVisible({ timeout: 30_000 });
      } catch (e) {
        for (const t of tcs) record(form, t, 'FAIL', `form not reachable: ${(e as Error).message.split('\n')[0]}`);
        return;
      }

      const before = await field.state();
      await check(form, 'TC_043', async () => {
        expect(before.found, 'field not found').toBe(true);
        expect(before.labelText).toBe(LicenciaField.LABEL);
      });
      await check(form, 'TC_044', async () => {
        expect(before.found, 'field not found').toBe(true);
        expect(before.visible, 'field not visible').toBe(true);
      });

      // Empty value + Continuar on an otherwise untouched form: only this field's own state is judged.
      await field.clear();
      await field.clickContinuar();
      await expect(page.getByText(/faltan campos por capturar|este campo es obligatorio/i).first()).toBeVisible({ timeout: 10_000 }).catch(() => undefined);
      const after = await field.state();
      if (!after.found) await page.screenshot({ path: path.resolve(process.cwd(), 'executed-procedure-artifacts', `req_6_2_7_${form}_after_continuar.png`) });

      if (mandatory) {
        await check(form, 'TC_046', async () => {
          expect(after.invalid || !!after.errorMessage, `empty field is not flagged and no message shown (before: ${JSON.stringify(before)}; after: ${JSON.stringify(after)})`).toBe(true);
          expect(after.errorMessage, 'no validation message under the field').not.toBe('');
          return ['PASS', `mark "*": ${before.requiredMark}; message: "${after.errorMessage}"`];
        });
        record(form, 'TC_048', 'N/A', 'optional forms only');
        record(form, 'TC_049', 'N/A', 'optional forms only');
      } else {
        record(form, 'TC_046', 'N/A', 'mandatory forms only');
        await check(form, 'TC_048', async () => {
          expect(after.invalid, 'optional field is flagged invalid when empty').toBe(false);
          expect(after.errorMessage, 'validation message shown for optional field').toBe('');
        });
        await check(form, 'TC_049', async () => {
          expect(before.requiredMark, `label shows the mandatory "*": ${before.label}`).toBe(false);
        });
      }
      record(form, 'TC_045', 'N/A', 'needs a funcionario in BackOffice');
      record(form, 'TC_050', 'N/A', 'needs a funcionario in BackOffice');
      if (!(mandatory && JOURNEYS[form])) {
        record(form, 'TC_047', 'N/A', mandatory ? 'no Paso-1 journey for this form in the framework' : 'mandatory forms only');
      }
    });

    if (mandatory && JOURNEYS[form]) {
      test(`${form} ${FORMS[form][0]} — TC_047 continue when filled`, async ({ authenticatedPage: page }) => {
        try {
          await JOURNEYS[form](page);
          await expect(page.getByRole('heading', { name: /requisitos obligatorios|documentaci[oó]n complementaria/i }).first()).toBeVisible({ timeout: 45_000 });
          record(form, 'TC_047', 'PASS', 'filled form continued to Paso 2 (request not sent)');
        } catch (e) {
          const banner = await page.locator('.alert, [role="alert"]').first().innerText().catch(() => '');
          const errs = await page.locator('main').evaluate((r) => Array.from(r.querySelectorAll('*'))
            .filter((el) => el.children.length === 0 && (el as HTMLElement).offsetParent && /obligatorio/i.test(el.textContent || ''))
            .map((el) => (el.closest('div')?.parentElement?.querySelector('label')?.textContent || '?').replace(/\s+/g, ' ').trim().slice(0, 50))).catch(() => []);
          await page.screenshot({ path: path.resolve(process.cwd(), 'executed-procedure-artifacts', `req_6_2_7_${form}_tc047.png`) }).catch(() => undefined);
          record(form, 'TC_047', 'FAIL', `${(e as Error).message.split('\n')[0]} | banner: ${banner.replace(/\s+/g, ' ').slice(0, 80)} | fields with errors: ${errs.join(', ')}`);
        }
      });
    }
  }
});
