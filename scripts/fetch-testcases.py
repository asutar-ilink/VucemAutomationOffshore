#!/usr/bin/env python3
"""
fetch-testcases
===============

Export Azure DevOps test cases for a specific *procedure* number to clean JSON,
written straight into this repo's ``manual-testcases/`` drop zone so the
``/add-procedure`` workflow can pick them up with no manual copy.

The procedure number is found inside the test-case **title** (e.g. a title such
as "260204 - Verify Registration" belongs to procedure 260204). Test cases whose
title contains the word "Extensive" (case-insensitive) are skipped.

Usage (via npm — args after ``--`` are forwarded to this script):

    npm run fetch -- 260512                          # plan/suite from the registry
    npm run fetch -- 260512 --plan 29 --suite 18126  # override plan/suite per run

Direct:

    python scripts/fetch-testcases.py 260512
    python scripts/fetch-testcases.py --procedure 260305 --suite 18033

Plan/suite are resolved with precedence **CLI flags > registry > .env**: register
a procedure once in ``scripts/ado-suites.json`` (code → suite id) and thereafter
``npm run fetch -- <code>`` needs no ``--suite``/``--plan``. Org, project and PAT
are read from a gitignored ``.env`` at the repo root — see ``.env.example``.

The e.firma private-key password (which ADO steps embed in plain text) is
scrubbed from the output — replaced with ``<efirma-key-password>`` using the real
value read from the gitignored ``test-data/envs/<env>.json`` — so a fetched file
is always safe to commit.

Requires: requests, python-dotenv  (pip install -r scripts/requirements.txt)
"""

import os
import re
import sys
import html
import json
import base64
import logging
import argparse
import xml.etree.ElementTree as ET
from urllib.parse import quote

import requests
from dotenv import load_dotenv

__version__ = "1.1.0"

log = logging.getLogger("fetch_testcases")


# --------------------------------------------------------------------------- #
# Constants
# --------------------------------------------------------------------------- #

API_VERSION = "7.0"
EXCLUDE_KEYWORD = "extensive"          # case-insensitive title exclusion
WORKITEM_BATCH_SIZE = 200              # ADO cap for the batch work-item endpoint

# Where exported <procedure>.json files land. Defaults to this repo's drop zone
# so the /add-procedure workflow needs no manual copy. Override via OUTPUT_FOLDER.
DEFAULT_OUTPUT_FOLDER = "manual-testcases"

# Repo root (this file lives in <root>/scripts).
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Per-procedure plan/suite registry, so `npm run fetch -- <code>` needs no
# --suite/--plan. Maps procedure code → suite id (or {"suite", "plan"}), plus a
# shared default "plan". Lives next to this script.
SUITE_REGISTRY_PATH = os.path.join(REPO_ROOT, "scripts", "ado-suites.json")

# e.firma password placeholder written in place of the real private-key password
# so a fetched file is always safe to commit (the real password lives only in the
# gitignored test-data/envs/<env>.json — never in committed manual test cases).
EFIRMA_PLACEHOLDER = "<efirma-key-password>"
ENV_FILES = ("test-data/envs/qa.json", "test-data/envs/staging.json")

# Candidate field names that may hold "preconditions". ADO has no native
# preconditions field, so we probe a few common/custom ones and use the first
# that is populated. Extend this list if your project uses a different field.
PRECONDITION_FIELDS = (
    "Microsoft.VSTS.TCM.Preconditions",
    "Custom.Preconditions",
    "Microsoft.VSTS.TCM.SystemInfo",
)


# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #

class Config:
    """Holds validated runtime configuration loaded from the environment."""

    def __init__(self):
        self.organization = os.getenv("ADO_ORGANIZATION", "").strip()
        self.project = os.getenv("ADO_PROJECT", "").strip()
        self.pat = os.getenv("ADO_PAT", "").strip()
        self.plan_id = os.getenv("TEST_PLAN_ID", "").strip()
        self.suite_id = os.getenv("TEST_SUITE_ID", "").strip()
        self.output_folder = os.getenv("OUTPUT_FOLDER", DEFAULT_OUTPUT_FOLDER).strip()

    def validate(self):
        missing = [
            name for name, value in (
                ("ADO_ORGANIZATION", self.organization),
                ("ADO_PROJECT", self.project),
                ("ADO_PAT", self.pat),
                ("TEST_PLAN_ID", self.plan_id),
                ("TEST_SUITE_ID", self.suite_id),
            )
            if not value
        ]
        if missing:
            raise ValueError(
                "Missing required configuration: "
                + ", ".join(missing)
                + ". Set them in your .env file (see .env.example), or pass "
                "--plan / --suite on the command line."
            )


# --------------------------------------------------------------------------- #
# Azure DevOps REST client
# --------------------------------------------------------------------------- #

class AdoClient:
    """Thin wrapper over the Azure DevOps REST API for test-case export."""

    def __init__(self, cfg: Config):
        self.cfg = cfg
        self.base_org = f"https://dev.azure.com/{quote(cfg.organization)}"
        self.base_project = f"{self.base_org}/{quote(cfg.project)}"
        token = base64.b64encode(f":{cfg.pat}".encode()).decode()
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Basic {token}",
            "Content-Type": "application/json",
        })

    def _get(self, url, **kwargs):
        resp = self.session.get(url, timeout=60, **kwargs)
        if resp.status_code != 200:
            raise RuntimeError(
                f"ADO request failed ({resp.status_code}) for {url}\n{resp.text[:500]}"
            )
        return resp.json()

    def get_suite_test_case_ids(self):
        """Return the list of test-case work-item IDs contained in the suite."""
        url = (
            f"{self.base_project}/_apis/testplan/Plans/{self.cfg.plan_id}"
            f"/Suites/{self.cfg.suite_id}/TestCase?api-version={API_VERSION}"
        )
        ids = []
        while url:
            data = self._get(url)
            for entry in data.get("value", []):
                wi_id = _extract_workitem_id(entry)
                if wi_id is not None:
                    ids.append(wi_id)
            # Handle continuation token pagination if present.
            cont = data.get("continuationToken")
            if cont:
                sep = "&" if "?" in url else "?"
                url = f"{url}{sep}continuationToken={quote(str(cont))}"
            else:
                url = None
        # De-duplicate while preserving order.
        return list(dict.fromkeys(ids))

    def get_work_items(self, ids):
        """Fetch full field data for the given work-item IDs (batched)."""
        items = []
        for start in range(0, len(ids), WORKITEM_BATCH_SIZE):
            batch = ids[start:start + WORKITEM_BATCH_SIZE]
            ids_str = ",".join(str(i) for i in batch)
            url = (
                f"{self.base_org}/_apis/wit/workitems"
                f"?ids={ids_str}&$expand=fields&api-version={API_VERSION}"
            )
            log.info("Fetching work-item batch %d (%d items)...",
                     start // WORKITEM_BATCH_SIZE + 1, len(batch))
            items.extend(self._get(url).get("value", []))
        return items


def _extract_workitem_id(entry):
    """Pull the work-item id out of a suite TestCase entry (schema-tolerant)."""
    for key in ("workItem", "testCase"):
        sub = entry.get(key)
        if isinstance(sub, dict) and sub.get("id") is not None:
            try:
                return int(sub["id"])
            except (TypeError, ValueError):
                pass
    if entry.get("id") is not None:
        try:
            return int(entry["id"])
        except (TypeError, ValueError):
            pass
    return None


# --------------------------------------------------------------------------- #
# Title-based filtering
# --------------------------------------------------------------------------- #

def matches_procedure(title, procedure):
    """True if `procedure` appears as a standalone token in the title."""
    if not title:
        return False
    return re.search(r"\b" + re.escape(str(procedure)) + r"\b", title) is not None


def is_excluded(title):
    """True if the title contains the EXCLUDE_KEYWORD (case-insensitive)."""
    return EXCLUDE_KEYWORD in str(title or "").lower()


# --------------------------------------------------------------------------- #
# Parsing raw ADO fields into normalized JSON
# --------------------------------------------------------------------------- #

def strip_html(value):
    """Convert an HTML/encoded ADO string fragment into clean plain text."""
    if not value:
        return ""
    text = html.unescape(str(value))
    text = re.sub(r"<\s*br\s*/?>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"</\s*(p|div|li)\s*>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)            # drop remaining tags
    text = html.unescape(text)                      # double-encoded entities
    return re.sub(r"[ \t]+\n", "\n", text).strip()


def split_lines(value):
    """Split a multi-line text blob into a list of non-empty trimmed lines."""
    clean = strip_html(value)
    return [ln.strip() for ln in clean.splitlines() if ln.strip()]


def parse_tags(value):
    """ADO stores tags as a single '; '-separated string."""
    if not value:
        return []
    return [t.strip() for t in str(value).split(";") if t.strip()]


def parse_steps(steps_xml):
    """
    Parse the Microsoft.VSTS.TCM.Steps XML into a list of
    {"step": n, "action": ..., "expected": ...} dicts.
    """
    if not steps_xml:
        return []
    try:
        root = ET.fromstring(steps_xml)
    except ET.ParseError as exc:
        log.warning("Could not parse test steps XML: %s", exc)
        return []

    steps = []
    for idx, step in enumerate(root.iter("step"), start=1):
        step_type = step.get("type", "")
        if step_type == "SharedStepReference":
            steps.append({
                "step": idx,
                "action": f"[Shared step reference: {step.get('ref', '')}]",
                "expected": "",
            })
            continue
        parts = step.findall("parameterizedString")
        action = strip_html(parts[0].text) if len(parts) >= 1 else ""
        expected = strip_html(parts[1].text) if len(parts) >= 2 else ""
        steps.append({"step": idx, "action": action, "expected": expected})
    return steps


def parse_parameters(fields):
    """
    Extract test-case parameters (if available).

    Returns {"names": [...], "rows": [ {name: value, ...}, ... ]} or None.
    Parameter names live in Microsoft.VSTS.TCM.Parameters; the data table lives
    in Microsoft.VSTS.TCM.LocalDataSource (XML).
    """
    params_xml = fields.get("Microsoft.VSTS.TCM.Parameters")
    data_xml = fields.get("Microsoft.VSTS.TCM.LocalDataSource")

    names = []
    if params_xml:
        try:
            proot = ET.fromstring(params_xml)
            names = [p.get("name") for p in proot.iter("param") if p.get("name")]
        except ET.ParseError:
            names = []

    rows = []
    if data_xml:
        try:
            droot = ET.fromstring(data_xml)
            # LocalDataSource holds an inner DataSet/Table; iterate any element
            # that carries column-named attributes/children.
            for row in droot.iter():
                if row.tag.lower() in ("table1", "row"):
                    row_data = {child.tag: (child.text or "") for child in row}
                    if row_data:
                        rows.append(row_data)
        except ET.ParseError:
            rows = []

    if not names and not rows:
        return None
    return {"names": names, "rows": rows}


def get_precondition(fields):
    """Return preconditions as a list of lines from the first populated field."""
    for field in PRECONDITION_FIELDS:
        if fields.get(field):
            return split_lines(fields[field])
    return []


def normalize_test_case(work_item, procedure):
    """Convert a raw ADO work item into the clean normalized JSON structure."""
    fields = work_item.get("fields", {})
    title = fields.get("System.Title", "")
    # Strip a leading "<procedure> - " / "<procedure>:" prefix from the title.
    clean_title = re.sub(
        r"^\s*" + re.escape(str(procedure)) + r"\s*[-:â]\s*", "", title
    ).strip() or title

    return {
        "id": work_item.get("id"),
        "procedure": str(procedure),
        "title": clean_title,
        "priority": fields.get("Microsoft.VSTS.Common.Priority"),
        "state": fields.get("System.State", ""),
        "description": strip_html(fields.get("System.Description", "")),
        "preconditions": get_precondition(fields),
        "tags": parse_tags(fields.get("System.Tags", "")),
        "steps": parse_steps(fields.get("Microsoft.VSTS.TCM.Steps", "")),
        "parameters": parse_parameters(fields),
    }


# --------------------------------------------------------------------------- #
# Export / orchestration
# --------------------------------------------------------------------------- #

def load_suite_registry():
    """Load the per-procedure plan/suite registry (scripts/ado-suites.json)."""
    try:
        with open(SUITE_REGISTRY_PATH, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def resolve_plan_suite(procedure, registry):
    """
    Resolve (plan, suite) for a procedure from the registry. Returns strings (or
    None when unknown). The registry maps code → suite id (or {"suite", "plan"}),
    with a shared default "plan". A missing code yields the default plan and no
    suite (so the caller falls back to .env for the suite).
    """
    if not registry:
        return (None, None)
    default_plan = registry.get("plan")
    entry = (registry.get("suites") or {}).get(str(procedure))
    if isinstance(entry, dict):
        plan = entry.get("plan", default_plan)
        suite = entry.get("suite")
    else:
        plan = default_plan
        suite = entry  # a bare id, or None when the code is not registered
    return (
        str(plan) if plan is not None else None,
        str(suite) if suite is not None else None,
    )


def load_efirma_passwords():
    """
    Collect the e.firma private-key password(s) from the gitignored env files, so
    they can be scrubbed from the fetched output. Returns a set (empty if none —
    e.g. in CI, where the env files are absent and nothing needs scrubbing).
    """
    secrets = set()
    for rel in ENV_FILES:
        try:
            with open(os.path.join(REPO_ROOT, rel), encoding="utf-8") as f:
                pw = (json.load(f).get("efirma") or {}).get("password")
        except (OSError, ValueError):
            continue
        if pw:
            secrets.add(pw)
    return secrets


def redact_secrets(payload, secrets):
    """Replace every occurrence of each secret with the e.firma placeholder."""
    if not secrets:
        return payload, False
    text = json.dumps(payload, ensure_ascii=False)
    redacted = text
    for s in secrets:
        redacted = redacted.replace(s, EFIRMA_PLACEHOLDER)
    return json.loads(redacted), redacted != text


def write_json(path, payload):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)


def export_test_cases(test_cases, output_folder, procedure):
    """Write all test cases into a single '<procedure>.json' file."""
    os.makedirs(output_folder, exist_ok=True)
    out_path = os.path.join(output_folder, f"{procedure}.json")
    write_json(out_path, test_cases)
    log.info("Wrote %d test case(s) to '%s'", len(test_cases), out_path)
    return out_path


def run(procedure, cfg: Config):
    """Fetch, filter, normalize and export test cases for one procedure."""
    client = AdoClient(cfg)

    log.info("Reading test cases from plan %s / suite %s ...",
             cfg.plan_id, cfg.suite_id)
    suite_ids = client.get_suite_test_case_ids()
    log.info("Suite contains %d test case(s).", len(suite_ids))
    if not suite_ids:
        log.warning("No test cases found in the suite - nothing to export.")
        return []

    work_items = client.get_work_items(suite_ids)

    exported, skipped_proc, skipped_excl = [], 0, 0
    for wi in work_items:
        title = wi.get("fields", {}).get("System.Title", "")
        if not matches_procedure(title, procedure):
            skipped_proc += 1
            continue
        if is_excluded(title):
            log.info("Skipping excluded test case %s: %s", wi.get("id"), title)
            skipped_excl += 1
            continue
        exported.append(normalize_test_case(wi, procedure))

    exported.sort(key=lambda tc: tc.get("id") or 0)
    log.info(
        "Matched %d test case(s) for procedure %s "
        "(skipped %d non-matching, %d 'Extensive').",
        len(exported), procedure, skipped_proc, skipped_excl,
    )

    if exported:
        # Scrub the e.firma private-key password (ADO steps embed it in plain
        # text) so the fetched file is always safe to commit.
        exported, redacted = redact_secrets(exported, load_efirma_passwords())
        if redacted:
            log.info("Redacted e.firma password → '%s'.", EFIRMA_PLACEHOLDER)
        out_path = export_test_cases(exported, cfg.output_folder, procedure)
        # Next-step hint for the wired workflow.
        log.info("Next: /add-procedure %s   (source: %s)", procedure, out_path)
    else:
        log.warning("No matching test cases for procedure %s - no files written.",
                    procedure)
    return exported


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #

def configure_logging():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)-7s  %(message)s",
        datefmt="%H:%M:%S",
    )


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        prog="fetch-testcases",
        description="Export Azure DevOps test cases for a given procedure number.",
    )
    parser.add_argument(
        "procedure", nargs="?",
        help="Procedure number to export (e.g. 260204). "
             "Overrides PROCEDURE_NUMBER from .env.",
    )
    parser.add_argument(
        "-p", "--procedure", dest="procedure_opt",
        help="Procedure number (alternative flag form).",
    )
    parser.add_argument(
        "--plan", dest="plan_id",
        help="Test plan ID (overrides TEST_PLAN_ID from .env).",
    )
    parser.add_argument(
        "--suite", dest="suite_id",
        help="Test suite ID (overrides TEST_SUITE_ID from .env).",
    )
    return parser.parse_args(argv)


def resolve_procedure(args):
    """Determine the procedure number from CLI args, then .env, else error."""
    procedure = (
        args.procedure
        or args.procedure_opt
        or os.getenv("PROCEDURE_NUMBER", "").strip()
    )
    if not procedure:
        raise ValueError(
            "No procedure number provided. Pass it as an argument "
            "(e.g. `npm run fetch -- 260204`) or set PROCEDURE_NUMBER in .env."
        )
    return str(procedure).strip()


def main(argv=None):
    configure_logging()
    try:
        args = parse_args(argv)
        load_dotenv()
        cfg = Config()
        procedure = resolve_procedure(args)
        # Resolve plan/suite with precedence CLI > registry > .env: start from the
        # .env defaults (already in cfg), let the per-procedure registry override
        # them (so a stale .env suite can't win for a registered code), then let
        # explicit CLI flags override everything.
        reg_plan, reg_suite = resolve_plan_suite(procedure, load_suite_registry())
        if reg_plan:
            cfg.plan_id = reg_plan
        if reg_suite:
            cfg.suite_id = reg_suite
        if args.plan_id:
            cfg.plan_id = str(args.plan_id).strip()
        if args.suite_id:
            cfg.suite_id = str(args.suite_id).strip()
        cfg.validate()
        log.info("Exporting procedure %s", procedure)
        run(procedure, cfg)
    except Exception as exc:  # top-level guard: log cleanly, exit non-zero
        log.error("%s", exc)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
