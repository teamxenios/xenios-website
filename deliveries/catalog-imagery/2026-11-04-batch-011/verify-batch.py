import hashlib
import json
from pathlib import Path
import subprocess

from PIL import Image


batch_dir = Path(__file__).resolve().parent
repo = batch_dir.parents[2]
manifest = json.loads((batch_dir / "media-batch.v1.json").read_text(encoding="utf-8"))


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def require(condition, detail):
    if not condition:
        raise SystemExit(detail)


def load_baseline_dataset(dataset):
    ref = f"{manifest['releaseBaseline']}:{dataset['path']}"
    blob = subprocess.check_output(["git", "rev-parse", ref], cwd=repo, text=True).strip()
    raw = subprocess.check_output(["git", "cat-file", "blob", blob], cwd=repo)
    require(blob == dataset["gitBlobOid"], f"Unexpected Git blob for {ref}")
    require(sha256(raw) == dataset["rawSha256"], f"Unexpected SHA-256 for {ref}")
    return json.loads(raw)


products = load_baseline_dataset(manifest["catalogDataset"])["products"]
bindings = load_baseline_dataset(manifest["bindingDataset"])["bindings"]
require(len(products) == manifest["catalogDataset"]["offeringCount"], "Unexpected offering count")
require(
    sum(len(product["variants"]) for product in products)
    == manifest["catalogDataset"]["sourceVariantCount"],
    "Unexpected source-variant count",
)
require(len(manifest["records"]) == 1, "Expected one Hydrate record")
record = manifest["records"][0]
pair = (record["offeringId"], record["sourceVariantId"])
require(pair == ("mo_a4cfc5396d714f879944", "mov_d6a8b2cd129bda39d8fa"), "Unexpected pair")
joined_variants = [
    product["canonicalName"]
    for product in products
    for variant in product["variants"]
    if (product["id"], variant["id"]) == pair
]
require(joined_variants == [record["canonicalName"]] == ["Hydrate"], "Catalog join failed")
joined_skus = [
    binding["productControlSku"]
    for binding in bindings
    if (binding["offeringId"], binding["offeringVariantId"]) == pair
]
require(joined_skus == [record["quickOrderSku"]] == ["GEN-GRP-0372"], "Binding join failed")

asset = record["asset"]
asset_path = (repo / asset["relativeAssetPath"]).resolve()
require(asset_path.is_relative_to(batch_dir), "Asset path leaves delivery directory")
raw = asset_path.read_bytes()
require(len(raw) == asset["bytes"], "Original PNG byte count differs")
require(sha256(raw) == asset["sha256"], "Original PNG source hash differs")
with Image.open(asset_path) as image:
    require(image.format == "PNG" and asset["format"] == "png", "Unexpected image format")
    require(image.size == (asset["width"], asset["height"]) == (420, 420), "Unexpected dimensions")
    pixels = image.convert("RGBA").tobytes()
require(sha256(pixels) == record["officialGallery"]["decodedRgbaSha256"], "Gallery pixels differ")
require(
    manifest["runtimeLinked"] is False
    and manifest["authority"]["releasePublicationApproved"] is False
    and record["publicationAuthorized"] is False,
    "Static candidate cannot claim integration or publication",
)
print("Batch 011 verified: 1 exact catalog/binding pair and 1 original 420×420 PNG.")
