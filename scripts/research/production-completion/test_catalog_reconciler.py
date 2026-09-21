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
                {"offeringId": "a", "variantId": "v1", "productName": "Dihexa", "subcategory": "Capsule / Bottle"},
                {"offeringId": "b", "variantId": "v2", "productName": "Dihexa", "subcategory": "Lyophilized Vial"},
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

    def test_same_configuration_cannot_cross_a_product_name_boundary(self):
        index = {
            catalog_reconciler.normalize_key("10 mg"): [
                {"offeringId": "a", "variantId": "v1", "productName": "Product A", "subcategory": "Vial"},
            ]
        }
        wrong_product = {
            "Product / Blend": "Product B",
            "Strength / Configuration": "10 mg",
            "Form": "Vial",
        }
        self.assertEqual(catalog_reconciler.exact_catalog_match(wrong_product, index), [])

    def test_price_precedence_is_complete_and_never_invents_support(self):
        select = catalog_reconciler.select_retail_price
        self.assertEqual(
            select(
                seth_recommended=Decimal("129"),
                seth_current=Decimal("119"),
                current_master=Decimal("109"),
                verified_wholesale=Decimal("40"),
                wholesale_supported=True,
            ),
            (Decimal("129"), "seth_recommended_retail"),
        )
        self.assertEqual(
            select(seth_current=Decimal("119"), current_master=Decimal("109")),
            (Decimal("119"), "seth_current_retail"),
        )
        self.assertEqual(
            select(current_master=Decimal("109"), verified_wholesale=Decimal("40"), wholesale_supported=True),
            (Decimal("109"), "current_master_retail"),
        )
        self.assertEqual(
            select(verified_wholesale=Decimal("40"), wholesale_supported=True),
            (Decimal("100.0"), "provisional_2_5x_verified_wholesale"),
        )
        self.assertEqual(
            select(verified_wholesale=Decimal("40"), wholesale_supported=False),
            (None, "retail_pending"),
        )
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
            (Decimal("79"), "current_master_retail"),
        )
        self.assertEqual(
            catalog_reconciler.price_from_seth_missing(
                {"Recommended Xenios Retail": None, "What Seth Sells It For": Decimal("89")}
            ),
            (Decimal("89"), "seth_current_retail"),
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
                "wholesaleCostProxyPresent": True,
                "marginOnWholesaleProxy": Decimal("0.60"),
            },
        }
        self.assertEqual(catalog_reconciler.classify_unit(base, Decimal("0.35")), "assisted_order")
        base["evidence"]["marginOnWholesaleProxy"] = Decimal("0.34")
        self.assertEqual(catalog_reconciler.classify_unit(base, Decimal("0.35")), "assisted_order")
        base["evidence"]["candidateRetailPresent"] = False
        base["evidence"]["wholesaleCostProxyPresent"] = False
        self.assertEqual(catalog_reconciler.classify_unit(base, Decimal("0.35")), "assisted_order")
        base["canonicalDisplayState"] = "approval_required"
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
        expected = {"direct_buy": 0, "assisted_order": 102, "care_required": 242, "unavailable": 147}
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
        self.assertEqual(report["sourceObservations"]["retailPriceAuthorityCounts"], {
            "current_master_retail": 68,
            "retail_pending": 2,
            "seth_recommended_retail": 106,
        })
        self.assertEqual(report["sourceObservations"]["exactCanonicalMatchProductNameMismatches"], 0)

    def test_subfloor_exact_bound_rows_remain_assisted_with_truthful_review_reasons(self):
        output = MODULE_PATH.parents[3] / "docs/production-completion/catalog"
        assisted = json.loads((output / "assisted-order-batch.json").read_text(encoding="utf-8"))
        rows = {row["candidateSku"]: row for row in assisted["rows"]}
        audited = {"EXP-041", "EXP-044", "EXP-046", "EXP-054", "EXP-056", "EXP-057"}
        self.assertTrue(audited.issubset(rows))
        for sku in audited:
            self.assertIn("wholesale_proxy_margin_below_floor_requires_review", rows[sku]["reasonCodes"])
            self.assertNotIn("candidate_price_and_margin_pass_floor", rows[sku]["reasonCodes"])
            self.assertFalse(rows[sku]["evidence"]["landedCostVerified"])

    def test_all_checked_in_outputs_keep_private_values_and_keys_out(self):
        output = MODULE_PATH.parents[3] / "docs/production-completion/catalog"
        filenames = (
            "catalog-reconciliation.json",
            "direct-buy-batch.json",
            "assisted-order-batch.json",
            "care-required-batch.json",
            "unavailable-batch.json",
            "conflicts.json",
        )
        documents = {name: json.loads((output / name).read_text(encoding="utf-8")) for name in filenames}
        catalog_reconciler.validate_output_privacy(documents)
        serialized = json.dumps(documents, sort_keys=True).lower()
        self.assertNotIn("landedcostpresent", serialized)
        self.assertNotIn("grossmarginatorabovefloor", serialized)

        policy = catalog_reconciler.read_json(MODULE_PATH.parents[3] / "config/research/production-completion/catalog-reconciliation-policy.json")
        downloads = Path.home() / "Downloads"
        paths = {key: downloads / value["filename"] for key, value in policy["sourceFiles"].items()}
        if all(path.is_file() for path in paths.values()):
            for key, path in paths.items():
                catalog_reconciler.verify_source(path, policy["sourceFiles"][key], key)
            sensitive_terms = catalog_reconciler.collect_sensitive_source_terms(paths)
            self.assertGreater(len(sensitive_terms), 0)
            catalog_reconciler.validate_output_privacy(documents, sensitive_terms)


if __name__ == "__main__":
    unittest.main()
