import importlib.util
from decimal import Decimal
import json
from pathlib import Path
import unittest


MODULE_PATH = Path(__file__).with_name("reconcile_catalog.py")
SPEC = importlib.util.spec_from_file_location("catalog_reconciler", MODULE_PATH)
catalog_reconciler = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(catalog_reconciler)


class CatalogReconcilerTests(unittest.TestCase):
    def test_normalization_is_exact_but_format_insensitive(self):
        self.assertEqual(
            catalog_reconciler.normalize_key("BPC-157 + TB-500 5 mg"),
            catalog_reconciler.normalize_key("BPC 157 + TB 500 — 5MG"),
        )
        self.assertNotEqual(
            catalog_reconciler.normalize_key("BPC-157 5 mg"),
            catalog_reconciler.normalize_key("BPC-157 10 mg"),
        )

    def test_duplicate_label_requires_exact_form_to_resolve(self):
        index = {
            catalog_reconciler.normalize_key("DIHEXA 10 mg"): [
                {"offeringId": "a", "variantId": "v1", "subcategory": "Capsule / Bottle"},
                {"offeringId": "b", "variantId": "v2", "subcategory": "Lyophilized Vial"},
            ]
        }
        candidate = {
            "Product / Blend": "Dihexa",
            "Strength / Configuration": "DIHEXA 10 mg",
            "Form": "Capsule / Bottle",
        }
        self.assertEqual(catalog_reconciler.exact_catalog_match(candidate, index)[0]["variantId"], "v1")
        candidate["Form"] = "Unknown"
        self.assertEqual(catalog_reconciler.exact_catalog_match(candidate, index), [])

    def test_price_precedence_never_invents_a_value(self):
        self.assertEqual(
            catalog_reconciler.price_from_seth_review(
                {"Seth Recommended Retail": Decimal("129"), "Current Retail": Decimal("79")}
            ),
            (Decimal("129"), "seth_recommended_retail"),
        )
        self.assertEqual(
            catalog_reconciler.price_from_seth_review(
                {"Seth Recommended Retail": None, "Current Retail": Decimal("79")}
            ),
            (Decimal("79"), "seth_current_retail"),
        )
        self.assertEqual(
            catalog_reconciler.price_from_seth_missing(
                {"Recommended Xenios Retail": None, "What Seth Sells It For": "??"}
            ),
            (None, "retail_pending"),
        )

    def test_fractional_cent_is_preserved_and_not_silently_rounded(self):
        self.assertEqual(catalog_reconciler.decimal_text(Decimal("159.375")), "159.375")
        self.assertIsNone(catalog_reconciler.cents(Decimal("159.375")))
        self.assertEqual(catalog_reconciler.cents(Decimal("159.38")), 15938)

    def test_classifier_has_no_direct_buy_path(self):
        base = {
            "canonicalFamily": "research_peptides_materials",
            "canonicalDisplayState": "request_access",
            "candidate": {"SKU": "X"},
            "evidence": {
                "canonicalIdentityVerified": True,
                "productControlBindingPresent": True,
                "researchLaneExplicit": True,
                "candidateRetailPresent": True,
                "landedCostPresent": True,
                "grossMargin": Decimal("0.60"),
            },
        }
        self.assertEqual(catalog_reconciler.classify_unit(base, Decimal("0.35")), "assisted_order")
        base["evidence"]["grossMargin"] = Decimal("0.34")
        self.assertEqual(catalog_reconciler.classify_unit(base, Decimal("0.35")), "unavailable")
        base["canonicalFamily"] = "clinical_formulations_503a"
        self.assertEqual(catalog_reconciler.classify_unit(base, Decimal("0.35")), "care_required")

    def test_output_serialization_is_byte_deterministic_and_scope_explicit(self):
        report = {
            "asOf": "2026-09-21",
            "scope": "canonical_catalog_plus_2026_09_15_commercial_intake",
            "coverageStatus": "repo_canonical_plus_intake_only_not_full_live_snapshot",
            "sourceObservations": {"repoCanonicalToDeclaredLiveVariantDelta": 19},
            "externalBlockers": [{"code": "exact_live_variant_snapshot_missing"}],
            "globalDirectBuyBlockers": ["no_completed_vendor_rfq_response"],
            "rows": [],
        }
        documents = catalog_reconciler.output_documents(report, [])
        first = {name: catalog_reconciler.serialized_json(value) for name, value in documents.items()}
        second = {name: catalog_reconciler.serialized_json(value) for name, value in documents.items()}
        self.assertEqual(first, second)
        self.assertEqual(documents["direct-buy-batch.json"]["sourceScope"], report["scope"])
        self.assertFalse(documents["direct-buy-batch.json"]["productionCoverageComplete"])
        self.assertEqual(documents["direct-buy-batch.json"]["unreconciledLiveVariantDelta"], 19)

    def test_checked_in_batches_are_an_exact_partition_of_the_source_scope(self):
        output = MODULE_PATH.parents[3] / "docs/production-completion/catalog"
        report = json.loads((output / "catalog-reconciliation.json").read_text(encoding="utf-8"))
        expected = {"direct_buy": 0, "assisted_order": 96, "care_required": 242, "unavailable": 153}
        observed_ids = []
        for action, filename in {
            "direct_buy": "direct-buy-batch.json",
            "assisted_order": "assisted-order-batch.json",
            "care_required": "care-required-batch.json",
            "unavailable": "unavailable-batch.json",
        }.items():
            batch = json.loads((output / filename).read_text(encoding="utf-8"))
            self.assertEqual(batch["action"], action)
            self.assertEqual(batch["rowCount"], expected[action])
            self.assertEqual(batch["sourceScope"], report["scope"])
            self.assertFalse(batch["productionCoverageComplete"])
            self.assertEqual(batch["unreconciledLiveVariantDelta"], 19)
            self.assertTrue(all(row["action"] == action for row in batch["rows"]))
            observed_ids.extend(row["unitId"] for row in batch["rows"])
        self.assertEqual(len(observed_ids), 491)
        self.assertEqual(len(set(observed_ids)), 491)
        self.assertEqual(set(observed_ids), {row["unitId"] for row in report["rows"]})

    def test_checked_in_report_keeps_private_values_out(self):
        output = MODULE_PATH.parents[3] / "docs/production-completion/catalog"
        report = json.loads((output / "catalog-reconciliation.json").read_text(encoding="utf-8"))
        serialized = json.dumps(report, sort_keys=True).lower()
        for private_term in (
            "unity / peptaris",
            "raw peptides",
            "alpha biomed",
            "selected / reference supplier",
            "current wholesale / unit",
            "wholesale source",
            "historical clients",
            "current pipeline mentions",
        ):
            self.assertNotIn(private_term, serialized)


if __name__ == "__main__":
    unittest.main()
