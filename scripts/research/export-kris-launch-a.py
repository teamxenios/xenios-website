"""Export the two Kris Launch A workbooks into one private intake file.

Standard library only, the same ZIP plus XML approach the master offerings
exporter uses, so no new Node or Python dependency is introduced.

The output is PRIVATE. It carries supplier identity, buy cost, margin and
internal sourcing notes straight from the master catalog, because the builder
that reads it needs to see those fields in order to prove it dropped them. It
is written under .local, which is gitignored, and it must never be committed.

Usage:
  python scripts/research/export-kris-launch-a.py \
      "/path/XENIOS_MASTER_CATALOG_ONLY_2026-08-13.xlsx" \
      "/path/XENIOS_KRIS_VOLUME_PRICING_2026-08-13.xlsx"
"""

import hashlib
import json
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL_NS = "{http://schemas.openxmlformats.org/package/2006/relationships}"
DOC_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"

DEFAULT_OUTPUT = os.path.join(
    ".local", "research", "kris-launch-a", "private-intake.json"
)

# The header cell that identifies the real header row in each workbook. Both
# files open with a title block, so the header is not row one and assuming it
# is would silently shift every column.
MASTER_HEADER_ANCHOR = "Group ID"
KRIS_HEADER_ANCHOR = "Kris Volume Price"


def sha256_of(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _shared_strings(archive):
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    return [
        "".join(node.text or "" for node in si.iter(f"{NS}t"))
        for si in root.findall(f"{NS}si")
    ]


def _first_sheet_path(archive):
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    targets = {
        rel.get("Id"): rel.get("Target")
        for rel in rels.findall(f"{REL_NS}Relationship")
    }
    sheet = workbook.find(f"{NS}sheets").find(f"{NS}sheet")
    target = targets.get(sheet.get(f"{DOC_NS}id"), "")
    if target.startswith("/xl/"):
        target = target[1:]
    elif not target.startswith("xl/"):
        target = "xl/" + target
    return sheet.get("name"), target


def _column_index(reference):
    letters = re.match(r"[A-Z]+", reference or "A").group(0)
    index = 0
    for letter in letters:
        index = index * 26 + (ord(letter) - 64)
    return index - 1


def _rows(archive, path, strings):
    root = ET.fromstring(archive.read(path))
    data = root.find(f"{NS}sheetData")
    if data is None:
        return []
    output = []
    for row in data.findall(f"{NS}row"):
        cells = {}
        for cell in row.findall(f"{NS}c"):
            value_node = cell.find(f"{NS}v")
            inline_node = cell.find(f"{NS}is")
            if cell.get("t") == "s" and value_node is not None:
                value = strings[int(value_node.text)]
            elif inline_node is not None:
                value = "".join(t.text or "" for t in inline_node.iter(f"{NS}t"))
            elif value_node is not None:
                value = value_node.text
            else:
                value = ""
            cells[_column_index(cell.get("r"))] = (value or "").strip()
        if cells:
            output.append([cells.get(i, "") for i in range(max(cells) + 1)])
    return output


def read_sheet(path, header_anchor):
    with zipfile.ZipFile(path) as archive:
        strings = _shared_strings(archive)
        sheet_name, sheet_path = _first_sheet_path(archive)
        raw = _rows(archive, sheet_path, strings)

    header_index = None
    for index, row in enumerate(raw):
        if header_anchor in [cell.strip() for cell in row]:
            header_index = index
            break
    if header_index is None:
        raise SystemExit(
            f"header row containing {header_anchor!r} not found in {path}"
        )

    header = [cell.strip() for cell in raw[header_index]]
    records = []
    for offset, row in enumerate(raw[header_index + 1 :]):
        if not any(cell.strip() for cell in row):
            continue
        record = {"sheetRow": header_index + 2 + offset}
        for column, name in enumerate(header):
            if not name:
                continue
            record[name] = row[column].strip() if column < len(row) else ""
        records.append(record)
    return sheet_name, header, records


def main(argv):
    # MASTER-ONLY MODE. build-master-offerings-from-catalog.ts reads ONLY
    # masterRows and, in its own words, "never the Kris pricing rows". So the
    # canonical catalog can be regenerated from the MASTER CATALOG workbook
    # alone, and demanding a Kris pricing workbook that nothing downstream
    # reads blocks a catalog rebuild for no reason. The Kris launch artifacts
    # still require both, which is why the second workbook stays mandatory
    # unless this flag is passed explicitly.
    argv = [a for a in argv]
    master_only = "--master-only" in argv
    if master_only:
        argv.remove("--master-only")
    if len(argv) < (2 if master_only else 3):
        raise SystemExit(
            "usage: export-kris-launch-a.py <master.xlsx> <kris-pricing.xlsx> [output.json]\n"
            "       export-kris-launch-a.py <master.xlsx> --master-only [output.json]"
        )
    master_path = argv[1]
    kris_path = None if master_only else argv[2]
    output = argv[2 if master_only else 3] if len(argv) > (2 if master_only else 3) else DEFAULT_OUTPUT

    resolved = os.path.abspath(output)
    if ".local" not in resolved.replace("\\", "/").split("/"):
        if os.environ.get("XENIOS_ALLOW_PRIVATE_CATALOG_EXPORT") != "true":
            raise SystemExit(
                "refusing to write private intake outside .local; set "
                "XENIOS_ALLOW_PRIVATE_CATALOG_EXPORT=true only if you mean it"
            )

    master_sheet, master_header, master_rows = read_sheet(
        master_path, MASTER_HEADER_ANCHOR
    )
    if kris_path is None:
        kris_sheet, kris_header, kris_rows = None, [], []
    else:
        kris_sheet, kris_header, kris_rows = read_sheet(kris_path, KRIS_HEADER_ANCHOR)

    payload = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "privateIntake": True,
        "productionMutated": False,
        "databaseMutated": False,
        "sources": {
            "masterCatalog": {
                "filename": os.path.basename(master_path),
                "sha256": sha256_of(master_path),
                "sheet": master_sheet,
                "columns": master_header,
            },
            "krisPricing": None
            if kris_path is None
            else {
                "filename": os.path.basename(kris_path),
                "sha256": sha256_of(kris_path),
                "sheet": kris_sheet,
                "columns": kris_header,
            },
        },
        "masterRows": master_rows,
        "krisRows": kris_rows,
    }

    os.makedirs(os.path.dirname(resolved), exist_ok=True)
    with open(resolved, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)

    print(
        json.dumps(
            {
                "ok": True,
                "masterRows": len(master_rows),
                "krisRows": len(kris_rows),
                "masterSha256": payload["sources"]["masterCatalog"]["sha256"],
                "krisSha256": (payload["sources"]["krisPricing"] or {}).get("sha256"),
                "output": resolved,
                "private": True,
            }
        )
    )


if __name__ == "__main__":
    main(sys.argv)
