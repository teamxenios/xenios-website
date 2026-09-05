"""Validate supplied source integrity without creating or activating prices.

The package's declared hashes establish byte agreement, not founder approval.
Only allowlisted product/pricing fields leave this reader. Missing source files
remain explicit blockers even when the available CSV and JSON agree.
"""
import argparse
import csv
import hashlib
from decimal import Decimal, InvalidOperation
import json
from pathlib import Path
import re
import subprocess

from inspect_source import inventory, safe_relative, sha256

PREFIX = "XENIOS_SETH_"
LAUNCH = "manifests/" + PREFIX + "LIVE_REVENUE_LAUNCH_MANIFEST_2026-09-05.json"
PHASE_A = "manifests/" + PREFIX + "PHASE_A_DIRECT_BUY_PRICES_2026-09-05.csv"
PHASE_B = "manifests/" + PREFIX + "PHASE_B_EXPANSION_QUEUE_2026-09-05.csv"
WORKBOOK = "inputs/" + PREFIX + "PRICING_REVIEW_FORM_2026-09-04.xlsx"
TIERS = ((1, "seth_single_unit_price_cents", "single_unit_price"),
         (5, "seth_5_plus_unit_price_cents", "price_5_plus"),
         (10, "seth_10_plus_unit_price_cents", "price_10_plus"))
MAX_CENTS = 9_007_199_254_740_991
WORKBOOK_EVIDENCE = "docs/revenue-launch/20260905/complete-workbook-reconciliation.json"
SOURCE_HASH_EVIDENCE = "docs/revenue-launch/20260905/complete-package-source-hashes.json"
ARCHIVE_EVIDENCE = "docs/revenue-launch/20260905/complete-package-archive-audit.json"
ROW_DIGEST_METHOD = "sha256_python_json_sort_keys_utf8_compact_complete_source_row_v1"


def parse_json(text):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError("Duplicate JSON key")
            result[key] = value
        return result
    return json.loads(text, object_pairs_hook=pairs,
                      parse_constant=lambda _: (_ for _ in ()).throw(ValueError("Nonfinite JSON number")))


def read_json(path):
    return parse_json(path.read_text(encoding="utf-8-sig"))


def source_row_digest(row):
    """Hash the complete original row, without emitting private fields or notes."""
    canonical = json.dumps(row, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def verify_workbook_record(record, workbook_digest):
    if (record.get("schemaVersion") != 1 or record.get("workbookSha256") != workbook_digest
            or record.get("workbookCellsReconciled") is not True
            or record.get("phaseARows") != 39 or record.get("phaseATierValues") != 117
            or record.get("phaseBRows") != 68 or record.get("phaseBTierValues") != 204
            or record.get("checks", {}).get("comparisons") != 8758
            or record.get("checks", {}).get("independentlyEvaluatedTierFormulas") != 214
            or record.get("checks", {}).get("independentlyEvaluatedOtherFormulas") != 156
            or record.get("statisticsVerified") is not True):
        raise ValueError("Independent workbook evidence does not bind this complete source")


def prior_workbook_verification(commit, resolved, manifest_digest, checksums_digest):
    """Import prior independent evidence from a committed ancestor, never a checkbox.

    This does not claim to rerun workbook calculations. It preserves the original
    observation and binds the proof to current workbook and source file bytes.
    """
    if not re.fullmatch(r"[a-f0-9]{40}", commit) or WORKBOOK not in resolved:
        raise ValueError("Workbook evidence requires an exact commit and workbook")
    root = Path(__file__).resolve().parents[2]
    subprocess.run(["git", "merge-base", "--is-ancestor", commit, "HEAD"], cwd=root, check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    proof_bytes = subprocess.check_output(["git", "show", f"{commit}:{WORKBOOK_EVIDENCE}"], cwd=root)
    hashes_bytes = subprocess.check_output(["git", "show", f"{commit}:{SOURCE_HASH_EVIDENCE}"], cwd=root)
    archive_bytes = subprocess.check_output(["git", "show", f"{commit}:{ARCHIVE_EVIDENCE}"], cwd=root)
    archive = parse_json(archive_bytes.decode())
    if (archive.get("manifestEntriesVerified") != 44 or archive.get("checksumEntriesVerified") != 44
            or archive.get("extractionFilesVerified") != 46 or archive.get("errors") != []
            or archive.get("missingFiles") != [] or not re.fullmatch(r"[a-f0-9]{64}", archive.get("zipSha256", ""))):
        raise ValueError("Complete archive verification evidence required")
    proof, hashes = parse_json(proof_bytes.decode()), parse_json(hashes_bytes.decode())
    if hashes.get("packageManifestSha256") != manifest_digest or hashes.get("checksumsSha256") != checksums_digest:
        raise ValueError("Independent verification belongs to a different source package")
    declared = {entry["path"]: entry["sha256"] for entry in hashes["files"]}
    for name in (LAUNCH, PHASE_A, PHASE_B, WORKBOOK):
        if declared.get(name) != sha256(resolved[name]):
            raise ValueError("Independent verification source bytes changed")
    verify_workbook_record(proof, sha256(resolved[WORKBOOK]))
    return {"commit": commit, "path": WORKBOOK_EVIDENCE,
            "gitBlobSha256": hashlib.sha256(proof_bytes).hexdigest(),
            "workbookSha256": proof["workbookSha256"], "observedAt": proof["observedAt"],
            "packageArchiveSha256": archive["zipSha256"],
            "archiveEvidenceGitBlobSha256": hashlib.sha256(archive_bytes).hexdigest(),
            "method": "prior_independent_verification_bound_to_current_source_bytes"}


def checksums_agree(package, path):
    declared = {entry["path"]: entry["sha256"] for entry in package["files"]}
    parsed = {}
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        match = re.fullmatch(r"([0-9a-f]{64})  (.+)", line)
        if not match:
            raise ValueError("Invalid checksum line")
        digest, name = match.groups()
        safe_relative(name)
        if name in parsed:
            raise ValueError("Duplicate checksum path")
        parsed[name] = digest
    if declared != parsed:
        raise ValueError("Checksums and package manifest disagree")
    return len(parsed)


def dollars_to_cents(value):
    if value == "":
        return None
    # Do not round, coerce formulas, or accept float/scientific notation.
    if not isinstance(value, str) or not re.fullmatch(r"\d+(?:\.\d{1,2})?", value):
        raise ValueError("Invalid decimal dollar amount")
    try:
        amount = Decimal(value) * 100
    except InvalidOperation as exc:
        raise ValueError("Invalid decimal dollar amount") from exc
    if amount > MAX_CENTS:
        raise ValueError("Amount outside canonical integer-cent range")
    return int(amount)


def read_csv(path):
    with path.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        if not reader.fieldnames or len(reader.fieldnames) != len(set(reader.fieldnames)):
            raise ValueError("Missing or duplicate CSV headings")
        result = list(reader)
        if any(None in row or any(value is None for value in row.values()) for row in result):
            raise ValueError("Ragged CSV row")
        return result


def validate_rows(rows, csv_rows, phase):
    count = 39 if phase == "A" else 68
    identity_key = "source_sku" if phase == "A" else "candidate_id"
    prefix = "XRUO-" if phase == "A" else "SETH-CAND-"
    launch_prefix = "LIVE-EXISTING-" if phase == "A" else "LIVE-CANDIDATE-"
    if not isinstance(rows, list) or len(rows) != count or len(csv_rows) != count:
        raise ValueError(f"Phase {phase} row count mismatch")
    by_id = {}
    for row in csv_rows:
        identity = row.get(identity_key)
        if identity in by_id:
            raise ValueError(f"Phase {phase} duplicate CSV identity")
        by_id[identity] = row
    expected = {f"{prefix}{index:03}" for index in range(1, count + 1)}
    identities = [row.get(identity_key) for row in rows]
    if len(set(identities)) != count or set(identities) != expected or set(by_id) != expected:
        raise ValueError(f"Phase {phase} incomplete or duplicate source identities")
    result, exceptions = [], []
    for index, row in enumerate(rows):
        identity = row[identity_key]
        csv_row = by_id[identity]
        if row.get("launch_item_id") != launch_prefix + identity[-3:]:
            raise ValueError(f"{identity}: inconsistent launch identity")
        for key in ("product", "configuration", "launch_item_id", "target_customer_state", "current_launch_state"):
            if not isinstance(row.get(key), str) or not row[key].strip() or row[key] != csv_row.get(key):
                raise ValueError(f"{identity}: CSV/JSON disagreement in {key}")
        if row.get("auto_publish") is not False or row.get("activation_requires_exact_sha_go") is not True:
            raise ValueError(f"{identity}: source must not authorize publication")
        if row.get("price_authority") != "canonical_server_price_version_only":
            raise ValueError(f"{identity}: incorrect price authority")
        expected_state = "awaiting_current_canonical_reconciliation" if phase == "A" else "candidate_intake_pending_validation"
        if row["current_launch_state"] != expected_state:
            raise ValueError(f"{identity}: unreviewed source claims an advanced launch state")
        flags = row.get("risk_flags")
        if not isinstance(flags, list) or any(not isinstance(flag, str) for flag in flags):
            raise ValueError(f"{identity}: invalid risk flags")
        if flags != ([s for s in csv_row.get("risk_flags", "").split("|") if s]):
            raise ValueError(f"{identity}: risk flags changed")
        tiers = []
        for minimum, json_key, csv_key in TIERS:
            value = row.get(json_key)
            if value is not None and (type(value) is not int or value < 0 or value > MAX_CENTS):
                raise ValueError(f"{identity}: invalid integer-cent value")
            if dollars_to_cents(csv_row.get(csv_key)) != value:
                raise ValueError(f"{identity}: CSV/JSON price mismatch at quantity {minimum}")
            tiers.append({"minimumQuantity": minimum, "amountCents": value})
        values = [tier["amountCents"] for tier in tiers]
        issues = []
        if any(value is None or value <= 0 for value in values):
            issues.append("missing_positive_price")
        elif any(b > a for a, b in zip(values, values[1:])):
            issues.append("tier_inversion")
        if phase == "A" and issues:
            raise ValueError(f"{identity}: Phase A requires positive nonincreasing tiers")
        if issues:
            exceptions.append({"sourceId": identity, "issues": issues})
        result.append({"sourceId": identity, "launchItemId": row["launch_item_id"],
                       "sourcePointer": f"/{'phaseAExistingDirectBuy' if phase == 'A' else 'phaseBExpansionCandidates'}/{index}",
                       "sourceRowSha256": source_row_digest(row),
                       "sourceProduct": row["product"], "sourceConfiguration": row["configuration"],
                       "currency": "USD", "tiers": tiers, "riskFlags": flags,
                       "sourceIssues": issues, "canonicalProductId": None, "canonicalVariantId": None,
                       "canonicalSku": None, "unitOfSale": None, "state": "unreconciled",
                       "approved": False, "activated": False})
    return result, exceptions


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--checksums", type=Path, required=True)
    parser.add_argument("--root", type=Path, action="append", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--workbook-verification-commit")
    args = parser.parse_args()
    package = read_json(args.manifest)
    files, resolved = inventory(package, args.root)
    checksum_count = checksums_agree(package, args.checksums)
    if any(key not in resolved for key in (LAUNCH, PHASE_A, PHASE_B)):
        raise ValueError("Exact launch JSON and both CSV sources are required")
    manifest = read_json(resolved[LAUNCH])
    phase_a, errors_a = validate_rows(manifest.get("phaseAExistingDirectBuy"), read_csv(resolved[PHASE_A]), "A")
    phase_b, errors_b = validate_rows(manifest.get("phaseBExpansionCandidates"), read_csv(resolved[PHASE_B]), "B")
    workbook_evidence = (prior_workbook_verification(args.workbook_verification_commit, resolved,
                         sha256(args.manifest), sha256(args.checksums))
                         if args.workbook_verification_commit else None)
    report = {"schemaVersion": 1, "purpose": "unapproved_source_reconciliation_input",
              "packageManifestSha256": sha256(args.manifest), "checksumsSha256": sha256(args.checksums),
              "declaredChecksumCount": checksum_count, "verifiedFileCount": len(resolved),
              "sourceHashes": {key: sha256(resolved[key]) for key in (LAUNCH, PHASE_A, PHASE_B)},
              "missingFiles": [entry["path"] for entry in files if entry["status"] != "verified"],
              "workbookBytesVerified": WORKBOOK in resolved, "workbookCellsVerified": workbook_evidence is not None,
              "workbookVerificationEvidence": workbook_evidence, "sourceRowDigestMethod": ROW_DIGEST_METHOD,
              "packageArchiveSha256": workbook_evidence["packageArchiveSha256"] if workbook_evidence else None,
              "sourceApprovalVerified": False, "productionReady": False,
              "phaseACount": len(phase_a), "phaseATierCount": sum(len(row["tiers"]) for row in phase_a),
              "phaseBCount": len(phase_b), "phaseBExceptions": errors_b,
              "phaseA": phase_a, "phaseB": phase_b}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({key: value for key, value in report.items() if key not in ("phaseA", "phaseB", "missingFiles")}))


if __name__ == "__main__":
    main()
