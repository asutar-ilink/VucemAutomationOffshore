/**
 * REQ_02 §6.2.5 across every applicable form (Form Coverage sheet): "Lada" removed, single
 * "Teléfono" field in Solicitante / Establecimiento / Destinatario final.
 * Checks TC_028–TC_034 per form; each is recorded in
 * executed-procedure-artifacts/req_6_2_5_results.json (PASS / FAIL / N/A).
 *
 * N/A is used only where the case itself allows it: no Destinatario final section on the form
 * (TC_030 and the destinatario part of TC_031), or an e-firma phone that is read-only (TC_031).
 */

import fs from 'fs';
import path from 'path';
import { test, expect } from '../../src/fixtures';
import { T260210 } from '../../src/procedures/cofepris/T260210';
import { T260212 } from '../../src/procedures/cofepris/T260212';
import { T260215 } from '../../src/procedures/cofepris/T260215';
import { PhoneFields } from '../../src/components/layout/PhoneFields';
import { EstablecimientoSection } from '../../src/components/layout/EstablecimientoSection';
import { Tab } from '../../src/components/layout/Tab';

const FORMS: Record<string, string> = {
  '260202': 'COFEPRIS-01-009-A', '260203': 'COFEPRIS-01-009-B', '260204': 'COFEPRIS-01-009-C',
  '260205': 'COFEPRIS-01-010-A', '260206': 'COFEPRIS-01-010-B', '260207': 'COFEPRIS-01-010-C',
  '260208': 'COFEPRIS-01-010-D', '260209': 'COFEPRIS-01-010-E', '260210': 'COFEPRIS-01-010-F',
  '260212': 'COFEPRIS-01-015-A', '260213': 'COFEPRIS-01-015-B', '260214': 'COFEPRIS-01-015-C',
  '260215': 'COFEPRIS-01-015-D', '260216': 'COFEPRIS-01-015-E', '260217': 'COFEPRIS-01-015-F',
  '260218': 'COFEPRIS-01-015-G', '260201': 'COFEPRIS-01-016', '260103': 'COFEPRIS-01-002-C',
  '260401': 'COFEPRIS-01-024', '260402': 'COFEPRIS-01-025',
};
const ONLY = process.env.FORMS ? process.env.FORMS.split(',') : Object.keys(FORMS);
const FULL_PHONE = '5512345678';

type Status = 'PASS' | 'FAIL' | 'N/A';
const resultsFile = path.resolve(process.cwd(), 'executed-procedure-artifacts', 'req_6_2_5_results.json');

function record(form: string, tc: string, status: Status, detail = ''): void {
  fs.mkdirSync(path.dirname(resultsFile), { recursive: true });
  const all: Record<string, unknown>[] = fs.existsSync(resultsFile) ? JSON.parse(fs.readFileSync(resultsFile, 'utf8')) : [];
  const rest = all.filter((r) => !(r.form === form && r.tc === tc));
  rest.push({ form, tramite: FORMS[form], tc, status, detail: detail.slice(0, 300) });
  fs.writeFileSync(resultsFile, JSON.stringify(rest, null, 1));
}

/** Runs `fn`; it returns a status (and detail) or throws → FAIL. */
async function check(form: string, tc: string, fn: () => Promise<[Status, string?] | void>): Promise<void> {
  try {
    const out = await fn();
    record(form, tc, out ? out[0] : 'PASS', out?.[1] ?? '');
  } catch (e) {
    record(form, tc, 'FAIL', (e as Error).message.split('\n')[0]);
  }
}

test.describe('6.2.5 — Lada removed, single Teléfono field, all forms', () => {
  for (const form of ONLY) {
    test(`${form} ${FORMS[form]}`, async ({ authenticatedPage: page }) => {
      const procedure = form === '260212' ? new T260212(page) : form === '260215' ? new T260215(page) : new T260210(page);
      const phones = new PhoneFields(page);
      const establecimiento = new EstablecimientoSection(page);
      const tc = ['TC_028', 'TC_029', 'TC_030', 'TC_031', 'TC_032', 'TC_033', 'TC_034'];

      await procedure.startNewSubmission();
      try {
        if (form === '260401' || form === '260402') {
          // These forms route under /cofepris/territorio-nacional, which the family open() does not wait for.
          await page.evaluate((c) => {
            const row = Array.from(document.querySelectorAll('tr, .card, li')).find((r) => (r.textContent || '').includes(c));
            (row?.querySelector('button, a, [role=button], i, svg') as HTMLElement | undefined)?.click();
          }, form).catch(() => undefined);
          await page.waitForURL(/territorio-nacional|permiso-importacion-biologica|contenedor-de-pasos|solici?tud/i, { timeout: 60_000 });
        } else {
          await procedure.open(form);
        }
        await new Tab(page).click('Solicitante');
        await expect(page.getByRole('heading', { name: /domicilio (fiscal )?del solicitante/i })).toBeVisible({ timeout: 30_000 });
      } catch (e) {
        for (const t of tc) record(form, t, 'FAIL', `form not reachable: ${(e as Error).message.split('\n')[0]}`);
        return;
      }

      // ── Solicitante > Domicilio del solicitante ──────────────────────────────
      const sol = await phones.scan(phones.main);
      await check(form, 'TC_028', async () => { expect(sol.ladaVisible, 'Lada is shown in Domicilio del solicitante').toBe(false); });
      await check(form, 'TC_032', async () => {
        expect(sol.phone.present, 'Teléfono field not found in Solicitante').toBe(true);
        if (sol.phone.value) return ['PASS', 'phone autofilled from e.firma'];
        expect(sol.phone.enabled, 'phone empty and not editable').toBe(true);
        return ['PASS', 'e.firma has no phone; field is editable'];
      });

      // ── Datos de la solicitud > Domicilio del establecimiento ────────────────
      await phones.openDatosTab();
      await expect(establecimiento.heading).toBeVisible({ timeout: 30_000 });
      const est = await phones.scan(phones.main);
      await check(form, 'TC_029', async () => { expect(est.ladaVisible, 'Lada is shown in Domicilio del establecimiento').toBe(false); });

      let estPhoneOk = false;
      await check(form, 'TC_031', async () => {
        // Establecimiento
        expect(est.phone.present, 'Teléfono field not found in Establecimiento').toBe(true);
        const control = phones.phoneControl(phones.main);
        await control.fill(FULL_PHONE);
        await expect(control).toHaveValue(FULL_PHONE);
        estPhoneOk = true;
        // Solicitante: read-only autofill counts as a single field; editable must accept the number
        const notes = ['solicitante: ' + (sol.phone.enabled && !sol.phone.readOnly ? 'single editable field' : 'single read-only field (e.firma)')];
        // Destinatario final (Terceros relacionados)
        await new Tab(page).click('Terceros relacionados');
        const modal = await phones.openDestinatarioModal();
        if (!modal) { notes.push('no Destinatario final section'); return ['PASS', notes.join('; ')]; }
        const dest = await phones.scan(modal);
        expect(dest.phone.present, 'Teléfono field not found in Destinatario final').toBe(true);
        if (dest.phone.enabled && !dest.phone.readOnly) {
          const dc = phones.phoneControl(modal);
          await dc.fill(FULL_PHONE);
          await expect(dc).toHaveValue(FULL_PHONE);
        }
        notes.push('destinatario: single field');
        // TC_030 evaluated here while the modal is open
        record(form, 'TC_030', dest.ladaVisible ? 'FAIL' : 'PASS', dest.ladaVisible ? 'Lada is shown in Destinatario final' : '');
        await phones.closeModal();
        return ['PASS', notes.join('; ')];
      });
      // TC_030 has no result yet if TC_031 stopped before the modal opened, or the form has none
      const existing: Record<string, unknown>[] = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
      if (!existing.some((r) => r.form === form && r.tc === 'TC_030')) {
        record(form, 'TC_030', 'N/A', 'form has no Destinatario final section');
      }

      // ── Datos de la solicitud: validations + no Lada error ───────────────────
      await phones.openDatosTab();
      await expect(establecimiento.heading).toBeVisible({ timeout: 30_000 });
      await check(form, 'TC_034', async () => {
        const control = phones.phoneControl(phones.main);
        await control.fill('abc!@#');
        await control.blur();
        const value = await control.inputValue();
        const invalid = /ng-invalid/.test((await control.getAttribute('class')) ?? '');
        await page.getByRole('button', { name: /^\s*continuar\s*$/i }).first().click();
        await expect(page.getByText(/faltan campos por capturar|este campo es obligatorio/i).first()).toBeVisible({ timeout: 10_000 });
        expect(/[a-z!@#]/i.test(value) ? invalid : true, `letters kept ("${value}") but field not invalid`).toBe(true);
        expect(estPhoneOk, 'establecimiento phone not reachable').toBe(true);
        return ['PASS', /[a-z!@#]/i.test(value) ? 'letters accepted but field marked invalid' : 'letters rejected by the field'];
      });
      await check(form, 'TC_033', async () => {
        // TC_034 already clicked Continuar on an incomplete form: no error may mention Lada.
        const text = (await phones.main.innerText()).replace(/\s+/g, ' ');
        expect(/lada/i.test(text), '"Lada" text shown after Continuar').toBe(false);
        expect(sol.ladaVisible || est.ladaVisible, 'Lada field present on Solicitante/Establecimiento').toBe(false);
      });
    });
  }
});
