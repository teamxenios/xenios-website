import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from inspect_source import inventory, safe_relative
from validate_source import checksums_agree, dollars_to_cents, read_csv, read_json, validate_rows


class SourceIntegrityTests(unittest.TestCase):
    def test_inventory_uses_bytes_not_names_and_rejects_changed_content(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / "renamed(2).txt"
            path.write_bytes(b"original")
            manifest = {"files": [{"path": "inputs/source.txt", "bytes": 8,
                                    "sha256": hashlib.sha256(b"original").hexdigest()}]}
            self.assertEqual(inventory(manifest, [root])[0][0]["status"], "verified")
            path.write_bytes(b"modified")
            self.assertEqual(inventory(manifest, [root])[0][0]["status"], "missing")
            manifest["files"].append(manifest["files"][0])
            with self.assertRaises(ValueError):
                inventory(manifest, [root])

    def test_package_paths_cannot_escape(self):
        for value in ("../secret", "/secret", "C:/secret", "a/../secret", "a\\secret", "a//b", "./b", ""):
            with self.subTest(value=value), self.assertRaises(ValueError):
                safe_relative(value)

    def test_no_rounding_formulas_or_float_coercion(self):
        self.assertEqual(dollars_to_cents("5.50"), 550)
        self.assertEqual(dollars_to_cents("129.0"), 12900)
        self.assertIsNone(dollars_to_cents(""))
        for value in ("1.001", "1e2", "NaN", "Infinity", "=1+1", "-5", True, 129, "21474836.48"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                dollars_to_cents(value)

    def test_duplicate_json_keys_and_malformed_csv_fail(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "source"
            path.write_text('{"price": 10, "price": 20}')
            with self.assertRaises(ValueError):
                read_json(path)
            for content in ("id,id\na,b\n", "id,price\na\n", "id,price\na,2,3\n"):
                path.write_text(content)
                with self.assertRaises(ValueError):
                    read_csv(path)

    def test_checksum_manifest_cannot_omit_or_change_a_source(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "checksums"
            digest = "a" * 64
            manifest = {"files": [{"path": "source", "sha256": digest}]}
            path.write_text(digest + "  source\n")
            self.assertEqual(checksums_agree(manifest, path), 1)
            path.write_text("b" * 64 + "  source\n")
            with self.assertRaises(ValueError):
                checksums_agree(manifest, path)

    def fixture(self, phase="A"):
        source_path = Path(__file__).resolve().parents[2] / "config/research/revenue-launch/seth-source-reconciliation-20260905.json"
        source = json.loads(source_path.read_text(encoding="utf-8"))["phase" + phase]
        rows, csv_rows = [], []
        for source_row in source:
            row = {"source_sku" if phase == "A" else "candidate_id": source_row["sourceId"],
                   "launch_item_id": source_row["launchItemId"], "product": source_row["sourceProduct"],
                   "configuration": source_row["sourceConfiguration"], "target_customer_state": "direct_buy_live",
                   "current_launch_state": "awaiting_current_canonical_reconciliation" if phase == "A" else "candidate_intake_pending_validation",
                   "auto_publish": False, "activation_requires_exact_sha_go": True,
                   "price_authority": "canonical_server_price_version_only", "risk_flags": source_row["riskFlags"]}
            csv_row = {**row, "risk_flags": "|".join(row["risk_flags"])}
            for tier, json_key, csv_key in zip(source_row["tiers"],
                    ("seth_single_unit_price_cents", "seth_5_plus_unit_price_cents", "seth_10_plus_unit_price_cents"),
                    ("single_unit_price", "price_5_plus", "price_10_plus")):
                value = tier["amountCents"]
                row[json_key] = value
                csv_row[csv_key] = "" if value is None else f"{value // 100}.{value % 100:02}"
            rows.append(row)
            csv_rows.append(csv_row)
        return rows, csv_rows

    def test_all_source_tiers_and_pending_exceptions_survive(self):
        rows, csv_rows = self.fixture()
        result, exceptions = validate_rows(rows, csv_rows, "A")
        self.assertEqual(sum(len(row["tiers"]) for row in result), 117)
        self.assertEqual([tier["amountCents"] for tier in result[0]["tiers"]], [12900, 12300, 11700])
        self.assertEqual(exceptions, [])
        self.assertTrue(all(row["canonicalProductId"] is None and not row["approved"] for row in result))
        result, exceptions = validate_rows(*self.fixture("B"), "B")
        self.assertEqual(len(result), 68)
        self.assertEqual([row["sourceId"] for row in exceptions], ["SETH-CAND-046", "SETH-CAND-063", "SETH-CAND-064", "SETH-CAND-066"])

    def test_row_loss_duplicate_identity_price_disagreement_and_autopublish_fail(self):
        rows, csv_rows = self.fixture()
        mutations = [lambda r: r.pop(), lambda r: r.__setitem__(1, copy.deepcopy(r[0])),
                     lambda r: r[0].__setitem__("seth_single_unit_price_cents", 12800),
                     lambda r: r[0].__setitem__("seth_single_unit_price_cents", True),
                     lambda r: r[0].__setitem__("seth_single_unit_price_cents", 12900.5),
                     lambda r: r[0].__setitem__("auto_publish", True),
                     lambda r: r[0].__setitem__("current_launch_state", "live")]
        for mutation in mutations:
            changed = copy.deepcopy(rows)
            mutation(changed)
            with self.assertRaises(ValueError):
                validate_rows(changed, csv_rows, "A")
        csv_rows[0]["price_5_plus"] = "130.00"
        rows[0]["seth_5_plus_unit_price_cents"] = 13000
        with self.assertRaisesRegex(ValueError, "nonincreasing"):
            validate_rows(rows, csv_rows, "A")


if __name__ == "__main__":
    unittest.main()
