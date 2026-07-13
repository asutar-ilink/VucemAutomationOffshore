# test-data/files — required binary assets (not committed)

These files are referenced by the env configs and procedure test data but are
**not** checked into git (real certificates and PDFs must never be committed).
Drop them here locally / provide them via CI secrets before running the suite.

## 260204 — Permiso sanitario de importación de medicamentos

### e.firma (FIEL) credentials — login (`auth.setup.ts`) and signing (Paso 3)
Referenced by `test-data/envs/{qa,staging}.json` and `test-data/procedures/260204.json`:

| File | Purpose |
|---|---|
| `aal0409235e6.cer`            | Solicitante certificate (.cer) |
| `AAL0409235E6_1012231310.key` | Solicitante private key (.key)  |

Private-key password: `<efirma-key-password>` (already in the env / procedure JSON).

### Upload documents (Paso 2 — manual TC10)
Any valid PDF works (must be a real PDF: no forms, no embedded OLE/JS, no blank pages):

| File | Document section |
|---|---|
| `licencia_sanitaria.pdf`  | Licencia Sanitaria o Aviso de Funcionamiento. |
| `aviso_responsable.pdf`   | Aviso de responsable.                          |
| `registro_sanitario.pdf`  | Registro Sanitario vigente y sus modificaciones. |

> Without the `.cer`/`.key` files, `auth.setup.ts` cannot authenticate and the
> whole suite will fail at the setup step. These are the only assets that block
> a real run.
