---
description: Derive selectors from the live VUCEM app using Playwright codegen with the saved e.firma session
argument-hint: [start-url] (defaults to the current ENV's baseUrl)
---

Derive locators for the screen I'm working on from the **live app** — never from memory or any
external source.

Load the `playwright-cli` skill (codegen invocation + COFEPRIS codegen caveat) and the
`vucem-framework` skill ("COFEPRIS reactive-form patterns → component strategy" — the pattern→component
mapping). Follow those; this command only sequences them.

1. Ensure `auth/state.json` exists — run `npm run auth` if it's missing or stale.
2. Resolve the start URL: use $1 if given, else the `baseUrl` from `test-data/envs/${ENV:-qa}.json`.
3. Launch codegen authenticated at that URL (`npm run codegen -- <url>`), then have me navigate to
   the target screen and Pick locator on each control, per the `playwright-cli` skill.
4. Place each locator in the correct component using the mapping in the `vucem-framework` skill —
   never paste generated code into a spec/flow/procedure.

Report the derived locators and which component (new or existing) each belongs in.
