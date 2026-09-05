"""Reconcile exact historical bindings against current canonical row identity.

No name-based match is accepted. Historical references are evidence to review,
not authority to approve a source formulation or an absent unit of sale.
"""
import argparse
from collections import Counter
import json
from pathlib import Path

from inspect_source import sha256
from validate_source import read_json


def reconcile(source, production, historical):
    tables = production["tables"]
    for table in ("research_products", "research_product_variants", "research_product_prices"):
        if tables[table].get("ok") is not True:
            raise ValueError("Canonical product read incomplete")
    products = {row["id"]: row for row in tables["research_products"]["rows"]}
    variants = {row["id"]: row for row in tables["research_product_variants"]["rows"]}
    references = {}
    for row in historical["changes"]:
        key = row["founderBookSku"]
        if key in references:
            raise ValueError("Ambiguous historical source binding")
        references[key] = row
    results = []
    for row in source["phaseA"]:
        reference = references.get(row["sourceId"])
        blockers, match = [], None
        if reference:
            product = products.get(reference["productId"])
            variant = variants.get(reference["variantId"])
            if (product and variant and variant["product_id"] == product["id"]
                    and variant["sku"] == reference["sku"]):
                match = {"productId": product["id"], "variantId": variant["id"], "sku": variant["sku"],
                         "canonicalProductName": product["canonical_name"], "strength": variant["strength"],
                         "presentation": variant["presentation"], "format": variant["format"],
                         "lane": product["lane"], "classification": product["product_classification"],
                         "productStatus": product["admin_status"], "variantStatus": variant["status"],
                         "commerceApproval": product["commerce_approval"],
                         "documentationState": product["quality_document_state"],
                         "shippingClass": variant["shipping_class"]}
                if product["lane"] != "research_material":
                    blockers.append("research_classification_unconfirmed")
                if product["commerce_approval"] != "approved":
                    blockers.append("commerce_approval_missing")
                if not variant["format"] or not variant["presentation"]:
                    blockers.append("canonical_unit_of_sale_missing")
                if product["quality_document_state"] != "approved":
                    blockers.append("product_documentation_not_approved")
                if not variant["shipping_class"]:
                    blockers.append("shipping_class_missing")
            else:
                blockers.append("historical_binding_does_not_match_current_identity")
        else:
            blockers.append("exact_source_binding_missing")
        if any(flag in row["riskFlags"] for flag in (
                "CONFIGURATION_ASSUMPTION_REQUIRES_IDENTITY_CONFIRMATION", "CONFIGURATION_SPLIT_PENDING")):
            blockers.append("source_formulation_requires_confirmation")
        if not source["workbookCellsVerified"]:
            blockers.append("source_workbook_unverified")
        if production.get("liveSupplierConfirmations", {}).get("ok") is True:
            confirmations = production["liveSupplierConfirmations"]["rows"]
            if not match or not any(c["productId"] == match["productId"] and c["variantId"] == match["variantId"] for c in confirmations):
                blockers.append("current_supplier_confirmation_missing")
        else:
            blockers.append("current_supplier_confirmation_unverified")
        blockers.extend(["canonical_seth_price_batch_not_approved", "inventory_or_capacity_not_verified",
                         "exact_release_approval_missing"])
        results.append({"sourceId": row["sourceId"], "sourceProduct": row["sourceProduct"],
                        "sourceConfiguration": row["sourceConfiguration"],
                        "identityEvidence": "historical_exact_ids_reverified" if match else "unresolved",
                        "historicalReference": reference, "currentCanonicalIdentity": match,
                        "blockers": blockers, "readyForDirectBuy": False, "approved": False})
    return {"schemaVersion": 1, "purpose": "current_identity_evidence_for_admin_review",
            "productionObservedAt": production["observedAt"], "sourceRowCount": len(results),
            "exactHistoricalIdsReverified": sum(row["currentCanonicalIdentity"] is not None for row in results),
            "blockerCounts": dict(sorted(Counter(b for row in results for b in row["blockers"]).items())),
            "productionReady": False, "rows": results}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    for name in ("source", "production", "historical", "output"):
        parser.add_argument("--" + name, type=Path, required=True)
    args = parser.parse_args()
    report = reconcile(read_json(args.source), read_json(args.production), read_json(args.historical))
    report["inputHashes"] = {key: sha256(getattr(args, key)) for key in ("source", "production", "historical")}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: value for key, value in report.items() if key != "rows"}))
