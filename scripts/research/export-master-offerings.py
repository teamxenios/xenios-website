#!/usr/bin/env python3
"""Export the private Xenios master-offerings workbook into a local JSON intake.

The exporter uses only the Python standard library. It does not install a Node
spreadsheet dependency and it never writes to the repository by default.

Usage:
    python3 scripts/research/export-master-offerings.py workbook.xlsx
    python3 scripts/research/export-master-offerings.py workbook.xlsx --output .local/research/master-offerings/private-intake.json

The output is PRIVATE. It contains supplier, wholesale, pricing, margin, source,
and operating fields from the workbook. Keep it under .local, which Xenios already
gitignores. To write anywhere else, an operator must set
XENIOS_ALLOW_PRIVATE_CATALOG_EXPORT=true explicitly.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import sys
import zipfile
from pathlib import Path, PurePosixPath
from typing import Any, Iterable, NoReturn
from xml.etree import ElementTree as ET

MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
DOC_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
NS = {"m": MAIN_NS, "r": DOC_REL_NS, "p": PKG_REL_NS}

MASTER_SHEET = "01 Full Master Offerings"
EARLY_ACCESS_SHEET = "02 Early Access Now"

MASTER_HEADERS = [
    "Source Group",
    "Category",
    "Brand / Subcategory",
    "ID / SKU",
    "Product / Service",
    "Variant / Format",
    "Family / Tag",
    "Supplier / Owner",
    "Original Wholesale / Cost",
    "Wholesale / Cost Updated",
    "Wholesale Status",
    "Original Xenios Sell Price",
    "Xenios Sell Price Updated",
    "Target Sell @ 2.5x Updated Cost",
    "Recommended Launch Sell Price",
    "Markup Multiple Updated",
    "Gross Profit Updated",
    "Gross Margin Updated",
    "Access / Offer State",
    "Activation Priority",
    "Austin Supplier Benchmark",
    "Activation Requirement",
    "Source / Notes",
    "Product URL",
]

EARLY_ACCESS_HEADERS = [
    "Catalog Section",
    "Product",
    "Strength / Variant",
    "Status",
    "Research Category",
    "Notes",
]

CELL_REF = re.compile(r"^([A-Z]+)([1-9][0-9]*)$")


class ExportRefused(RuntimeError):
    """A fail-closed intake validation or path failure."""


def fail(message: str) -> NoReturn:
    raise ExportRefused(f"Master offerings export refused: {message}")


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def nullable_text(value: Any) -> str | None:
    normalized = text(value)
    return normalized if normalized else None


def nullable_number(value: Any) -> int | float | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return value if isinstance(value, int) or not value.is_integer() else int(value)
    try:
        parsed = float(str(value).replace(",", "").strip())
    except ValueError:
        return None
    return int(parsed) if parsed.is_integer() else parsed


def column_index(cell_reference: str) -> int:
    match = CELL_REF.fullmatch(cell_reference)
    if not match:
        fail(f"invalid cell reference {cell_reference!r}")
    letters = match.group(1)
    value = 0
    for char in letters:
        value = value * 26 + (ord(char) - ord("A") + 1)
    return value - 1


def xml_text(node: ET.Element | None) -> str:
    if node is None:
        return ""
    return "".join(node.itertext())


def parse_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    name = "xl/sharedStrings.xml"
    if name not in archive.namelist():
        return []
    root = ET.fromstring(archive.read(name))
    return ["".join(item.itertext()) for item in root.findall("m:si", NS)]


def resolve_sheet_paths(archive: zipfile.ZipFile) -> dict[str, str]:
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    by_id = {
        rel.attrib["Id"]: rel.attrib["Target"]
        for rel in relationships.findall("p:Relationship", NS)
        if "Id" in rel.attrib and "Target" in rel.attrib
    }
    paths: dict[str, str] = {}
    for sheet in workbook.findall("m:sheets/m:sheet", NS):
        sheet_name = sheet.attrib.get("name", "")
        rel_id = sheet.attrib.get(f"{{{DOC_REL_NS}}}id", "")
        target = by_id.get(rel_id)
        if not sheet_name or not target:
            continue
        target_path = PurePosixPath(target)
        if target_path.is_absolute():
            normalized = str(target_path).lstrip("/")
        else:
            normalized = str(PurePosixPath("xl") / target_path)
        paths[sheet_name] = str(PurePosixPath(normalized))
    return paths


def parse_cell(cell: ET.Element, shared_strings: list[str]) -> Any:
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        inline = cell.find("m:is", NS)
        return xml_text(inline)

    value_node = cell.find("m:v", NS)
    raw = "" if value_node is None else (value_node.text or "")
    if cell_type == "s":
        try:
            index = int(raw)
            return shared_strings[index]
        except (ValueError, IndexError):
            fail(f"invalid shared-string index {raw!r}")
    if cell_type in {"str", "e"}:
        return raw
    if cell_type == "b":
        return raw == "1"
    if raw == "":
        return None
    try:
        parsed = float(raw)
        return int(parsed) if parsed.is_integer() else parsed
    except ValueError:
        return raw


def parse_sheet(
    archive: zipfile.ZipFile,
    sheet_path: str,
    shared_strings: list[str],
) -> list[tuple[int, list[Any]]]:
    if sheet_path not in archive.namelist():
        fail(f"worksheet part {sheet_path!r} is missing")
    root = ET.fromstring(archive.read(sheet_path))
    result: list[tuple[int, list[Any]]] = []
    for row in root.findall("m:sheetData/m:row", NS):
        row_number = int(row.attrib.get("r", "0") or 0)
        values: dict[int, Any] = {}
        for cell in row.findall("m:c", NS):
            reference = cell.attrib.get("r", "")
            values[column_index(reference)] = parse_cell(cell, shared_strings)
        width = max(values.keys(), default=-1) + 1
        result.append((row_number, [values.get(index) for index in range(width)]))
    return result


def padded(row: list[Any], width: int) -> list[Any]:
    if len(row) >= width:
        return row
    return [*row, *([None] * (width - len(row)))]


def find_header_row(
    rows: Iterable[tuple[int, list[Any]]],
    headers: list[str],
) -> int:
    for row_number, values in rows:
        values = padded(values, len(headers))
        if all(text(values[index]) == header for index, header in enumerate(headers)):
            return row_number
    fail(f"could not find required header row: {' | '.join(headers)}")


def master_rows(rows: list[tuple[int, list[Any]]]) -> list[dict[str, Any]]:
    header_row = find_header_row(rows, MASTER_HEADERS)
    output: list[dict[str, Any]] = []
    for row_number, raw in rows:
        if row_number <= header_row:
            continue
        values = padded(raw, len(MASTER_HEADERS))
        if all(value is None or text(value) == "" for value in values):
            continue
        source_group = text(values[0])
        category = text(values[1])
        product_name = text(values[4])
        if not source_group and not category and not product_name:
            continue
        output.append(
            {
                "sheetRow": row_number,
                "sourceGroup": source_group,
                "category": category,
                "brandOrSubcategory": text(values[2]),
                "sourceSku": text(values[3]),
                "productName": product_name,
                "variantOrFormat": nullable_text(values[5]),
                "familyOrTag": text(values[6]),
                "supplierOrOwner": text(values[7]),
                "originalWholesaleCost": nullable_number(values[8]),
                "updatedWholesaleCost": nullable_number(values[9]),
                "wholesaleStatus": text(values[10]),
                "originalSellPrice": nullable_number(values[11]),
                "updatedSellPrice": nullable_number(values[12]),
                "targetSellAtUpdatedCost": nullable_number(values[13]),
                "recommendedLaunchSellPrice": nullable_number(values[14]),
                "updatedMarkupMultiple": nullable_number(values[15]),
                "updatedGrossProfit": nullable_number(values[16]),
                "updatedGrossMargin": nullable_number(values[17]),
                "sourceAccessState": nullable_text(values[18]),
                "activationPriority": text(values[19]),
                "austinSupplierBenchmark": text(values[20]).lower() == "yes",
                "activationRequirement": text(values[21]),
                "sourceNotes": text(values[22]),
                "productUrl": nullable_text(values[23]),
            }
        )
    return output


def early_access_rows(rows: list[tuple[int, list[Any]]]) -> list[dict[str, Any]]:
    header_row = find_header_row(rows, EARLY_ACCESS_HEADERS)
    output: list[dict[str, Any]] = []
    for row_number, raw in rows:
        if row_number <= header_row:
            continue
        values = padded(raw, len(EARLY_ACCESS_HEADERS))
        if all(value is None or text(value) == "" for value in values):
            continue
        status = text(values[3])
        if status not in {"Available", "Held"}:
            fail(f"unsupported Early Access status {status!r} on sheet row {row_number}")
        output.append(
            {
                "sheetRow": row_number,
                "catalogSection": text(values[0]),
                "productName": text(values[1]),
                "variantOrFormat": text(values[2]),
                "status": status,
                "researchCategory": text(values[4]),
                "notes": text(values[5]),
            }
        )
    return output


def safe_output_path(raw: str | None) -> Path:
    output = Path(raw or ".local/research/master-offerings/private-intake.json").resolve()
    cwd = Path.cwd().resolve()
    try:
        relative = output.relative_to(cwd)
        local = len(relative.parts) > 0 and relative.parts[0] == ".local"
    except ValueError:
        local = False
    if not local and os.environ.get("XENIOS_ALLOW_PRIVATE_CATALOG_EXPORT") != "true":
        fail(
            "private output must stay under .local unless "
            "XENIOS_ALLOW_PRIVATE_CATALOG_EXPORT=true is set explicitly"
        )
    return output


def build_intake(workbook_path: Path) -> dict[str, Any]:
    workbook_bytes = workbook_path.read_bytes()
    with zipfile.ZipFile(workbook_path) as archive:
        sheet_paths = resolve_sheet_paths(archive)
        for required in (MASTER_SHEET, EARLY_ACCESS_SHEET):
            if required not in sheet_paths:
                fail(f"required sheet {required!r} is missing")
        shared_strings = parse_shared_strings(archive)
        master = master_rows(
            parse_sheet(archive, sheet_paths[MASTER_SHEET], shared_strings)
        )
        early = early_access_rows(
            parse_sheet(archive, sheet_paths[EARLY_ACCESS_SHEET], shared_strings)
        )
    return {
        "schemaVersion": 1,
        "generatedAt": utc_now(),
        "sourceWorkbook": {
            "filename": workbook_path.name,
            "sha256": hashlib.sha256(workbook_bytes).hexdigest(),
            "masterSheet": MASTER_SHEET,
            "earlyAccessSheet": EARLY_ACCESS_SHEET,
        },
        "masterRows": master,
        "earlyAccessRows": early,
        "privateIntake": True,
        "productionMutated": False,
        "databaseMutated": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook", help="Path to the Xenios .xlsx workbook")
    parser.add_argument("--output", help="Private JSON output path under .local")
    arguments = parser.parse_args()

    workbook_path = Path(arguments.workbook).resolve()
    if not workbook_path.is_file():
        fail(f"workbook not found at {workbook_path}")
    output_path = safe_output_path(arguments.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    intake = build_intake(workbook_path)
    output_path.write_text(json.dumps(intake, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "ok": True,
                "sourceRows": len(intake["masterRows"]),
                "earlyAccessRows": len(intake["earlyAccessRows"]),
                "sourceWorkbookSha256": intake["sourceWorkbook"]["sha256"],
                "output": str(output_path),
                "private": True,
            }
        )
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ExportRefused as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
