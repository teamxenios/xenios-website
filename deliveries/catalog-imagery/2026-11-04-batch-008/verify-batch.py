from __future__ import annotations

import argparse
from hashlib import sha256
from pathlib import Path
import json
import re
import xml.etree.ElementTree as ET

from PIL import Image, ImageDraw, ImageFont
from pypdf import PdfReader

BATCH = Path(__file__).resolve().parent
REPO = BATCH.parents[2]
BASELINE = "5926c2faf1e3ed2a7dbc82822fd6c3a8c93b694b"
CATALOG = "server/research/master-offerings/data/member-safe-master-offerings.generated.json"
BINDINGS = "server/research/master-offerings/data/master-offering-bindings.generated.json"
STYLE_REFERENCE = (
    "deliveries/catalog-imagery/2026-11-04-batch-004/assets/"
    "bpc-157-10mg-website-render-v3.png"
)
CAPTION = "Packaging design shown. Current packaging may differ."
PROOF = "output/pdf/xenios-bpc-157-5mg-15mg-supplier-design-proofs-v1.pdf"
EXCEPTIONS = "output/pdf/xenios-bpc-157-5mg-15mg-print-spec-exceptions-v1.pdf"
CONTENT_HANDOFF_HASH = "0908c74d44619fe13f359876b5083170d9ca5da47bb0dd734339d8cd495be685"
WORKBOOK_HASH = "1be4f6720675fc6b90c172d52c19d2fb9a8d53f5beab6592ca96c701119c791d"
VARIANTS = (
    (5, "mo_e4de11c77d16c4c3b83d", "mov_09db3e866424b64994d3", "GEN-GRP-0264",
     "MASTER CATALOG row 271 / GRP-0264, Raw Peptides flyer row 2", "exec-f660bca4-3413-40b8-ab79-cbfe4a37113b"),
    (15, "mo_9a755fa72de0409cd937", "mov_257330ea83ecbfc45fae", "GEN-GRP-0263",
     "MASTER CATALOG row 270 / GRP-0263, Unity source Sheet1 row 40", "exec-0dd509d8-9e2a-4827-80b5-3c87d9b26300"),
)
PROMPT = "Use case: product-mockup. Asset: variant-specific Xenios Quick Order website packaging design render. Input image 1: accepted Xenios BPC-157 family studio render to match closely, as a separate {amount} mg variant. Change the amount line to exactly \"{amount} mg\" in bold purple. Keep the family layout, clear glass vial proportions, brushed silver closure and centered metallic purple-to-blue strip, matte pearl label with thin gradient rule, near-white backdrop, straight-on angle, restrained reflection and soft ground shadow. Square image. Entire cap, label and glass base visible with the same generous margins as the reference. Exact label lines in order: \"XENIOS\", \"BPC-157\", \"{amount} mg\", \"LYOPHILIZED VIAL\", \"RESEARCH USE ONLY\", \"NONCLINICAL USE ONLY\". Distinguishing amount crisp at card size. Preserve the dark navy classification box and clean typography. No other copy or numbers anywhere, no visible fill, powder or liquid, no props, medical imagery, lot or expiry data, QR code or certification."


def require(condition, message):
    if not condition:
        raise ValueError(message)


def pinned_json(relative, expected_sha):
    raw = (REPO / relative).read_bytes().replace(b"\r\n", b"\n")
    require(sha256(raw).hexdigest() == expected_sha, f"Baseline hash changed: {relative}")
    return json.loads(raw), {"path": relative, "sha256": expected_sha, "bytes": len(raw)}


def artifact(relative, role, dimensions=None, pages=None):
    path = BATCH / relative
    raw = path.read_bytes()
    info = {
        "role": role, "relativeAssetPath": path.relative_to(REPO).as_posix(),
        "format": path.suffix[1:], "bytes": len(raw), "sha256": sha256(raw).hexdigest(),
    }
    if dimensions:
        if path.suffix == ".svg":
            root = ET.fromstring(raw)
            actual = (int(root.attrib["width"]), int(root.attrib["height"]))
        else:
            with Image.open(path) as img:
                require(img.format.lower() == path.suffix[1:], f"Format mismatch: {path.name}")
                img.load()
                actual = img.size
        require(actual == dimensions, f"Dimension mismatch: {path.name}: {actual}")
        info.update(width=actual[0], height=actual[1])
    if pages:
        reader = PdfReader(path)
        require(len(reader.pages) == pages, f"Unexpected page count: {path.name}")
        info["pages"] = pages
    return info


def variant_assets(mg):
    stem = f"bpc-157-{mg}mg"
    return {
        "website_primary": (f"assets/{stem}-website-render-v1-1024.webp", (1024, 1024)),
        "website_source_master": (f"assets/{stem}-website-render-v1.png", (1254, 1254)),
        "front_editable_master": (f"labels/{stem}-front-artwork-v1.svg", (1600, 1000)),
        "front_preview": (f"assets/{stem}-front-artwork-v1.png", (1600, 1000)),
        "front_preview_web": (f"assets/{stem}-front-artwork-v1.webp", (1600, 1000)),
        "wrap_editable_master": (f"labels/{stem}-wrap-proof-v1.svg", (2400, 1200)),
        "wrap_preview": (f"assets/{stem}-wrap-proof-v1.png", (2400, 1200)),
    }


def verify_labels(spec, mg, sku):
    for role in ("front_editable_master", "wrap_editable_master"):
        relative, _ = spec[role]
        root = ET.parse(BATCH / relative).getroot()
        words = " ".join(root.itertext()).upper()
        for required in ("XENIOS", "BPC-157", f"{mg} MG", "PER VIAL", "LYOPHILIZED VIAL",
                         "RESEARCH USE ONLY", "NONCLINICAL USE ONLY"):
            require(required in words, f"{relative}: missing {required}")
        strengths = set(re.findall(r"\b\d+\s*MG\b", words))
        require(strengths == {f"{mg} MG"}, f"{relative}: unexpected amounts {strengths}")
        require(not re.search(r"\b(?:LOT|EXP(?:IRY)?|BUD)\s*:\s*[^[]", words),
                f"{relative}: issued traceability value")
        require(not re.search(r"\b(?:DEMO-LOT|SAMPLE-ONLY|CERTIFIED|\d+\s*MG/ML|\d+(?:\.\d+)?%)\b", words),
                f"{relative}: unsupported claim or demo data")
        if role == "wrap_editable_master":
            require(sku in words and "NOT PRESS READY" in words, f"{relative}: proof scope or SKU missing")
        else:
            require("GEN-GRP-" not in words, f"{relative}: internal SKU entered customer art")


def contact_sheet():
    canvas = Image.new("RGB", (1800, 1210), "#eeecf5")
    draw = ImageDraw.Draw(canvas)

    def font(size, bold=False):
        names = ("arialbd.ttf", "DejaVuSans-Bold.ttf") if bold else ("arial.ttf", "DejaVuSans.ttf")
        for name in names:
            try:
                return ImageFont.truetype(name, size)
            except OSError:
                continue
        raise OSError("Contact sheet requires Arial or DejaVu Sans")

    def put(text, x, y, size=21, fill="#241c38", bold=False):
        draw.text((x, y), text, font=font(size, bold), fill=fill)

    def place(relative, x, y, w, h):
        with Image.open(BATCH / relative) as img:
            preview = img.convert("RGB")
            preview.thumbnail((w, h), Image.Resampling.LANCZOS)
            canvas.paste(preview, (x + (w - preview.width) // 2, y + (h - preview.height) // 2))

    put("Xenios BPC-157  |  5 mg and 15 mg", 50, 30, 43, bold=True)
    put("Batch 008  /  Packaging design review  /  Nominal content per vial", 52, 91, 25, "#634298")
    for index, (mg, offering, variant, sku, _, _) in enumerate(VARIANTS):
        x = 50 + 860 * index
        spec = variant_assets(mg)
        draw.rounded_rectangle((x, 146, x + 840, 1148), radius=25, fill="#fff")
        put(f"BPC-157  /  {mg} mg per vial", x + 30, 171, 32, bold=True)
        put(offering + "  /  " + variant, x + 30, 219, 21)
        put(f"{sku}  /  Lyophilized vial", x + 30, 254, 20, "#634298")
        put("WEBSITE RENDER", x + 30, 313, 19, "#634298", True)
        put("FRONT LABEL", x + 435, 313, 19, "#634298", True)
        place(spec["website_primary"][0], x + 30, 350, 365, 365)
        place(spec["front_preview"][0], x + 425, 350, 385, 365)
        put("WRAP PROOF  /  DIELINE PENDING", x + 30, 738, 19, "#634298", True)
        place(spec["wrap_preview"][0], x + 30, 777, 780, 340)
    put("Packaging design shown. Current packaging may differ.", 50, 1170, 20, "#634298")
    canvas.save(BATCH / "contact-sheet-v1.png")


def outputs():
    dataset, catalog_pin = pinned_json(CATALOG, "76b9bf6ffe908450d31e15900ee9aa1a5467068fd3dfecb2d28624a49c97c4d5")
    bindings, binding_pin = pinned_json(BINDINGS, "587595e68cb1b47a8ee7f55728eb65d64c2f55f36ad242080232743a9c53ae24")
    pairs = {(p["id"], v["id"]): (p, v) for p in dataset["products"] for v in p["variants"]}
    skus = {(b["offeringId"], b["offeringVariantId"]): b["productControlSku"] for b in bindings["bindings"]}
    require(len(pairs) == 420, "Canonical denominator changed")
    style_hash = sha256((REPO / STYLE_REFERENCE).read_bytes()).hexdigest()
    require(style_hash == "674868e8914407fb65c3495bff77b92a9335b9a6dc900264a8b5d84c27d9017b",
            "Accepted visual reference changed")

    records = []
    evidence = []
    artifacts = []
    for mg, offering, variant, sku, row, generation in VARIANTS:
        product, selected = pairs[(offering, variant)]
        require(product["canonicalName"] == "BPC-157" and selected["label"] == f"BPC-157 {mg} mg"
                and product["subcategory"] == "Lyophilized Vial"
                and product["family"] == "research_peptides_materials"
                and selected["displayState"] == "request_access"
                and skus[(offering, variant)] == sku, f"Exact identity mismatch: {mg} mg")
        spec = variant_assets(mg)
        verify_labels(spec, mg, sku)
        files = {role: artifact(name, role, dimensions) for role, (name, dimensions) in spec.items()}
        artifacts.extend(files.values())
        website_candidates = [
            {"role": "primary", "altText": f"Xenios BPC-157 {mg} mg lyophilized vial packaging design",
             "caption": CAPTION, **{k: files["website_primary"][k] for k in ("relativeAssetPath", "sha256")}},
            {"role": "label_detail", "altText": f"Xenios BPC-157 {mg} mg per vial front label design for research use",
             "caption": CAPTION, **{k: files["front_preview_web"][k] for k in ("relativeAssetPath", "sha256")}},
        ]
        identity = {"offeringId": offering, "sourceVariantId": variant, "quickOrderSku": sku}
        records.append({
            **identity, "canonicalVariant": f"BPC-157 {mg} mg", "nominalAmountPerVialMg": mg,
            "form": "Lyophilized vial", "classification": "For laboratory research use only.",
            "artworkVersion": f"BPC157-{mg}-WEB-SUPPLIER-v1", "mediaKind": "original_xenios_website_render",
            "websiteArtworkState": "pending_independent_file_level_review",
            "physicalPackagingState": "design", "runtimeLinked": False, "publicationAuthorized": False,
            "websiteReviewCandidates": website_candidates, "artifacts": files,
        })
        evidence.append({
            **identity, "workbook": "XENIOS_MASTER_CATALOG_ONLY_2026-08-13.xlsx", "workbookRow": row,
            "workbookSha256": WORKBOOK_HASH, "imageGenerationReceipt": generation,
            "imageGenerationMode": "built-in imagegen, separate reference-based edit for each variant",
            "imageGenerationPrompt": PROMPT.format(amount=mg),
            "visualInspection": "Full closure, label and base. Variant amount, form and research classification read on render.",
            "openSourceFacts": ["selected chemical form", "excipients", "approved storage",
                                "customer selling unit", "legal manufacturer or distributor attribution"],
            **({"historicalProcurementNote": "Box of ten is historical procurement only. Customer selling unit is open."}
               if mg == 5 else {}),
        })

    for relative, role, pages in [(PROOF, "supplier_design_proof", 4), (EXCEPTIONS, "print_spec_exceptions", 1)]:
        artifacts.append(artifact(relative, role, pages=pages))
    artifacts.append(artifact("contact-sheet-v1.png", "contact_sheet", (1800, 1210)))
    require(len({item["sha256"] for item in artifacts}) == len(artifacts), "Duplicate artifact bytes")

    proof_pages = PdfReader(BATCH / PROOF).pages
    for index, (mg, offering, variant, sku, _, _) in enumerate(VARIANTS):
        cover = proof_pages[index * 2].extract_text()
        for expected in (offering, variant, sku, f"{mg} mg"):
            require(expected in cover, f"Proof identity missing from page {index * 2 + 1}: {expected}")

    manifest = {
        "schemaVersion": 1, "batchId": "catalog-imagery-2026-11-04-batch-008",
        "releaseBaseline": BASELINE, "catalogDataset": catalog_pin, "bindingDataset": binding_pin,
        "authority": ["KAN-59/10615", "KAN-225/10616"],
        "publicationState": "review_only_not_runtime", "supplierSendPerformed": False,
        "requiredMountedViewportsAfterReview": [320, 390, 768, 1280],
        "supplierDocuments": [item for item in artifacts if item["format"] == "pdf"],
        "contactSheet": artifacts[-1], "records": records,
    }
    provenance = {
        "schemaVersion": 1, "batchId": manifest["batchId"], "releaseBaseline": BASELINE,
        "contentHandoff": {"reference": "KAN-6/10624", "file": "SOURCE-FOLLOWUP-session-3-20261104.internal.json",
                           "sha256": CONTENT_HANDOFF_HASH, "scope": "static artwork facts only"},
        "acceptedVisualReference": {"reference": "KAN-31/10627", "path": STYLE_REFERENCE,
                                    "sha256": style_hash, "reviewedSourceSha": "f72de21651e4bc921c148e7290de79f1a4ea2ea4"},
        "supplierGaps": ["selected vial and closure specification", "approved dieline, seam, bleed and safe area",
                         "substrate, adhesive, finish, printing process, ink/color profile and winding",
                         "storage, attribution, lot and expiry/BUD supplied by manufacturer",
                         "chemical form, excipients, and any matching documentation and QR destination"],
        "records": evidence,
    }
    receipt = {
        "ok": True, "batchId": manifest["batchId"], "releaseBaseline": BASELINE,
        "canonicalPairs": len(pairs), "exactArtworkPairs": len(records),
        "checkedArtifacts": len(artifacts), "checkedPdfPages": 5, "contactSheetChecked": True,
        "independentlyAcceptedWebsiteAssets": 0, "supplierApprovedProofs": 0, "supplierSendPerformed": False,
        "runtimeLinkedAssets": 0, "publicationAuthorizedAssets": 0, "errors": [],
    }
    return {"media-batch.v1.json": manifest, "internal-evidence.v1.json": provenance,
            "verification-result.v1.json": receipt}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true", help="Build review sheet and write manifest/evidence/receipt")
    parser.add_argument("--content-handoff", type=Path, help="Also verify the original KAN-6 evidence file")
    args = parser.parse_args()
    if args.content_handoff:
        raw = args.content_handoff.read_bytes()
        require(sha256(raw).hexdigest() == CONTENT_HANDOFF_HASH, "Content handoff SHA-256 changed")
        handoff = json.loads(raw)
        require(handoff["releaseSha"] == BASELINE, "Content handoff baseline differs")
        for mg, offering, variant, sku, row, _ in VARIANTS:
            record = next(r for r in handoff["records"]
                          if (r["offeringId"], r["sourceVariantId"]) == (offering, variant))
            require(record["status"] == "static_artwork_facts_only", "Content scope differs")
            require(record["verifiedStaticText"] == {
                "brand": "Xenios", "productName": "BPC-157", "amount": f"{mg} mg per vial",
                "form": "Lyophilized vial", "classification": "For laboratory research use only.",
                "productCode": sku,
            }, "Content handoff artwork facts differ")
            require(any(source.get("section") == row and source.get("version") == f"sha256:{WORKBOOK_HASH}"
                        for source in record["sources"]), "Workbook source lineage differs")
    if args.write:
        contact_sheet()
    for name, data in outputs().items():
        payload = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
        path = BATCH / name
        if args.write:
            path.write_text(payload, encoding="utf-8", newline="\n")
        else:
            require(path.read_text(encoding="utf-8") == payload, f"Receipt or evidence differs: {name}")
    print((BATCH / "verification-result.v1.json").read_text(encoding="utf-8"), end="")


if __name__ == "__main__":
    main()
