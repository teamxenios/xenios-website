from __future__ import annotations

import hashlib
import importlib.util
import io
import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape


MODULE_PATH = Path(__file__).with_name("peptide_product_control.py")
SPEC = importlib.util.spec_from_file_location("peptide_product_control", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def column_name(index: int) -> str:
    output = ""
    value = index + 1
    while value:
        value, remainder = divmod(value - 1, 26)
        output = chr(65 + remainder) + output
    return output


def default_row(row_id: int = 1) -> dict[str, str]:
    row = {header: "fixture" for header in MODULE.EXPECTED_HEADERS}
    row.update(
        {
            "Row ID": str(row_id),
            "Commercial Rail / Category": "Peptides & Research",
            "Canonical Product ID": "PEP-001",
            "Canonical Product": "Fixture Research Material",
            "Exact Variant ID": "R360-FIXTURE-10MG-VIAL",
            "Exact SKU": "R360-FIXTURE-10MG-VIAL",
            "Exact Strength": "10 mg",
            "Exact Presentation": "Vial",
            "Product Class": "Research peptide / material",
            "Approved Selling Price": "59",
            "Currency": "USD",
            "Audience": "approved_research_member",
            "Inventory Quantity": "",
            "Inventory Status": "Supplier to complete",
            "Lot ID": "",
            "Expiration": "",
            "COA Status": "Pending COA",
            "Identity Test Status": "Supplier / Product Control to verify",
            "Purity Test Status": "Supplier to complete",
            "Sterility Status": "Supplier to complete where applicable",
            "Endotoxin Status": "Supplier to complete where applicable",
            "Documentation State": "Pending COA, lot, identity",
            "Fulfillment Method": "Supplier/direct D2C or Xenios-coordinated fulfillment",
            "Shipping Requirements": "Cold-chain details pending supplier",
            "Cold Chain": "Cold-chain review required / supplier to confirm",
            "Product Image Status": "Needs exact vial render/image",
            "Min Qty": "1",
            "Max Qty Per Order": "3",
            "Max Qty Per Customer": "10",
            "Strength / Identity Dispute Status": "Identity / strength documentation pending",
            "No Unresolved Dispute Confirmation": "NO - Identity / strength documentation pending",
            "Customer Offer State": "Request access",
            "Website Action": "REQUEST_ACCESS",
            "Public Visibility": "Member/gated request access or held",
            "Checkout Eligible Now": "NO",
            "Supplier Fill Required": "Yes",
            "Supplier": "PRIVATE_SUPPLIER_SENTINEL",
            "Wholesale Cost": "PRIVATE_WHOLESALE_SENTINEL",
            "Source Notes": "PRIVATE_SOURCE_NOTE_SENTINEL",
        }
    )
    return row


def workbook_bytes(records: list[dict[str, str]]) -> bytes:
    rows = [["title"], ["instructions"], [], list(MODULE.EXPECTED_HEADERS)]
    rows.extend([[record.get(header, "") for header in MODULE.EXPECTED_HEADERS] for record in records])
    xml_rows = []
    for row_index, row in enumerate(rows, start=1):
        cells = []
        for column_index, value in enumerate(row):
            if value == "":
                continue
            reference = f"{column_name(column_index)}{row_index}"
            cells.append(f'<c r="{reference}" t="inlineStr"><is><t>{escape(str(value))}</t></is></c>')
        if cells:
            xml_rows.append(f'<row r="{row_index}">{"".join(cells)}</row>')
    sheet_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<sheetData>{"".join(xml_rows)}</sheetData></worksheet>'
    )
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(
            "xl/workbook.xml",
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            f'<sheets><sheet name="{escape(MODULE.SOURCE_SHEET)}" sheetId="1" r:id="rId1"/></sheets></workbook>',
        )
        archive.writestr(
            "xl/_rels/workbook.xml.rels",
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
            '</Relationships>',
        )
        archive.writestr("xl/worksheets/sheet1.xml", sheet_xml)
    return output.getvalue()


class PeptideProductControlTest(unittest.TestCase):
    def build(self, records: list[dict[str, str]]):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        path = Path(temporary.name) / "source.xlsx"
        content = workbook_bytes(records)
        path.write_bytes(content)
        digest = hashlib.sha256(content).hexdigest()
        return MODULE.build_from_workbook(path, digest)

    def issue_codes(self, records: list[dict[str, str]]) -> set[str]:
        with self.assertRaises(MODULE.SourceValidationError) as captured:
            self.build(records)
        return {issue.code for issue in captured.exception.issues}

    def test_valid_row_is_hidden_draft_and_private_values_do_not_leak(self):
        result = self.build([default_row()])
        self.assertEqual(result.summary["variantCount"], 1)
        self.assertEqual(result.summary["plannedPriceRows"], 1)
        candidate = json.loads(result.artifacts["product-control-import-candidate.json"])
        self.assertFalse(candidate["importPolicy"]["databaseApplySupported"])
        self.assertEqual(candidate["variants"][0]["status"], "draft")
        self.assertFalse(candidate["variants"][0]["checkoutEligible"])
        combined = b"\n".join(result.artifacts.values())
        for sentinel in (b"PRIVATE_SUPPLIER_SENTINEL", b"PRIVATE_WHOLESALE_SENTINEL", b"PRIVATE_SOURCE_NOTE_SENTINEL"):
            self.assertNotIn(sentinel, combined)

    def test_duplicate_sku_and_variant_are_rejected(self):
        first = default_row(1)
        second = default_row(2)
        self.assertTrue({"duplicate_sku", "duplicate_variant_id"}.issubset(self.issue_codes([first, second])))

    def test_blank_required_identity_is_rejected(self):
        row = default_row()
        row["Exact Strength"] = ""
        self.assertIn("blank_or_unsafe_value", self.issue_codes([row]))

    def test_conflicting_canonical_product_mapping_is_rejected(self):
        first = default_row(1)
        second = default_row(2)
        second["Canonical Product"] = "Conflicting Name"
        second["Exact Variant ID"] = "R360-FIXTURE-20MG-VIAL"
        second["Exact SKU"] = "R360-FIXTURE-20MG-VIAL"
        self.assertIn("canonical_product_conflict", self.issue_codes([first, second]))

    def test_hash_mismatch_fails_closed(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        path = Path(temporary.name) / "source.xlsx"
        path.write_bytes(workbook_bytes([default_row()]))
        with self.assertRaises(MODULE.SourceValidationError) as captured:
            MODULE.build_from_workbook(path, "0" * 64)
        self.assertEqual(captured.exception.issues[0].code, "source_hash_mismatch")

    def test_zero_price_is_rejected_but_blank_unavailable_price_is_held(self):
        zero = default_row()
        zero["Approved Selling Price"] = "0"
        self.assertIn("invalid_planned_price", self.issue_codes([zero]))

        unavailable = default_row()
        unavailable.update(
            {
                "Approved Selling Price": "",
                "Customer Offer State": "Unavailable",
                "Website Action": "UNAVAILABLE",
                "Public Visibility": "Hidden or unavailable",
            }
        )
        result = self.build([unavailable])
        self.assertEqual(result.summary["priceMissingRows"], 1)
        self.assertEqual(result.summary["truthStateCounts"], {"unavailable": 1})
        self.assertIn(b"planned_price_missing", result.artifacts["peptide-reconciliation.json"])

    def test_apply_is_byte_idempotent(self):
        result = self.build([default_row()])
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        output = Path(temporary.name)
        first = MODULE.apply_artifacts(result, output)
        before = {path.name: path.read_bytes() for path in output.iterdir()}
        second = MODULE.apply_artifacts(result, output)
        after = {path.name: path.read_bytes() for path in output.iterdir()}
        self.assertEqual(sorted(first["changed"]), sorted(MODULE.OUTPUT_FILENAMES))
        self.assertEqual(second["changed"], [])
        self.assertEqual(sorted(second["unchanged"]), sorted(MODULE.OUTPUT_FILENAMES))
        self.assertEqual(before, after)


if __name__ == "__main__":
    unittest.main()
