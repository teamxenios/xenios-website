"""Build or verify the isolated Dihexa artwork handoff."""

import argparse
from hashlib import sha256
import json
from pathlib import Path
import re
import subprocess
import xml.etree.ElementTree as ET

from PIL import Image, ImageDraw, ImageFont

BATCH = Path(__file__).resolve().parent
ROOT = BATCH.parents[2]
RELATIVE_BATCH = BATCH.relative_to(ROOT).as_posix()
RELEASE = "19d10e0495aed917b3d1fcf2844109e5e1cc6915"
OFFERING = "mo_8a3829642d06ad3ca7c4"
VARIANT = "mov_3f59629a005b238f4faa"
SKU = "GEN-GRP-0280"
CAPTION = "Packaging design shown. Current packaging may differ."
CATALOG = "server/research/master-offerings/data/member-safe-master-offerings.generated.json"
BINDINGS = "server/research/master-offerings/data/master-offering-bindings.generated.json"
PINNED = {
    CATALOG: "76b9bf6ffe908450d31e15900ee9aa1a5467068fd3dfecb2d28624a49c97c4d5",
    BINDINGS: "587595e68cb1b47a8ee7f55728eb65d64c2f55f36ad242080232743a9c53ae24",
}
FILES = {
    "website_primary": ("assets/dihexa-10mg-website-render-v1-1024.webp", (1024, 1024)),
    "website_source_master": ("assets/dihexa-10mg-website-render-v1.png", (1254, 1254)),
    "front_editable_master": ("labels/dihexa-10mg-front-artwork-v1.svg", (1600, 1000)),
    "front_preview": ("assets/dihexa-10mg-front-artwork-v1.png", (1600, 1000)),
    "front_preview_web": ("assets/dihexa-10mg-front-artwork-v1.webp", (1600, 1000)),
    "wrap_editable_master": ("labels/dihexa-10mg-wrap-proof-v1.svg", (2400, 1200)),
    "wrap_preview": ("assets/dihexa-10mg-wrap-proof-v1.png", (2400, 1200)),
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def release_data(path):
    raw = subprocess.check_output(["git", "show", f"{RELEASE}:{path}"], cwd=ROOT)
    digest = sha256(raw).hexdigest()
    require(digest == PINNED[path], f"Unexpected release data bytes: {path}")
    return json.loads(raw), {"path": path, "bytes": len(raw), "sha256": digest}


def artifact(role, path, dims):
    file = BATCH / path
    raw = file.read_bytes()
    fmt = file.suffix[1:]
    if fmt == "svg":
        label = ET.fromstring(raw)
        actual = (int(label.attrib["width"]), int(label.attrib["height"]))
        words = [node.text or "" for node in label.iter("{http://www.w3.org/2000/svg}text")]
        for term in ("XENIOS", "Dihexa", "10 mg", "10 mg per vial",
                     "LYOPHILIZED VIAL", "RESEARCH USE ONLY", "NONCLINICAL USE ONLY"):
            require(term in words, f"Missing {term}: {path}")
        require(all(not re.search(r"BPC-157|mg/ml|lot\s*:|exp\s*:|purity|assay|batch tested|cold chain|sample-only",
                                  word, re.I) for word in words), f"Unverified text: {path}")
        if role == "wrap_editable_master":
            require(words.count("PRODUCT CODE") == 1 and "QUICK ORDER SKU" not in words,
                    "Wrap must use the exact PRODUCT CODE heading")
            require(SKU in words and "SUPPLIER PROOF - NOT PRESS READY" in words, "Wrap code or proof label missing")
        else:
            require(not any("GEN-GRP-" in word for word in words), "Catalog code entered front artwork")
    else:
        with Image.open(file) as image:
            image.load()
            require(image.format.lower() == fmt, f"Wrong encoded format: {path}")
            actual = image.size
    require(actual == dims, f"Wrong dimensions: {path}")
    return {"role": role, "relativeAssetPath": f"{RELATIVE_BATCH}/{path}", "format": fmt,
            "width": dims[0], "height": dims[1], "bytes": len(raw), "sha256": sha256(raw).hexdigest()}


def contact_sheet():
    image = Image.new("RGB", (1600, 1460), "#eeecf5")
    draw = ImageDraw.Draw(image)
    fonts = {size: ImageFont.truetype("arial.ttf", size) for size in (23, 26, 42)}
    draw.text((40, 32), "Xenios Dihexa 10 mg per vial", fill="#1f1533", font=fonts[42])
    draw.text((42, 88), f"{OFFERING} / {VARIANT} / {SKU}", fill="#604297", font=fonts[23])
    draw.text((42, 145), "Website design", fill="#604297", font=fonts[26])
    draw.text((660, 145), "Front label detail", fill="#604297", font=fonts[26])
    draw.text((42, 670), "Supplier wrap proof / Dieline pending", fill="#604297", font=fonts[26])
    draw.text((42, 1420), CAPTION, fill="#604297", font=fonts[23])
    for role, xy, dims in (
        ("website_primary", (42, 190), (445, 445)),
        ("front_preview_web", (660, 190), (865, 450)),
        ("wrap_preview", (42, 713), (1516, 680)),
    ):
        with Image.open(BATCH / FILES[role][0]) as source:
            preview = source.convert("RGB")
            preview.thumbnail(dims, Image.Resampling.LANCZOS)
            image.paste(preview, xy)
    image.save(BATCH / "contact-sheet-v1.png")


def assemble():
    catalog, catalog_pin = release_data(CATALOG)
    bindings, bindings_pin = release_data(BINDINGS)
    product = next(item for item in catalog["products"] if item["id"] == OFFERING)
    variant = next(item for item in product["variants"] if item["id"] == VARIANT)
    binding = next(row for row in bindings["bindings"]
                   if (row["offeringId"], row["offeringVariantId"]) == (OFFERING, VARIANT))
    require((product["canonicalName"], product["family"], product["subcategory"],
             variant["label"], variant["displayState"], binding["productControlSku"])
            == ("Dihexa", "research_peptides_materials", "Lyophilized Vial",
                "DIHEXA 10 mg", "request_access", SKU), "Wrong exact vial catalog identity")
    artifacts = {role: artifact(role, *data) for role, data in FILES.items()}
    sheet = artifact("contact_sheet", "contact-sheet-v1.png", (1600, 1460))
    require(len({item["sha256"] for item in [sheet, *artifacts.values()]}) == 8, "Duplicate artifact bytes")

    candidates = []
    for role, file_role, alt in (
        ("primary", "website_primary", "Xenios Dihexa 10 mg lyophilized vial packaging design"),
        ("label_detail", "front_preview_web", "Xenios Dihexa 10 mg per vial front label design for research use"),
    ):
        media = artifacts[file_role]
        candidates.append({"role": role, "relativeAssetPath": media["relativeAssetPath"],
                           "sha256": media["sha256"], "altText": alt, "caption": CAPTION})

    record = {
        "offeringId": OFFERING, "sourceVariantId": VARIANT, "quickOrderSku": SKU,
        "quickOrderProductId": binding["productId"], "quickOrderVariantId": binding["variantId"],
        "canonicalName": "Dihexa", "canonicalVariant": "Dihexa 10 mg",
        "catalogVariantLabel": variant["label"], "nominalAmountPerVialMg": 10,
        "form": "Lyophilized vial", "classification": "For laboratory research use only.",
        "artworkVersion": "DIHEXA-10-WEB-SUPPLIER-v1",
        "mediaKind": "original_xenios_website_render", "physicalPackagingState": "design",
        "websiteArtworkState": "pending_independent_file_level_review", "runtimeLinked": False,
        "publicationAuthorized": False, "artifacts": artifacts, "websiteReviewCandidates": candidates,
    }
    batch_id = "catalog-imagery-2026-11-04-batch-010"
    manifest = {
        "schemaVersion": 1, "batchId": batch_id, "releaseBaseline": RELEASE,
        "catalogDataset": catalog_pin, "bindingDataset": bindings_pin,
        "publicationState": "review_only_not_runtime", "supplierSendPerformed": False,
        "authority": ["KAN-59/10615", "KAN-225/10616"],
        "labelFactSources": [
            {"reference": "KAN-59/10654", "labelFactsSha256": "2a7b93e1c71234811fc1adc8651be54a7e5d28b8115bdb2633533387b2cb163c"},
            {"reference": "KAN-59/10681", "scope": "verified static facts; scientific copy held"},
            {"reference": "KAN-31/10668", "scope": "static facts only"},
        ],
        "requiredMountedViewportsAfterReview": [320, 390, 768, 1280],
        "contactSheet": sheet, "records": [record],
    }
    receipt = {
        "ok": True, "batchId": batch_id,
        "canonicalPairs": sum(len(item["variants"]) for item in catalog["products"]),
        "exactArtworkPairs": 1, "checkedArtifacts": 8, "checkedWebsiteWebps": 2,
        "independentlyAcceptedWebsiteAssets": 0, "runtimeLinkedAssets": 0,
        "publicationAuthorizedAssets": 0, "supplierApprovedProofs": 0, "supplierSendPerformed": False,
    }
    return {"media-batch.v1.json": manifest, "verification-result.v1.json": receipt}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="Regenerate the contact sheet, manifest and receipt")
    args = parser.parse_args()
    if args.write:
        contact_sheet()
    outputs = assemble()
    for name, data in outputs.items():
        path = BATCH / name
        content = json.dumps(data, indent=2) + "\n"
        if args.write:
            path.write_text(content, encoding="utf-8", newline="\n")
        else:
            require(path.read_text(encoding="utf-8") == content, f"Stored artifact metadata differs: {name}")
    print(json.dumps(outputs["verification-result.v1.json"], indent=2))


if __name__ == "__main__":
    main()
