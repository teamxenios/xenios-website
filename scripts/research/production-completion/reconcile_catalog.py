#!/usr/bin/env python3
"""Deterministic, evidence-bounded catalog reconciliation.

This command is deliberately a DRY-RUN report generator. It reads four supplied
workbooks plus the checked-in member-safe catalog and Product Control bindings,
then writes only sanitized reports under docs/production-completion/catalog.
It has no database client, network client, production mutation flag, or apply
mode. Supplier identity, wholesale values, raw notes, and demand counts never
leave process memory.
"""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from decimal import Decimal, InvalidOperation
import hashlib
import json
from pathlib import Path, PurePosixPath
import posixpath
import re
import unicodedata
import zipfile
from xml.etree import ElementTree as ET


MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
NS = {"x": MAIN_NS, "r": REL_NS, "pr": PKG_REL_NS}
REPO_ROOT = Path(__file__).resolve().parents[3]
POLICY_PATH = REPO_ROOT / "config/research/production-completion/catalog-reconciliation-policy.json"
DEFAULT_OUTPUT = REPO_ROOT / "docs/production-completion/catalog"


class ReconciliationRefused(ValueError):
    """Raised when source identity or an invariant is not exact."""


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_json(path: Path) -> dict:
    value = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(value, dict):
        raise ReconciliationRefused(f"{path} is not a JSON object")
    return value


def column_number(reference: str) -> int:
    letters = "".join(character for character in reference if character.isalpha())
    result = 0
    for character in letters.upper():
        result = result * 26 + ord(character) - ord("A") + 1
    return result


def shared_strings(archive: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    return ["".join(node.text or "" for node in item.findall(".//x:t", NS)) for item in root.findall("x:si", NS)]


def worksheet_paths(archive: zipfile.ZipFile) -> dict[str, str]:
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    targets = {
        relation.attrib["Id"]: relation.attrib["Target"]
        for relation in relationships.findall("pr:Relationship", NS)
    }
    result: dict[str, str] = {}
    for sheet in workbook.findall("x:sheets/x:sheet", NS):
        relation_id = sheet.attrib[f"{{{REL_NS}}}id"]
        target = targets[relation_id].replace("\\", "/")
        if target.startswith("/"):
            archive_path = target.lstrip("/")
        elif target.startswith("xl/"):
            archive_path = target
        else:
            archive_path = posixpath.normpath(posixpath.join("xl", target))
        safe = PurePosixPath(archive_path)
        if safe.is_absolute() or ".." in safe.parts:
            raise ReconciliationRefused("unsafe worksheet relationship")
        result[sheet.attrib["name"]] = str(safe)
    return result


def numeric_value(text: str) -> Decimal:
    try:
        return Decimal(text)
    except InvalidOperation as cause:
        raise ReconciliationRefused(f"invalid numeric cell {text!r}") from cause


def cell_value(cell: ET.Element, strings: list[str]):
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        return "".join(node.text or "" for node in cell.findall(".//x:t", NS))
    value_node = cell.find("x:v", NS)
    if value_node is None or value_node.text is None:
        return None
    text = value_node.text
    if cell_type == "s":
        index = int(text)
        if index < 0 or index >= len(strings):
            raise ReconciliationRefused("shared-string index is out of range")
        return strings[index]
    if cell_type in {"str", "e"}:
        return text
    if cell_type == "b":
        return text == "1"
    return numeric_value(text)


def sheet_rows(path: Path, sheet_name: str) -> list[tuple[int, list]]:
    with zipfile.ZipFile(path) as archive:
        strings = shared_strings(archive)
        paths = worksheet_paths(archive)
        if sheet_name not in paths:
            raise ReconciliationRefused(f"{path.name} has no sheet {sheet_name!r}")
        root = ET.fromstring(archive.read(paths[sheet_name]))
        result = []
        for row in root.findall("x:sheetData/x:row", NS):
            row_number = int(row.attrib["r"])
            cells: dict[int, object] = {}
            for cell in row.findall("x:c", NS):
                cells[column_number(cell.attrib["r"])] = cell_value(cell, strings)
            width = max(cells, default=0)
            result.append((row_number, [cells.get(index) for index in range(1, width + 1)]))
        return result


def clean_header(value) -> str:
    return "" if value is None else str(value).strip()


def table_records(path: Path, sheet_name: str, header_row: int) -> list[dict]:
    rows = dict(sheet_rows(path, sheet_name))
    if header_row not in rows:
        raise ReconciliationRefused(f"{path.name}:{sheet_name} missing header row {header_row}")
    headers = [clean_header(value) for value in rows[header_row]]
    if not headers or any(not header for header in headers):
        raise ReconciliationRefused(f"{path.name}:{sheet_name} contains a blank header")
    if len(headers) != len(set(headers)):
        raise ReconciliationRefused(f"{path.name}:{sheet_name} contains duplicate headers")
    records = []
    for row_number in sorted(number for number in rows if number > header_row):
        values = rows[row_number] + [None] * max(0, len(headers) - len(rows[row_number]))
        values = values[: len(headers)]
        if not any(value not in (None, "") for value in values):
            continue
        records.append({**dict(zip(headers, values)), "_row": row_number})
    return records


def normalize_key(value) -> str:
    text = unicodedata.normalize("NFKD", str(value or "")).lower().replace("&", " and ")
    return re.sub(r"[^a-z0-9]+", "", text)


def as_decimal(value) -> Decimal | None:
    if value is None or value == "":
        return None
    if isinstance(value, Decimal):
        return value
    if isinstance(value, str) and value.strip().lower() in {
        "??",
        "n/a",
        "na",
        "tbd",
        "quote required",
        "vendor quote required",
        "price on request",
    }:
        return None
    try:
        return Decimal(str(value))
    except InvalidOperation as cause:
        raise ReconciliationRefused(f"expected a number, found {value!r}") from cause


def is_positive(value) -> bool:
    number = as_decimal(value)
    return number is not None and number > 0


def cents(value) -> int | None:
    number = as_decimal(value)
    if number is None or number <= 0:
        return None
    scaled = number * 100
    if scaled != scaled.to_integral_value():
        return None
    return int(scaled)


def decimal_text(value) -> str | None:
    number = as_decimal(value)
    if number is None or number <= 0:
        return None
    text = format(number, "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text


def margin_on_wholesale_proxy(retail, wholesale_proxy) -> Decimal | None:
    retail_value = as_decimal(retail)
    wholesale_value = as_decimal(wholesale_proxy)
    if retail_value is None or wholesale_value is None or retail_value <= 0:
        return None
    return (retail_value - wholesale_value) / retail_value


def source_pointer(filename: str, sheet: str, row: int) -> str:
    return f"{filename}::{sheet}!{row}"


def exact_catalog_match(candidate: dict, label_index: dict[str, list[dict]]) -> list[dict]:
    keys = {
        normalize_key(candidate["Strength / Configuration"]),
        normalize_key(f"{candidate['Product / Blend']} {candidate['Strength / Configuration']}"),
    }
    matches = {
        (entry["offeringId"], entry["variantId"]): entry
        for key in keys
        for entry in label_index.get(key, [])
        if normalize_key(candidate["Product / Blend"]) == normalize_key(entry["productName"])
    }
    if len(matches) > 1:
        form = normalize_key(candidate["Form"])
        matches = {
            key: entry
            for key, entry in matches.items()
            if form and form == normalize_key(entry["subcategory"])
        }
    return sorted(matches.values(), key=lambda entry: (entry["offeringId"], entry["variantId"]))


def select_retail_price(
    *,
    seth_recommended=None,
    seth_current=None,
    current_master=None,
    verified_wholesale=None,
    wholesale_supported: bool = False,
    wholesale_multiple: Decimal = Decimal("2.5"),
) -> tuple[object, str]:
    """Apply the full approved precedence without inferring source support."""
    if is_positive(seth_recommended):
        return seth_recommended, "seth_recommended_retail"
    if is_positive(seth_current):
        return seth_current, "seth_current_retail"
    if is_positive(current_master):
        return current_master, "current_master_retail"
    if wholesale_supported and is_positive(verified_wholesale):
        return as_decimal(verified_wholesale) * wholesale_multiple, "provisional_2_5x_verified_wholesale"
    return None, "retail_pending"


def price_from_seth_review(row: dict) -> tuple[object, str]:
    return select_retail_price(
        seth_recommended=row.get("Seth Recommended Retail"),
        current_master=row.get("Current Retail"),
    )


def price_from_seth_missing(row: dict) -> tuple[object, str]:
    return select_retail_price(
        seth_recommended=row.get("Recommended Xenios Retail"),
        seth_current=row.get("What Seth Sells It For"),
    )


def classify_unit(unit: dict, margin_floor: Decimal) -> str:
    """Classify one union unit without ever returning direct_buy."""
    if unit["canonicalFamily"] == "clinical_formulations_503a":
        return "care_required"
    if unit["candidate"] is None:
        return "unavailable"
    evidence = unit["evidence"]
    if (
        evidence["canonicalIdentityVerified"]
        and evidence["productControlBindingPresent"]
        and evidence["researchLaneExplicit"]
        and unit["canonicalDisplayState"] == "request_access"
    ):
        return "assisted_order"
    return "unavailable"


def sanitized_row(unit: dict) -> dict:
    candidate = unit["candidate"]
    evidence = unit["evidence"]
    action = unit["action"]
    reasons: list[str] = []
    if action == "care_required":
        reasons = ["explicit_503a_clinical_family", "direct_purchase_prohibited"]
    elif action == "assisted_order":
        reasons = [
            "exact_canonical_identity",
            "product_control_binding_present",
            "explicit_ruo_research_lane",
            "operator_review_required_before_order",
        ]
        if evidence["candidateRetailPresent"]:
            reasons.append("candidate_retail_pending_approval")
        else:
            reasons.append("price_on_request")
        if evidence["wholesaleCostProxyPresent"]:
            reasons.append("wholesale_cost_proxy_present_not_landed_cost")
        else:
            reasons.append("wholesale_cost_proxy_review_required")
        proxy_margin = evidence["marginOnWholesaleProxy"]
        if proxy_margin is None:
            reasons.append("wholesale_proxy_margin_not_computable")
        elif proxy_margin < 0:
            reasons.append("negative_margin_on_wholesale_proxy_requires_review")
        elif proxy_margin < unit["marginFloor"]:
            reasons.append("wholesale_proxy_margin_below_floor_requires_review")
        else:
            reasons.append("wholesale_proxy_margin_at_or_above_floor")
    else:
        if candidate is None:
            reasons.append("not_present_in_current_september_intake")
        if not evidence["canonicalIdentityVerified"]:
            reasons.append("canonical_identity_missing")
        if evidence["canonicalIdentityVerified"] and not evidence["productControlBindingPresent"]:
            reasons.append("product_control_binding_missing")
        if candidate is not None and not evidence["researchLaneExplicit"]:
            reasons.append("research_lane_requires_verification")
        if candidate is not None and not evidence["candidateRetailPresent"]:
            reasons.append("candidate_retail_missing")
        if candidate is not None and not evidence["wholesaleCostProxyPresent"]:
            reasons.append("wholesale_cost_proxy_missing")
        if evidence["marginOnWholesaleProxy"] is not None and evidence["marginOnWholesaleProxy"] < unit["marginFloor"]:
            reasons.append("wholesale_proxy_margin_below_floor_requires_review")
        if unit["canonicalDisplayState"] == "approval_required":
            reasons.append("canonical_approval_required")
        if unit["canonicalFamily"] == "shipping_and_fulfillment":
            reasons.append("not_a_standalone_commercial_product")
    return {
        "unitId": unit["unitId"],
        "action": action,
        "candidateSku": candidate.get("SKU") if candidate else None,
        "productName": candidate.get("Product / Blend") if candidate else unit["productName"],
        "configuration": candidate.get("Strength / Configuration") if candidate else unit["configuration"],
        "canonicalOfferingId": unit["offeringId"],
        "canonicalVariantId": unit["variantId"],
        "productControlSku": unit["productControlSku"],
        "candidateRetailAmount": decimal_text(candidate.get("_selectedRetail")) if candidate else None,
        "candidateRetailCents": cents(candidate.get("_selectedRetail")) if candidate else None,
        "candidateRetailAuthority": candidate.get("_priceAuthority") if candidate else None,
        "candidateRetailStatus": "pending_approval" if candidate and is_positive(candidate.get("_selectedRetail")) else None,
        "sourcePointer": candidate.get("_pointer") if candidate else None,
        "evidence": {
            "canonicalIdentityVerified": evidence["canonicalIdentityVerified"],
            "productControlBindingPresent": evidence["productControlBindingPresent"],
            "researchLaneExplicit": evidence["researchLaneExplicit"],
            "carePathwayExplicit": unit["canonicalFamily"] == "clinical_formulations_503a",
            "wholesaleCostProxyPresent": evidence["wholesaleCostProxyPresent"],
            "landedCostVerified": False,
            "candidateRetailPresent": evidence["candidateRetailPresent"],
            "approvedActiveRetailVerified": False,
            "marginOnWholesaleProxyAtOrAboveFloor": evidence["marginOnWholesaleProxy"] is not None and evidence["marginOnWholesaleProxy"] >= unit["marginFloor"],
            "supplierFulfillmentEntityVerified": False,
            "inventoryOrCapacityVerified": False,
            "qualityLotCoaDocumentationVerified": False,
            "storageShippingClassVerified": False,
            "geographyVerified": False,
            "returnReplacementRecallPolicyVerified": False,
            "supportedPaymentVerified": False,
            "downstreamOrderFlowVerified": False,
        },
        "reasonCodes": sorted(set(reasons)),
        "directBuyEligible": False,
    }


def conflict(code: str, unit: dict, severity: str, remediation: str) -> dict:
    candidate = unit["candidate"]
    return {
        "code": code,
        "severity": severity,
        "unitId": unit["unitId"],
        "candidateSku": candidate.get("SKU") if candidate else None,
        "sourcePointer": candidate.get("_pointer") if candidate else None,
        "remediation": remediation,
    }


def conflicts_for(unit: dict, margin_floor: Decimal) -> list[dict]:
    candidate = unit["candidate"]
    evidence = unit["evidence"]
    result = []
    if candidate is None and unit["canonicalFamily"] != "clinical_formulations_503a":
        result.append(conflict("not_in_current_september_intake", unit, "blocking", "Confirm current commercial source and exact identity; absence is not treated as retirement."))
    if candidate is not None:
        if not evidence["canonicalIdentityVerified"]:
            result.append(conflict("canonical_identity_missing", unit, "blocking", "Create or approve an exact canonical Product Control identity; do not fuzzy-match."))
        if evidence["canonicalIdentityVerified"] and not evidence["productControlBindingPresent"]:
            result.append(conflict("product_control_binding_missing", unit, "blocking", "Create a reviewed Product Control binding in a separately authorized production change."))
        if not evidence["researchLaneExplicit"]:
            result.append(conflict("lane_requires_verification", unit, "blocking", "Confirm the lawful RUO or licensed clinical pathway."))
        if not evidence["candidateRetailPresent"]:
            result.append(conflict("retail_price_missing", unit, "blocking", "Keep Price on request; obtain and approve a supported retail price."))
        elif cents(candidate.get("_selectedRetail")) is None:
            result.append(conflict("retail_amount_not_cent_exact", unit, "review_required", "Approve an exact currency rounding decision; the source amount is preserved without silently rounding."))
        if not evidence["wholesaleCostProxyPresent"]:
            result.append(conflict("wholesale_quote_required", unit, "blocking", "Obtain a supported wholesale cost or quote proxy. Verify actual landed cost separately; do not invent either value."))
        margin = evidence["marginOnWholesaleProxy"]
        if margin is not None and margin < 0:
            result.append(conflict("negative_margin_on_wholesale_proxy", unit, "review_required", "Review the wholesale-cost proxy and candidate retail. Actual landed cost remains unverified; do not silently activate the recommendation."))
        elif margin is not None and margin < margin_floor:
            result.append(conflict("below_launch_margin_floor_on_wholesale_proxy", unit, "review_required", "Obtain explicit commercial approval or revise supported wholesale-cost proxy or retail evidence. Actual landed cost remains unverified."))
        verification_text = " ".join(str(candidate.get(key) or "") for key in ("Strength / Configuration", "Form", "Channel"))
        if re.search(r"\b(assumed|pending|verify)\b", verification_text, flags=re.IGNORECASE):
            result.append(conflict("identity_or_lane_verification_required", unit, "blocking", "Confirm exact formulation, unit of sale, and lane."))
        if unit["canonicalDisplayState"] == "approval_required":
            result.append(conflict("canonical_approval_required", unit, "blocking", "Resolve the existing canonical approval gate before activation."))
    if unit["canonicalFamily"] == "shipping_and_fulfillment":
        result.append(conflict("non_product_service_row", unit, "blocking", "Model as an order service or included supply, not a standalone sellable product."))
    return result


def verify_source(path: Path, expected: dict, label: str) -> None:
    if not path.is_file():
        raise ReconciliationRefused(f"{label} does not exist: {path}")
    if path.name != expected["filename"]:
        raise ReconciliationRefused(f"{label} filename differs from the reviewed source")
    actual = sha256(path)
    if actual != expected["sha256"]:
        raise ReconciliationRefused(f"{label} SHA-256 mismatch: {actual}")


def build_report(paths: dict[str, Path], policy: dict) -> tuple[dict, list[dict]]:
    expected_precedence = [
        "seth_recommended_retail",
        "seth_current_retail",
        "current_master_retail",
        "provisional_2_5x_verified_wholesale",
        "retail_pending",
    ]
    if policy.get("retailPricePrecedence") != expected_precedence:
        raise ReconciliationRefused("retail price precedence policy drifted")
    wholesale_policy = policy.get("wholesaleEvidence", {})
    if (
        wholesale_policy.get("sourceField") != "Current Wholesale / Unit"
        or wholesale_policy.get("semantics") != "wholesale_cost_proxy_not_landed_cost"
        or wholesale_policy.get("actualLandedCostVerifiedBySourceSet") is not False
    ):
        raise ReconciliationRefused("wholesale-cost proxy policy drifted")
    for key, path in paths.items():
        verify_source(path, policy["sourceFiles"][key], key)
    catalog_path = REPO_ROOT / policy["canonicalArtifacts"]["catalog"]["path"]
    bindings_path = REPO_ROOT / policy["canonicalArtifacts"]["bindings"]["path"]
    for key, path in (("catalog", catalog_path), ("bindings", bindings_path)):
        expected = policy["canonicalArtifacts"][key]["sha256"]
        actual = sha256(path)
        if actual != expected:
            raise ReconciliationRefused(f"canonical {key} SHA-256 mismatch: {actual}")

    master = table_records(paths["septemberCatalog"], "Master Peptide Catalog", 3)
    margin_evidence = policy["launchMarginFloorEvidence"]
    executive_rows = dict(sheet_rows(paths["septemberCatalog"], margin_evidence["sheet"]))
    evidence_row = executive_rows.get(int(margin_evidence["row"]), [])
    if (
        len(evidence_row) < 3
        or evidence_row[0] != margin_evidence["metric"]
        or evidence_row[2] != margin_evidence["meaning"]
    ):
        raise ReconciliationRefused("launch margin floor evidence drifted")
    seth_review = table_records(paths["sethPricing"], "PRICING REVIEW", 4)
    seth_missing_all = table_records(paths["sethPricing"], "MISSING PRODUCTS", 4)
    seth_missing = [row for row in seth_missing_all if row.get("Strength / Configuration") not in (None, "")]
    financial_products = table_records(paths["financialModel"], "Product Catalog", 3)
    financial_gates = table_records(paths["financialModel"], "Launch Gates", 3)
    rfq = table_records(paths["vendorRfq"], "Peptide Sourcing RFQ", 3)

    expected_counts = {"master": 176, "seth_review": 39, "seth_missing": 68, "financial_products": 35, "rfq": 101}
    actual_counts = {"master": len(master), "seth_review": len(seth_review), "seth_missing": len(seth_missing), "financial_products": len(financial_products), "rfq": len(rfq)}
    if actual_counts != expected_counts:
        raise ReconciliationRefused(f"source row counts drifted: {actual_counts}")

    skus = [str(row.get("SKU") or "") for row in master]
    if any(not sku for sku in skus) or len(skus) != len(set(skus)):
        raise ReconciliationRefused("September catalog SKUs are missing or duplicated")
    prefix_counts = Counter(sku.split("-", 1)[0] for sku in skus)
    if prefix_counts != Counter({"MASTER": 69, "EXP": 68, "XRUO": 39}):
        raise ReconciliationRefused(f"September SKU partition drifted: {dict(prefix_counts)}")

    review_by_sku = {str(row["SKU"]): row for row in seth_review}
    if len(review_by_sku) != len(seth_review):
        raise ReconciliationRefused("Seth PRICING REVIEW contains duplicate SKUs")
    missing_by_key: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for row in seth_missing:
        missing_by_key[(normalize_key(row["Product / Blend"]), normalize_key(row["Strength / Configuration"]))].append(row)

    for row in master:
        sku = str(row["SKU"])
        row["_pointer"] = source_pointer(paths["septemberCatalog"].name, "Master Peptide Catalog", row["_row"])
        if sku.startswith("XRUO-"):
            evidence = review_by_sku.get(sku)
            if evidence is None:
                raise ReconciliationRefused(f"{sku} has no exact Seth PRICING REVIEW row")
            if normalize_key(evidence["Product"]) != normalize_key(row["Product / Blend"]) or normalize_key(evidence["Strength / Configuration"]) != normalize_key(row["Strength / Configuration"]):
                raise ReconciliationRefused(f"{sku} differs from its Seth identity")
            selected, authority = price_from_seth_review(evidence)
            row["_priceSourcePointer"] = source_pointer(paths["sethPricing"].name, "PRICING REVIEW", evidence["_row"])
        elif sku.startswith("EXP-"):
            key = (normalize_key(row["Product / Blend"]), normalize_key(row["Strength / Configuration"]))
            matches = missing_by_key.get(key, [])
            if len(matches) != 1:
                raise ReconciliationRefused(f"{sku} does not have one exact Seth MISSING PRODUCTS row")
            evidence = matches[0]
            selected, authority = price_from_seth_missing(evidence)
            row["_priceSourcePointer"] = source_pointer(paths["sethPricing"].name, "MISSING PRODUCTS", evidence["_row"])
        else:
            supported_sources = {
                normalize_key(source) for source in policy["wholesaleEvidence"]["verifiedWholesaleSources"]
            }
            wholesale_supported = normalize_key(row.get("Wholesale Source")) in supported_sources
            selected, authority = select_retail_price(
                current_master=row.get("Retail Price"),
                verified_wholesale=row.get("Current Wholesale / Unit"),
                wholesale_supported=wholesale_supported,
                wholesale_multiple=Decimal(policy["wholesaleEvidence"]["provisionalRetailMultiple"]),
            )
            row["_priceSourcePointer"] = row["_pointer"]
        if as_decimal(selected) != as_decimal(row.get("Retail Price")):
            raise ReconciliationRefused(f"{sku} retail differs from the source precedence result")
        row["_selectedRetail"] = selected
        row["_priceAuthority"] = authority

    price_authority_counts = Counter(str(row["_priceAuthority"]) for row in master)
    expected_price_authorities = Counter({
        "seth_recommended_retail": 106,
        "current_master_retail": 68,
        "retail_pending": 2,
    })
    if price_authority_counts != expected_price_authorities:
        raise ReconciliationRefused(f"retail price precedence drifted: {dict(price_authority_counts)}")

    catalog = read_json(catalog_path)
    bindings = read_json(bindings_path)
    if len(catalog.get("products", [])) != 420 or catalog.get("variantCount") != 420:
        raise ReconciliationRefused("canonical catalog count drifted")
    if len(bindings.get("bindings", [])) != 417:
        raise ReconciliationRefused("canonical binding count drifted")

    label_index: dict[str, list[dict]] = defaultdict(list)
    canonical_entries: list[dict] = []
    for product in catalog["products"]:
        for variant in product.get("variants", []):
            entry = {
                "offeringId": product["id"],
                "variantId": variant["id"],
                "productName": product["displayName"],
                "configuration": variant["label"],
                "family": product["family"],
                "category": product["category"],
                "subcategory": product["subcategory"],
                "displayState": variant.get("displayState", product["displayState"]),
            }
            canonical_entries.append(entry)
            label_index[normalize_key(variant["label"])].append(entry)
    if len(canonical_entries) != 420:
        raise ReconciliationRefused("canonical variant expansion drifted")

    binding_index = {}
    for binding in bindings["bindings"]:
        key = (binding["offeringId"], binding["offeringVariantId"])
        if key in binding_index:
            raise ReconciliationRefused("duplicate Product Control binding")
        binding_index[key] = binding

    provisional_matches: dict[str, dict | None] = {}
    collisions: dict[tuple[str, str], list[str]] = defaultdict(list)
    for row in master:
        matches = exact_catalog_match(row, label_index)
        provisional_matches[row["SKU"]] = matches[0] if len(matches) == 1 else None
        if len(matches) == 1:
            collisions[(matches[0]["offeringId"], matches[0]["variantId"])].append(row["SKU"])
    for key, colliding_skus in collisions.items():
        if len(colliding_skus) > 1:
            for sku in colliding_skus:
                provisional_matches[sku] = None

    candidate_by_variant = {
        (match["offeringId"], match["variantId"]): row
        for row in master
        if (match := provisional_matches[row["SKU"]]) is not None
    }
    exact_match_name_mismatches = sum(
        normalize_key(row["Product / Blend"]) != normalize_key(match["productName"])
        for row in master
        if (match := provisional_matches[row["SKU"]]) is not None
    )
    if exact_match_name_mismatches != 0:
        raise ReconciliationRefused("an exact canonical match crossed a product-name boundary")
    margin_floor = Decimal(policy["launchMarginFloor"])
    units = []
    for entry in canonical_entries:
        key = (entry["offeringId"], entry["variantId"])
        candidate = candidate_by_variant.get(key)
        proxy_margin = margin_on_wholesale_proxy(candidate.get("_selectedRetail"), candidate.get("Current Wholesale / Unit")) if candidate else None
        unit = {
            "unitId": f"canonical:{entry['variantId']}",
            "offeringId": entry["offeringId"],
            "variantId": entry["variantId"],
            "productName": entry["productName"],
            "configuration": entry["configuration"],
            "canonicalFamily": entry["family"],
            "canonicalDisplayState": entry["displayState"],
            "productControlSku": binding_index.get(key, {}).get("productControlSku"),
            "candidate": candidate,
            "marginFloor": margin_floor,
            "evidence": {
                "canonicalIdentityVerified": True,
                "productControlBindingPresent": key in binding_index,
                "researchLaneExplicit": candidate is not None and candidate.get("Channel") == "RUO Research",
                "candidateRetailPresent": candidate is not None and is_positive(candidate.get("_selectedRetail")),
                "wholesaleCostProxyPresent": candidate is not None and is_positive(candidate.get("Current Wholesale / Unit")),
                "marginOnWholesaleProxy": proxy_margin,
            },
        }
        unit["action"] = classify_unit(unit, margin_floor)
        units.append(unit)

    for row in master:
        if provisional_matches[row["SKU"]] is not None:
            continue
        proxy_margin = margin_on_wholesale_proxy(row.get("_selectedRetail"), row.get("Current Wholesale / Unit"))
        unit = {
            "unitId": f"intake:{row['SKU']}",
            "offeringId": None,
            "variantId": None,
            "productName": row["Product / Blend"],
            "configuration": row["Strength / Configuration"],
            "canonicalFamily": None,
            "canonicalDisplayState": None,
            "productControlSku": None,
            "candidate": row,
            "marginFloor": margin_floor,
            "evidence": {
                "canonicalIdentityVerified": False,
                "productControlBindingPresent": False,
                "researchLaneExplicit": row.get("Channel") == "RUO Research",
                "candidateRetailPresent": is_positive(row.get("_selectedRetail")),
                "wholesaleCostProxyPresent": is_positive(row.get("Current Wholesale / Unit")),
                "marginOnWholesaleProxy": proxy_margin,
            },
        }
        unit["action"] = classify_unit(unit, margin_floor)
        units.append(unit)

    vendor_fields = [
        "Vendor Availability", "Wholesale Unit Cost", "MOQ", "Lead Time", "Capacity / Inventory",
        "COA / Lot Docs", "Purity / Assay", "Sterility / Endotoxin", "Shipping Origin", "Dropship",
        "Private Label", "Custom Blend Capability", "Vendor Notes",
    ]
    rfq_populated = sum(any(row.get(field) not in (None, "") for field in vendor_fields) for row in rfq)
    open_blocking_gates = [row for row in financial_gates if str(row.get("Blocking?") or "").lower() == "yes" and str(row.get("Status") or "").lower() not in {"complete", "completed", "done"}]
    review_statuses = Counter(str(row.get("Review Status") or "") for row in seth_review)

    sanitized = sorted((sanitized_row(unit) for unit in units), key=lambda row: (row["action"], row["unitId"]))
    all_conflicts = sorted(
        (item for unit in units for item in conflicts_for(unit, margin_floor)),
        key=lambda item: (item["code"], item["unitId"], item["sourcePointer"] or ""),
    )
    action_counts = Counter(row["action"] for row in sanitized)
    expected_action_counts = {
        "direct_buy": 0,
        "assisted_order": 102,
        "care_required": 242,
        "unavailable": 147,
    }
    observed_action_counts = {action: action_counts.get(action, 0) for action in expected_action_counts}
    if sum(action_counts.values()) != 491 or observed_action_counts != expected_action_counts:
        raise ReconciliationRefused(f"union/action invariant failed: {dict(action_counts)}")
    declared_live_variants = int(policy["declaredLiveProductionVariantCount"])
    live_variant_delta = declared_live_variants - len(canonical_entries)
    if live_variant_delta != 19:
        raise ReconciliationRefused(f"declared live/repo canonical delta drifted: {live_variant_delta}")
    report = {
        "schemaVersion": 1,
        "asOf": policy["asOf"],
        "mode": "DRY_RUN",
        "scope": policy["scope"],
        "coverageStatus": "repo_canonical_plus_intake_only_not_full_live_snapshot",
        "productionCoverageComplete": False,
        "productionMutated": False,
        "databaseMutated": False,
        "catalogRuntimeMutated": False,
        "productControlMutated": False,
        "inputs": {
            key: {"filename": path.name, "sha256": sha256(path)} for key, path in paths.items()
        } | {
            "canonicalCatalog": {"path": str(catalog_path.relative_to(REPO_ROOT)).replace("\\", "/"), "sha256": sha256(catalog_path)},
            "canonicalBindings": {"path": str(bindings_path.relative_to(REPO_ROOT)).replace("\\", "/"), "sha256": sha256(bindings_path)},
        },
        "sourceObservations": {
            "launchMarginFloor": policy["launchMarginFloor"],
            "launchMarginFloorEvidence": source_pointer(
                paths["septemberCatalog"].name,
                margin_evidence["sheet"],
                margin_evidence["row"],
            ) + f"::{margin_evidence['range']}",
            "septemberCatalogRows": len(master),
            "septemberSkuPartitions": dict(sorted(prefix_counts.items())),
            "sethPricingReviewRows": len(seth_review),
            "sethMissingProductRows": len(seth_missing),
            "sethReviewStatuses": dict(sorted(review_statuses.items())),
            "retailPriceAuthorityCounts": dict(sorted(price_authority_counts.items())),
            "wholesaleCostProxyField": "Current Wholesale / Unit",
            "wholesaleCostProxyIsLandedCost": False,
            "actualLandedCostRowsVerified": 0,
            "financialProductRows": len(financial_products),
            "financialOpenBlockingLaunchGates": len(open_blocking_gates),
            "vendorRfqRows": len(rfq),
            "vendorRfqRowsWithAnyResponse": rfq_populated,
            "canonicalVariants": len(canonical_entries),
            "canonicalBindings": len(binding_index),
            "declaredLiveProductionVariants": declared_live_variants,
            "repoCanonicalToDeclaredLiveVariantDelta": live_variant_delta,
            "septemberRowsWithExactCanonicalVariant": len(candidate_by_variant),
            "septemberRowsWithoutExactCanonicalVariant": len(master) - len(candidate_by_variant),
            "exactCanonicalMatchProductNameMismatches": exact_match_name_mismatches,
        },
        "counts": {
            "unionUnits": len(sanitized),
            "direct_buy": action_counts.get("direct_buy", 0),
            "assisted_order": action_counts.get("assisted_order", 0),
            "care_required": action_counts.get("care_required", 0),
            "unavailable": action_counts.get("unavailable", 0),
            "conflictEvents": len(all_conflicts),
            "conflictUnits": len({item["unitId"] for item in all_conflicts}),
        },
        "globalDirectBuyBlockers": [
            "exact_live_439_variant_snapshot_not_supplied_to_catalog_lane",
            "no_completed_vendor_rfq_response",
            "actual_landed_cost_not_verified",
            "supplier_fulfillment_entity_not_verified",
            "inventory_or_capacity_not_verified",
            "quality_lot_coa_documentation_not_verified",
            "storage_shipping_and_geography_not_verified",
            "return_replacement_recall_policy_not_verified",
            "supported_payment_not_verified_by_source_set",
            "complete_downstream_order_flow_not_verified_by_source_set",
            "approved_active_retail_not_verified_by_source_set",
        ],
        "externalBlockers": [
            {
                "code": "exact_live_variant_snapshot_missing",
                "declaredLiveVariantCount": declared_live_variants,
                "repoCanonicalVariantCount": len(canonical_entries),
                "unreconciledVariantDelta": live_variant_delta,
                "effect": "The 19 unidentified live-only variants cannot be assigned an action. Batches are exact only for the stated repo-canonical-plus-intake union scope and must not be represented as complete live mutation coverage."
            }
        ],
        "privacy": policy["privacy"],
        "rows": sanitized,
    }
    return report, all_conflicts


def batch_document(report: dict, action: str) -> dict:
    rows = [row for row in report["rows"] if row["action"] == action]
    return {
        "schemaVersion": 1,
        "asOf": report["asOf"],
        "mode": "DRY_RUN",
        "sourceScope": report["scope"],
        "coverageStatus": report["coverageStatus"],
        "productionCoverageComplete": False,
        "unreconciledLiveVariantDelta": report["sourceObservations"]["repoCanonicalToDeclaredLiveVariantDelta"],
        "globalDirectBuyBlockers": report["globalDirectBuyBlockers"],
        "action": action,
        "rowCount": len(rows),
        "productionMutated": False,
        "rows": rows,
    }


def conflict_document(report: dict, conflicts: list[dict]) -> dict:
    counts = Counter(item["code"] for item in conflicts)
    return {
        "schemaVersion": 1,
        "asOf": report["asOf"],
        "mode": "DRY_RUN",
        "sourceScope": report["scope"],
        "coverageStatus": report["coverageStatus"],
        "productionCoverageComplete": False,
        "unreconciledLiveVariantDelta": report["sourceObservations"]["repoCanonicalToDeclaredLiveVariantDelta"],
        "externalBlockers": report["externalBlockers"],
        "conflictEventCount": len(conflicts),
        "affectedUnitCount": len({item["unitId"] for item in conflicts}),
        "countsByCode": dict(sorted(counts.items())),
        "containsSupplierIdentity": False,
        "containsWholesaleValues": False,
        "containsRawNotes": False,
        "conflicts": conflicts,
    }


def serialized_json(value: dict) -> bytes:
    return (json.dumps(value, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


FORBIDDEN_OUTPUT_KEYS = {
    "selectedreferencesupplier",
    "currentwholesaleunit",
    "wholesalesource",
    "wholesalecost",
    "supplier",
    "supplieridentity",
    "suppliername",
    "sethnotes",
    "vendornotes",
    "historicalclients",
    "historicalrecords",
    "currentpipelinementions",
    "rawnotes",
}


def collect_sensitive_source_terms(paths: dict[str, Path]) -> set[str]:
    fields_by_table = (
        (paths["septemberCatalog"], "Master Peptide Catalog", 3, ("Selected / Reference Supplier", "Wholesale Source", "Notes")),
        (paths["septemberCatalog"], "Supplier Alternatives", 3, ("Supplier", "Source")),
        (paths["sethPricing"], "PRICING REVIEW", 4, ("Seth Notes",)),
        (paths["sethPricing"], "MISSING PRODUCTS", 4, ("Notes",)),
        (paths["financialModel"], "Product Catalog", 3, ("Source",)),
        (paths["vendorRfq"], "Peptide Sourcing RFQ", 3, ("Vendor Notes",)),
    )
    terms = set()
    for path, sheet, header_row, fields in fields_by_table:
        for row in table_records(path, sheet, header_row):
            for field in fields:
                value = row.get(field)
                if isinstance(value, str) and len(value.strip()) >= 4:
                    terms.add(value.strip())
    return terms


def validate_output_privacy(documents: dict[str, dict], sensitive_terms: set[str] | None = None) -> None:
    def visit(value):
        if isinstance(value, dict):
            for key, nested in value.items():
                if normalize_key(key) in FORBIDDEN_OUTPUT_KEYS:
                    raise ReconciliationRefused(f"private source key escaped into output: {key}")
                visit(nested)
        elif isinstance(value, list):
            for nested in value:
                visit(nested)

    for document in documents.values():
        visit(document)
    serialized = "\n".join(json.dumps(document, ensure_ascii=False).lower() for document in documents.values())
    for term in sensitive_terms or set():
        if term.lower() in serialized:
            raise ReconciliationRefused("a populated supplier/source/notes cell escaped into output")


def output_documents(report: dict, conflicts: list[dict]) -> dict[str, dict]:
    documents = {
        "catalog-reconciliation.json": report,
        "direct-buy-batch.json": batch_document(report, "direct_buy"),
        "assisted-order-batch.json": batch_document(report, "assisted_order"),
        "care-required-batch.json": batch_document(report, "care_required"),
        "unavailable-batch.json": batch_document(report, "unavailable"),
        "conflicts.json": conflict_document(report, conflicts),
    }
    validate_output_privacy(documents)
    return documents


def write_outputs(output: Path, report: dict, conflicts: list[dict], sensitive_terms: set[str]) -> None:
    resolved = output.resolve()
    allowed = DEFAULT_OUTPUT.resolve()
    if resolved != allowed:
        raise ReconciliationRefused(f"output must be exactly {allowed}")
    output.mkdir(parents=True, exist_ok=True)
    documents = output_documents(report, conflicts)
    validate_output_privacy(documents, sensitive_terms)
    for filename, document in documents.items():
        (output / filename).write_bytes(serialized_json(document))


def verify_outputs(output: Path, report: dict, conflicts: list[dict], sensitive_terms: set[str]) -> None:
    if output.resolve() != DEFAULT_OUTPUT.resolve():
        raise ReconciliationRefused(f"output must be exactly {DEFAULT_OUTPUT.resolve()}")
    differences = []
    documents = output_documents(report, conflicts)
    validate_output_privacy(documents, sensitive_terms)
    for filename, document in documents.items():
        path = output / filename
        expected = serialized_json(document)
        if not path.is_file():
            differences.append(f"missing {filename}")
        elif path.read_bytes() != expected:
            differences.append(f"byte drift {filename}")
    if differences:
        raise ReconciliationRefused("deterministic output verification failed: " + "; ".join(differences))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--september-catalog", type=Path, required=True)
    parser.add_argument("--seth-pricing", type=Path, required=True)
    parser.add_argument("--financial-model", type=Path, required=True)
    parser.add_argument("--vendor-rfq", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--check", action="store_true", help="verify checked-in JSON outputs byte-for-byte without writing")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    policy = read_json(POLICY_PATH)
    paths = {
        "septemberCatalog": args.september_catalog.resolve(),
        "sethPricing": args.seth_pricing.resolve(),
        "financialModel": args.financial_model.resolve(),
        "vendorRfq": args.vendor_rfq.resolve(),
    }
    report, conflicts = build_report(paths, policy)
    sensitive_terms = collect_sensitive_source_terms(paths)
    if args.check:
        verify_outputs(args.output, report, conflicts, sensitive_terms)
    else:
        write_outputs(args.output, report, conflicts, sensitive_terms)
    print(json.dumps({"counts": report["counts"], "sourceObservations": report["sourceObservations"]}, sort_keys=True))


if __name__ == "__main__":
    main()
