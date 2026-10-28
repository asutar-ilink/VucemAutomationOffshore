/**
 * REQ_02 §6.2.3 across every applicable form (Form Coverage sheet): Paso 1 → "Datos del
 * establecimiento". Checks TC_016 (button hidden), TC_017 (fields enabled), TC_018 (no
 * search/connection error) and TC_019 (existing validations block Continuar) per form.
 * Each check is recorded individually and the table is written to
 * executed-procedure-artifacts/req_6_2_3_results.json for the result report.
 */

import fs from 'fs';
import path from 'path';
import { test, expect } from '../../src/fixtures';
import { T260210 } from '../../src/procedures/cofepris/T260210';
import { T260212 } from '../../src/procedures/cofepris/T260212';
import { T260215 } from '../../src/procedures/cofepris/T260215';
import { EstablecimientoSection } from '../../src/components/layout/EstablecimientoSection';
import { Tab } from '../../src/components/layout/Tab';

const FORMS: Record<string, string> = {
  '260202': 'COFEPRIS-01-009-A', '260203': 'COFEPRIS-01-009-B', '260204': 'COFEPRIS-01-009-C',
  '260205': 'COFEPRIS-01-010-A', '260206': 'COFEPRIS-01-010-B', '260207': 'COFEPRIS-01-010-C',
  '260208': 'COFEPRIS-01-010-D', '260209': 'COFEPRIS-01-010-E', '260210': 'COFEPRIS-01-010-F',
  '260212': 'COFEPRIS-01-015-A', '260213': 'COFEPRIS-01-015-B', '260214': 'COFEPRIS-01-015-C',
  '260215': 'COFEPRIS-01-015-D', '260216': 'COFEPRIS-01-015-E', '260217': 'COFEPRIS-01-015-F',
  '260218': 'COFEPRIS-01-015-G', '260201': 'COFEPRIS-01-016', '260103': 'COFEPRIS-01-002-C',
};
const ONLY = process.env.FORMS ? process.env.FORMS.split(',') : Object.keys(FORMS);

const resultsFile = path.resolve(process.cwd(), 'executed-procedure-artifacts', 'req_6_2_3_results.json');

function record(form: string, tc: string, status: 'PASS' | 'FAIL', detail = ''): void {
  fs.mkdirSync(path.dirname(resultsFile), { recursive: true });
  const all: Record<string, unknown>[] = fs.existsSync(resultsFile) ? JSON.parse(fs.readFileSync(resultsFile, 'utf8')) : [];
  const rest = all.filter((r) => !(r.form === form && r.tc === tc));
  rest.push({ form, tramite: FORMS[form], tc, status, detail: detail.slice(0, 300) });
  fs.writeFileSync(resultsFile, JSON.stringify(rest, null, 1));
}

async function check(form: string, tc: string, fn: () => Promise<void>): Promise<boolean> {
  try { await fn(); record(form, tc, 'PASS'); return true; }
  catch (e) { record(form, tc, 'FAIL', (e as Error).message.split('\n')[0]); return false; }
}

test.describe('6.2.3 — Datos del establecimiento, all forms', () => {
  for (const form of ONLY) {
    test(`${form} ${FORMS[form]}`, async ({ authenticatedPage: page }) => {
      // open() waits for a family-specific URL, so 260212/260215 use their own classes.
      const procedure = form === '260212' ? new T260212(page) : form === '260215' ? new T260215(page) : new T260210(page);
      const section = new EstablecimientoSection(page);

      await procedure.startNewSubmission();
      const opened = await check(form, 'OPEN', async () => {
        await procedure.open(form);
        await new Tab(page).click('Datos de la solicitud');
        await expect(section.heading).toBeVisible({ timeout: 30_000 });
      });
      if (!opened) {
        await page.screenshot({ path: path.resolve(process.cwd(), 'executed-procedure-artifacts', `req_6_2_3_${form}_open_failed.png`) });
        for (const tc of ['TC_016', 'TC_017', 'TC_018', 'TC_019']) record(form, tc, 'FAIL', 'form/section not reachable');
        return;
      }

      await check(form, 'TC_016', async () => { await expect(section.seleccionarButton).toHaveCount(0); });
      await check(form, 'TC_017', async () => {
        const fields = await section.fieldStates();
        expect(fields.length, 'no establishment fields found').toBeGreaterThan(0);
        const locked = fields.filter((f) => !f.enabled || f.readOnly).map((f) => f.name);
        expect(locked, `locked fields: ${locked.join(',')}`).toEqual([]);
      });
      await check(form, 'TC_018', async () => {
        await expect(section.searchOrConnectionError).toHaveCount(0);
        await expect(page.getByRole('dialog')).toHaveCount(0);
      });
      await check(form, 'TC_019', async () => {
        await page.getByRole('button', { name: /^\s*continuar\s*$/i }).first().click();
        await expect(page.getByText(/faltan campos por capturar|este campo es obligatorio/i).first()).toBeVisible({ timeout: 10_000 });
        await expect(page.getByRole('heading', { name: /requisitos obligatorios/i })).toHaveCount(0);
      });
    });
  }
});
