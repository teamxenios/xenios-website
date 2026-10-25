#!/usr/bin/env python3
"""Build sanitized, fail-closed peptide Product Control candidate artifacts.

Dry-run performs no writes. Apply writes local review artifacts only; it never
connects to a database, provider, or network service and never approves prices.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
import posixpath
import re
import tempfile
import zipfile
from collections import Counter, defaultdict
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Iterable
from xml.etree import ElementTree as ET


SCHEMA_VERSION = "xenios.peptide-product-control-candidate.v1"
SOURCE_SHEET = "04 Peptides & Research"
OUTPUT_FILENAMES = (
    "peptide-reconciliation.csv",
    "peptide-reconciliation.json",
    "product-control-import-candidate.json",
    "rejected-rows.json",
    "state-counts.json",
)

EXPECTED_HEADERS = (
    "Row ID",
    "Commercial Rail / Category",
    "Subcategory / Brand",
    "Canonical Product ID",
    "Canonical Product",
    "Exact Variant ID",
    "Exact SKU",
    "Exact Strength",
    "Exact Presentation",
    "Product Class",
    "Approved Selling Price",
    "Currency",
    "Audience",
    "Supplier",
    "Supplier Product Code",
    "Wholesale Cost",
    "Wholesale Status",
    "Inventory Quantity",
    "Inventory Status",
    "Lot ID",
    "Expiration",
    "COA Status",
    "Identity Test Status",
    "Purity Test Status",
    "Sterility Status",
    "Endotoxin Status",
    "Documentation State",
    "Fulfillment Method",
    "Shipping Requirements",
    "Cold Chain",
    "Product Image Status",
    "Product Image Source / File",
    "Product Image Owner",
    "Return State",
    "Min Qty",
    "Max Qty Per Order",
    "Max Qty Per Customer",
    "Strength / Identity Dispute Status",
    "No Unresolved Dispute Confirmation",
    "Customer Offer State",
    "Website Action",
    "Public Visibility",
    "Checkout Eligible Now",
    "Supplier Fill Required",
    "Description / Commercial Basis",
    "Activation Requirement",
    "Source Notes",
    "Source Sheet",
    "Source Row",
)

PRIVATE_HEADERS = frozenset(
    {
        "Supplier",
        "Supplier Product Code",
        "Wholesale Cost",
        "Wholesale Status",
        "Product Image Source / File",
        "Product Image Owner",
        "Description / Commercial Basis",
        "Activation Requirement",
        "Source Notes",
        "Source Sheet",
        "Source Row",
    }
)
REQUIRED_TEXT_FIELDS = (
    "Commercial Rail / Category",
    "Canonical Product ID",
    "Canonical Product",
    "Exact Variant ID",
    "Exact SKU",
    "Exact Strength",
    "Exact Presentation",
    "Product Class",
    "Currency",
    "Audience",
    "Inventory Status",
    "COA Status",
    "Documentation State",
    "Product Image Status",
    "Strength / Identity Dispute Status",
    "No Unresolved Dispute Confirmation",
    "Customer Offer State",
    "Website Action",
    "Public Visibility",
    "Checkout Eligible Now",
    "Supplier Fill Required",
)

PRODUCT_ID = re.compile(r"^[A-Z0-9][A-Z0-9-]{2,31}$")
VARIANT_ID = re.compile(r"^[A-Z0-9][A-Z0-9._-]{1,127}$")
FORMULA_PREFIX = ("=", "+", "-", "@")
WEBSITE_ACTIONS = frozenset({"REQUEST_ACCESS", "HELD_PENDING_GATES", "UNAVAILABLE"})
PUBLIC_VISIBILITY = frozenset(
    {"Member/gated request access or held", "Hidden or unavailable"}
)
CUSTOMER_OFFER_STATES = frozenset(
    {
        "Approval required",
        "Care only / Research unavailable",
        "Request access",
        "Research approval or request access",
        "Research hold / Care evaluation required",
        "Unavailable",
    }
)

DISPUTE_BLOCKERS = {
    "Identity / strength documentation pending": "identity_strength_documentation_pending",
    "New presentation needs supplier confirmation": "presentation_supplier_confirmation_pending",
    "Supplier / Product Control review required": "supplier_product_control_review_pending",
    "Unresolved component order confirmation required": "component_order_confirmation_unresolved",
    "Unresolved strength confirmation required": "strength_confirmation_unresolved",
}
DOCUMENT_BLOCKERS = {
    "Pending COA, lot, identity": "documentation_coa_lot_identity_pending",
    "Pending COA, lot, identity, strength": "documentation_coa_lot_identity_strength_pending",
    "Pending identity": "identity_documentation_pending",
    "Pending supplier / Product Control documents": "supplier_product_control_documents_pending",
}
COA_BLOCKERS = {
    "Pending COA": "coa_pending",
    "Supplier to confirm COA": "coa_supplier_confirmation_pending",
}

MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"


@dataclass(frozen=True)
class ValidationIssue:
    code: str
    row_id: str | None
    field: str | None
    message: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "field": self.field,
            "message": self.message,
            "rowId": self.row_id,
        }


class SourceValidationError(Exception):
    def __init__(self, issues: Iterable[ValidationIssue]):
        self.issues = tuple(issues)
        super().__init__(f"source validation failed with {len(self.issues)} issue(s)")


@dataclass(frozen=True)
class BuildResult:
    artifacts: dict[str, bytes]
    summary: dict[str, Any]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _column_index(reference: str) -> int:
    letters = "".join(character for character in reference if character.isalpha())
    if not letters:
        raise ValueError("cell reference has no column")
    value = 0
    for character in letters.upper():
        value = value * 26 + (ord(character) - ord("A") + 1)
    return value - 1


def _xml_text(element: ET.Element) -> str:
    return "".join(node.text or "" for node in element.iter(f"{{{MAIN_NS}}}t"))


def _shared_strings(archive: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    return [_xml_text(item) for item in root.findall(f"{{{MAIN_NS}}}si")]


def _sheet_path(archive: zipfile.ZipFile, sheet_name: str) -> str:
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    targets = {
        relation.attrib["Id"]: relation.attrib["Target"]
        for relation in relationships.findall(f"{{{PKG_REL_NS}}}Relationship")
    }
    for sheet in workbook.findall(f".//{{{MAIN_NS}}}sheet"):
        if sheet.attrib.get("name") != sheet_name:
            continue
        relationship_id = sheet.attrib.get(f"{{{REL_NS}}}id")
        if relationship_id not in targets:
            break
        target = targets[relationship_id]
        path = target.lstrip("/") if target.startswith("/") else posixpath.join("xl", target)
        return posixpath.normpath(path)
    raise SourceValidationError(
        [ValidationIssue("source_sheet_missing", None, None, "Required peptide sheet is missing.")]
    )


def read_xlsx_rows(path: Path, sheet_name: str = SOURCE_SHEET) -> list[list[str]]:
    with zipfile.ZipFile(path) as archive:
        if len(archive.infolist()) > 5000 or sum(item.file_size for item in archive.infolist()) > 256 * 1024 * 1024:
            raise SourceValidationError(
                [ValidationIssue("workbook_size_limit", None, None, "Workbook exceeds safe read limits.")]
            )
        shared = _shared_strings(archive)
        root = ET.fromstring(archive.read(_sheet_path(archive, sheet_name)))
        parsed_rows: list[list[str]] = []
        formula_cells: list[str] = []
        for row in root.findall(f".//{{{MAIN_NS}}}sheetData/{{{MAIN_NS}}}row"):
            try:
                row_number = int(row.attrib.get("r", str(len(parsed_rows) + 1)))
            except ValueError:
                row_number = len(parsed_rows) + 1
            while len(parsed_rows) < row_number - 1:
                parsed_rows.append([])
            values: dict[int, str] = {}
            for cell in row.findall(f"{{{MAIN_NS}}}c"):
                reference = cell.attrib.get("r", "")
                if cell.find(f"{{{MAIN_NS}}}f") is not None:
                    formula_cells.append(reference)
                cell_type = cell.attrib.get("t")
                raw_value = cell.findtext(f"{{{MAIN_NS}}}v", default="")
                if cell_type == "s":
                    try:
                        value = shared[int(raw_value)]
                    except (ValueError, IndexError):
                        value = ""
                elif cell_type == "inlineStr":
                    inline = cell.find(f"{{{MAIN_NS}}}is")
                    value = "" if inline is None else _xml_text(inline)
                elif cell_type == "b":
                    value = "true" if raw_value == "1" else "false"
                else:
                    value = raw_value
                values[_column_index(reference)] = value
            width = max(values, default=-1) + 1
            parsed_rows.append([values.get(index, "") for index in range(width)])
        if formula_cells:
            raise SourceValidationError(
                [
                    ValidationIssue(
                        "formula_not_allowed",
                        None,
                        None,
                        "Peptide source rows must contain fixed values, not formulas.",
                    )
                ]
            )
        return parsed_rows


def _clean(value: Any) -> str:
    return "" if value is None else str(value).strip()


def _safe_public_text(value: str) -> bool:
    return (
        bool(value)
        and value == value.strip()
        and not value.startswith(FORMULA_PREFIX)
        and all(ord(character) >= 32 or character in "\t\n\r" for character in value)
    )


def _positive_integer(value: str) -> int | None:
    if not re.fullmatch(r"[1-9][0-9]*", value):
        return None
    parsed = int(value)
    return parsed if parsed <= 2_147_483_647 else None


def _price_cents(value: str) -> int | None:
    if value == "":
        return None
    try:
        cents = Decimal(value) * 100
    except InvalidOperation:
        return -1
    if cents != cents.to_integral_value() or cents <= 0 or cents > 2_147_483_647:
        return -1
    return int(cents)


def _slug(display_name: str, product_id: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", display_name.lower()).strip("-")
    return f"{base or 'product'}-{product_id.lower()}"


def _truth_state(row: dict[str, str]) -> str:
    offer = row["Customer Offer State"]
    action = row["Website Action"]
    if offer == "Care only / Research unavailable":
        return "care_only"
    if offer == "Research hold / Care evaluation required":
        return "held"
    if action == "UNAVAILABLE":
        return "unavailable"
    if offer == "Approval required":
        return "pending_documentation"
    return "request_access"


def _blockers(row: dict[str, str], planned_price_cents: int | None) -> list[str]:
    blockers = {
        "checkout_source_no",
        "supplier_fill_required",
        "inventory_unconfirmed",
        "unresolved_dispute_confirmation",
        "exact_product_image_pending",
    }
    blockers.add(DISPUTE_BLOCKERS[row["Strength / Identity Dispute Status"]])
    blockers.add(DOCUMENT_BLOCKERS[row["Documentation State"]])
    blockers.add(COA_BLOCKERS[row["COA Status"]])
    if not row["Lot ID"]:
        blockers.add("lot_missing")
    if not row["Expiration"]:
        blockers.add("expiration_unconfirmed")
    for field, code in (
        ("Identity Test Status", "identity_test_unverified"),
        ("Purity Test Status", "purity_test_unverified"),
        ("Sterility Status", "sterility_status_unverified"),
        ("Endotoxin Status", "endotoxin_status_unverified"),
    ):
        if row[field].lower() not in {"verified", "approved", "n/a", "not applicable"}:
            blockers.add(code)
    if "pending" in row["Fulfillment Method"].lower() or "supplier/direct" in row["Fulfillment Method"].lower():
        blockers.add("fulfillment_unconfirmed")
    if "pending" in row["Shipping Requirements"].lower():
        blockers.add("shipping_requirements_pending")
    if "pending" in row["Cold Chain"].lower() or "confirm" in row["Cold Chain"].lower():
        blockers.add("cold_chain_review_pending")
    blockers.add("planned_price_missing" if planned_price_cents is None else "price_approval_pending")
    if row["Website Action"] == "UNAVAILABLE":
        blockers.add("research_offer_unavailable")
    if _truth_state(row) == "care_only":
        blockers.add("care_pathway_only")
    return sorted(blockers)


def _metadata(source_sha256: str, row_count: int, dataset_digest: str) -> dict[str, Any]:
    return {
        "datasetSha256": dataset_digest,
        "rowCount": row_count,
        "schemaVersion": SCHEMA_VERSION,
        "sourceSheet": SOURCE_SHEET,
        "sourceWorkbookSha256": source_sha256,
    }


def _json_bytes(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode("utf-8")


def _csv_bytes(rows: list[dict[str, Any]]) -> bytes:
    fields = (
        "source_row_id",
        "canonical_product_id",
        "canonical_product",
        "exact_variant_id",
        "exact_sku",
        "exact_strength",
        "exact_presentation",
        "planned_price_cents",
        "currency",
        "truth_state",
        "website_action",
        "public_visibility",
        "checkout_eligible",
        "candidate_disposition",
        "blocker_codes",
    )
    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=fields, lineterminator="\n")
    writer.writeheader()
    for row in rows:
        writer.writerow(
            {
                "source_row_id": row["sourceRowId"],
                "canonical_product_id": row["canonicalProductId"],
                "canonical_product": row["canonicalProduct"],
                "exact_variant_id": row["exactVariantId"],
                "exact_sku": row["exactSku"],
                "exact_strength": row["exactStrength"],
                "exact_presentation": row["exactPresentation"],
                "planned_price_cents": "" if row["plannedPriceCents"] is None else row["plannedPriceCents"],
                "currency": row["currency"],
                "truth_state": row["truthState"],
                "website_action": row["websiteAction"],
                "public_visibility": row["publicVisibility"],
                "checkout_eligible": "false",
                "candidate_disposition": row["candidateDisposition"],
                "blocker_codes": "|".join(row["blockerCodes"]),
            }
        )
    return output.getvalue().encode("utf-8")


def _records_from_rows(rows: list[list[str]]) -> tuple[list[dict[str, str]], list[ValidationIssue]]:
    issues: list[ValidationIssue] = []
    if len(rows) < 4:
        return [], [ValidationIssue("sheet_too_short", None, None, "Peptide sheet has no header row.")]
    header = tuple(_clean(value) for value in rows[3])
    if header != EXPECTED_HEADERS:
        return [], [ValidationIssue("header_schema_mismatch", None, None, "Peptide sheet headers do not match the bound schema.")]
    records: list[dict[str, str]] = []
    for raw in rows[4:]:
        padded = list(raw) + [""] * (len(EXPECTED_HEADERS) - len(raw))
        row = {header: _clean(padded[index]) for index, header in enumerate(EXPECTED_HEADERS)}
        if not any(row.values()):
            continue
        row_id = row["Row ID"] or None
        if _positive_integer(row["Row ID"]) is None:
            issues.append(ValidationIssue("invalid_row_id", row_id, "Row ID", "Row ID must be a positive integer."))
        for field in REQUIRED_TEXT_FIELDS:
            if not _safe_public_text(row[field]):
                issues.append(ValidationIssue("blank_or_unsafe_value", row_id, field, "Required value is blank or unsafe."))
        if row["Commercial Rail / Category"] != "Peptides & Research":
            issues.append(ValidationIssue("wrong_commercial_rail", row_id, "Commercial Rail / Category", "Row is outside the peptide/research rail."))
        if not PRODUCT_ID.fullmatch(row["Canonical Product ID"]):
            issues.append(ValidationIssue("invalid_product_id", row_id, "Canonical Product ID", "Canonical product ID format is invalid."))
        for field in ("Exact Variant ID", "Exact SKU"):
            if not VARIANT_ID.fullmatch(row[field]):
                issues.append(ValidationIssue("invalid_variant_identifier", row_id, field, "Variant identifier format is invalid."))
        if row["Currency"] != "USD":
            issues.append(ValidationIssue("non_usd_currency", row_id, "Currency", "Only USD candidates are supported."))
        if row["Audience"] != "approved_research_member":
            issues.append(ValidationIssue("unknown_audience", row_id, "Audience", "Workbook audience cannot be mapped safely."))
        if row["Website Action"] not in WEBSITE_ACTIONS:
            issues.append(ValidationIssue("unknown_website_action", row_id, "Website Action", "Website action is not recognized."))
        if row["Public Visibility"] not in PUBLIC_VISIBILITY:
            issues.append(ValidationIssue("unknown_public_visibility", row_id, "Public Visibility", "Public visibility is not recognized."))
        if row["Customer Offer State"] not in CUSTOMER_OFFER_STATES:
            issues.append(ValidationIssue("unknown_offer_state", row_id, "Customer Offer State", "Customer offer state is not recognized."))
        if row["Checkout Eligible Now"] != "NO":
            issues.append(ValidationIssue("checkout_activation_not_authorized", row_id, "Checkout Eligible Now", "This pipeline accepts fail-closed NO rows only."))
        if row["Supplier Fill Required"] != "Yes":
            issues.append(ValidationIssue("supplier_fill_state_conflict", row_id, "Supplier Fill Required", "Supplier fill state must remain Yes for this source."))
        if row["Strength / Identity Dispute Status"] not in DISPUTE_BLOCKERS:
            issues.append(ValidationIssue("unknown_dispute_state", row_id, "Strength / Identity Dispute Status", "Dispute state is not recognized."))
        if not row["No Unresolved Dispute Confirmation"].startswith("NO - "):
            issues.append(ValidationIssue("dispute_confirmation_conflict", row_id, "No Unresolved Dispute Confirmation", "Unresolved dispute confirmation must remain NO."))
        if row["Documentation State"] not in DOCUMENT_BLOCKERS:
            issues.append(ValidationIssue("unknown_documentation_state", row_id, "Documentation State", "Documentation state is not recognized."))
        if row["COA Status"] not in COA_BLOCKERS:
            issues.append(ValidationIssue("unknown_coa_state", row_id, "COA Status", "COA state is not recognized."))
        price = _price_cents(row["Approved Selling Price"])
        if price == -1:
            issues.append(ValidationIssue("invalid_planned_price", row_id, "Approved Selling Price", "Planned price must be positive with no more than two decimals."))
        for field in ("Min Qty", "Max Qty Per Order", "Max Qty Per Customer"):
            if _positive_integer(row[field]) is None:
                issues.append(ValidationIssue("invalid_quantity_limit", row_id, field, "Quantity limit must be a positive integer."))
        minimum = _positive_integer(row["Min Qty"])
        per_order = _positive_integer(row["Max Qty Per Order"])
        per_customer = _positive_integer(row["Max Qty Per Customer"])
        if minimum and per_order and per_customer and not (minimum <= per_order <= per_customer):
            issues.append(ValidationIssue("quantity_limit_conflict", row_id, None, "Quantity limits are not monotonic."))
        if row["Website Action"] == "UNAVAILABLE" and row["Public Visibility"] != "Hidden or unavailable":
            issues.append(ValidationIssue("visibility_action_conflict", row_id, "Public Visibility", "Unavailable rows must remain hidden or unavailable."))
        if row["Website Action"] != "UNAVAILABLE" and row["Public Visibility"] != "Member/gated request access or held":
            issues.append(ValidationIssue("visibility_action_conflict", row_id, "Public Visibility", "Request/held rows must remain member-gated."))
        records.append(row)

    for field, code in (
        ("Row ID", "duplicate_row_id"),
        ("Exact SKU", "duplicate_sku"),
        ("Exact Variant ID", "duplicate_variant_id"),
    ):
        grouped: dict[str, list[str]] = defaultdict(list)
        for row in records:
            grouped[row[field]].append(row["Row ID"])
        for value, row_ids in grouped.items():
            if value and len(row_ids) > 1:
                for row_id in row_ids:
                    issues.append(ValidationIssue(code, row_id, field, f"{field} must be unique."))

    products: dict[str, set[tuple[str, str]]] = defaultdict(set)
    for row in records:
        products[row["Canonical Product ID"]].add((row["Canonical Product"], row["Product Class"]))
    for product_id, mappings in products.items():
        if product_id and len(mappings) > 1:
            for row in records:
                if row["Canonical Product ID"] == product_id:
                    issues.append(ValidationIssue("canonical_product_conflict", row["Row ID"], "Canonical Product ID", "Canonical product ID maps to conflicting names or classes."))
    return records, issues


def build_from_workbook(path: Path, expected_sha256: str) -> BuildResult:
    actual_sha256 = sha256_file(path)
    if not re.fullmatch(r"[0-9a-fA-F]{64}", expected_sha256) or actual_sha256 != expected_sha256.lower():
        raise SourceValidationError(
            [ValidationIssue("source_hash_mismatch", None, None, "Workbook SHA-256 does not match the required source binding.")]
        )
    records, issues = _records_from_rows(read_xlsx_rows(path))
    if issues:
        raise SourceValidationError(issues)

    reconciled: list[dict[str, Any]] = []
    for row in sorted(records, key=lambda item: int(item["Row ID"])):
        price_cents = _price_cents(row["Approved Selling Price"])
        assert price_cents != -1
        truth_state = _truth_state(row)
        reconciled.append(
            {
                "blockerCodes": _blockers(row, price_cents),
                "candidateDisposition": "hidden_draft_review_only",
                "canonicalProduct": row["Canonical Product"],
                "canonicalProductId": row["Canonical Product ID"],
                "checkoutEligible": False,
                "currency": row["Currency"],
                "exactPresentation": row["Exact Presentation"],
                "exactSku": row["Exact SKU"],
                "exactStrength": row["Exact Strength"],
                "exactVariantId": row["Exact Variant ID"],
                "plannedPriceCents": price_cents,
                "publicVisibility": row["Public Visibility"],
                "sourceRowId": int(row["Row ID"]),
                "truthState": truth_state,
                "websiteAction": row["Website Action"],
            }
        )

    dataset_digest = hashlib.sha256(
        json.dumps(reconciled, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    metadata = _metadata(actual_sha256, len(reconciled), dataset_digest)

    product_rows: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in reconciled:
        product_rows[row["canonicalProductId"]].append(row)
    products = []
    for product_id in sorted(product_rows):
        variants = product_rows[product_id]
        display_name = variants[0]["canonicalProduct"]
        states = sorted({variant["truthState"] for variant in variants})
        products.append(
            {
                "active": False,
                "adminStatus": "draft",
                "aliases": [],
                "blockerCodes": sorted({code for variant in variants for code in variant["blockerCodes"]}),
                "canonicalName": display_name,
                "category": "peptides-and-research",
                "classification": "future_clinical" if set(states) <= {"care_only", "unavailable"} else "research_material",
                "displayName": display_name,
                "lane": "future_clinical" if set(states) <= {"care_only", "unavailable"} else "research_material",
                "productCode": product_id,
                "slug": _slug(display_name, product_id),
                "sourceProductId": product_id,
                "targetTruthStates": states,
                "visibility": "hidden",
            }
        )
    variants = [
        {
            "active": False,
            "blockerCodes": row["blockerCodes"],
            "checkoutEligible": False,
            "label": f"{row['exactStrength']} · {row['exactPresentation']}",
            "memberEligible": False,
            "presentation": row["exactPresentation"],
            "sku": row["exactSku"],
            "sourceProductId": row["canonicalProductId"],
            "sourceVariantId": row["exactVariantId"],
            "status": "draft",
            "strength": row["exactStrength"],
            "truthState": row["truthState"],
        }
        for row in reconciled
    ]
    price_drafts = [
        {
            "amountCents": row["plannedPriceCents"],
            "approvalRequired": True,
            "audience": "member",
            "currency": "USD",
            "effectiveAt": None,
            "sourceProductId": row["canonicalProductId"],
            "sourceVariantId": row["exactVariantId"],
            "status": "draft",
        }
        for row in reconciled
        if row["plannedPriceCents"] is not None
    ]
    candidate = {
        "importPolicy": {
            "databaseApplySupported": False,
            "mode": "candidate_only",
            "priceApprovalGranted": False,
            "productionMutationAllowed": False,
            "requiresProtectedSeamLease": True,
        },
        "metadata": metadata,
        "plannedPriceDrafts": price_drafts,
        "products": products,
        "variants": variants,
    }
    blocker_counts = Counter(code for row in reconciled for code in row["blockerCodes"])
    state_counts = {
        "blockerCounts": dict(sorted(blocker_counts.items())),
        "checkoutEligibleRows": 0,
        "metadata": metadata,
        "plannedPriceRows": len(price_drafts),
        "priceMissingRows": len(reconciled) - len(price_drafts),
        "productCount": len(products),
        "rejectedRowCount": 0,
        "truthStateCounts": dict(sorted(Counter(row["truthState"] for row in reconciled).items())),
        "variantCount": len(reconciled),
        "websiteActionCounts": dict(sorted(Counter(row["websiteAction"] for row in reconciled).items())),
    }
    reconciliation_json = {"metadata": metadata, "rows": reconciled}
    rejected = {"metadata": metadata, "rejectedRowCount": 0, "rows": []}
    artifacts = {
        "peptide-reconciliation.csv": _csv_bytes(reconciled),
        "peptide-reconciliation.json": _json_bytes(reconciliation_json),
        "product-control-import-candidate.json": _json_bytes(candidate),
        "rejected-rows.json": _json_bytes(rejected),
        "state-counts.json": _json_bytes(state_counts),
    }
    summary = {
        "checkoutEligibleRows": 0,
        "datasetSha256": dataset_digest,
        "plannedPriceRows": len(price_drafts),
        "priceMissingRows": len(reconciled) - len(price_drafts),
        "productCount": len(products),
        "rejectedRowCount": 0,
        "sourceWorkbookSha256": actual_sha256,
        "truthStateCounts": state_counts["truthStateCounts"],
        "variantCount": len(reconciled),
        "websiteActionCounts": state_counts["websiteActionCounts"],
    }
    return BuildResult(artifacts=artifacts, summary=summary)


def apply_artifacts(result: BuildResult, output_dir: Path) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    changed: list[str] = []
    unchanged: list[str] = []
    for filename in OUTPUT_FILENAMES:
        content = result.artifacts[filename]
        destination = output_dir / filename
        if destination.exists() and destination.read_bytes() == content:
            unchanged.append(filename)
            continue
        descriptor, temporary_name = tempfile.mkstemp(prefix=f".{filename}.", suffix=".tmp", dir=output_dir)
        try:
            with os.fdopen(descriptor, "wb") as handle:
                handle.write(content)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary_name, destination)
        finally:
            if os.path.exists(temporary_name):
                os.unlink(temporary_name)
        changed.append(filename)
    return {"changed": changed, "unchanged": unchanged}


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workbook", required=True, type=Path)
    parser.add_argument("--expected-sha256", required=True)
    parser.add_argument("--mode", choices=("dry-run", "apply"), default="dry-run")
    parser.add_argument("--output-dir", type=Path)
    return parser


def main(argv: list[str] | None = None) -> int:
    arguments = _parser().parse_args(argv)
    if arguments.mode == "apply" and arguments.output_dir is None:
        raise SystemExit("--output-dir is required in apply mode")
    try:
        result = build_from_workbook(arguments.workbook, arguments.expected_sha256.lower())
    except (OSError, zipfile.BadZipFile, ET.ParseError, SourceValidationError) as error:
        issues = error.issues if isinstance(error, SourceValidationError) else (
            ValidationIssue("workbook_read_failed", None, None, "Workbook could not be read safely."),
        )
        print(json.dumps({"ok": False, "issues": [issue.as_dict() for issue in issues]}, indent=2, sort_keys=True))
        return 2
    output: dict[str, Any] = {"mode": arguments.mode, "ok": True, "summary": result.summary}
    if arguments.mode == "apply":
        output["apply"] = apply_artifacts(result, arguments.output_dir)
    else:
        output["writesPerformed"] = 0
    print(json.dumps(output, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
