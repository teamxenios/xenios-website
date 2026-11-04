"""Check a CLAUDE peptide artwork handoff using exact Git blobs."""

import argparse
from hashlib import sha256
from io import BytesIO
import json
import re
import subprocess
import sys

from PIL import Image


CATALOG = "server/research/master-offerings/data/member-safe-master-offerings.generated.json"
BINDINGS = "server/research/master-offerings/data/master-offering-bindings.generated.json"
CAPTION = "Packaging design shown. Current packaging may differ."
ROLES = {"primary": "website_primary", "label_detail": "front_preview_web"}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def git_blobs(commit, paths):
    """Read committed bytes without applying checkout line-ending conversions."""
    paths = list(dict.fromkeys(paths))
    request = "".join(f"{commit}:{path}\n" for path in paths).encode("utf-8")
    result = subprocess.run(
        ["git", "cat-file", "--batch"], input=request, capture_output=True, check=True,
    )
    payload = BytesIO(result.stdout)
    blobs = {}
    for path in paths:
        header = payload.readline().split()
        require(len(header) == 3 and header[1] == b"blob", f"Missing Git blob: {commit}:{path}")
        length = int(header[2])
        data = payload.read(length)
        require(len(data) == length and payload.read(1) == b"\n", f"Incomplete Git blob: {path}")
        blobs[path] = data
    return blobs


def website_candidates(record, batch):
    """Join each website role to the matching artifact of the same variant."""
    sku = record["quickOrderSku"]
    candidates = record["websiteReviewCandidates"]
    require(len(candidates) == 2 and {item["role"] for item in candidates} == ROLES.keys(),
            f"{sku}: expected exactly one primary and one label detail")
    for candidate in candidates:
        role = candidate["role"]
        artifact = record["artifacts"][ROLES[role]]
        path = candidate["relativeAssetPath"]
        require(path == artifact["relativeAssetPath"] and candidate["sha256"] == artifact["sha256"],
                f"{sku}: {role} path/hash does not match this variant's declared artifact")
        require(re.fullmatch(re.escape(batch) + r"/assets/[a-z0-9-]+\.webp", path)
                and artifact["format"] == "webp", f"{sku}: unexpected website asset path or format")
        require(candidate["caption"] == CAPTION and candidate["altText"].strip(),
                f"{sku}: packaging disclosure or alt text missing")
        yield artifact


def verify(candidate, release, batch):
    manifest_path = f"{batch}/media-batch.v1.json"
    files = git_blobs(candidate, (manifest_path, CATALOG, BINDINGS))
    release_files = git_blobs(release, (CATALOG, BINDINGS))
    manifest = json.loads(files[manifest_path])
    require(manifest["releaseBaseline"] == release, "Manifest release baseline differs")
    for key, path in (("catalogDataset", CATALOG), ("bindingDataset", BINDINGS)):
        pinned = manifest[key]
        data = release_files[path]
        require(files[path] == data, f"Candidate changed the pinned release data: {path}")
        require(pinned["path"] == path and pinned["sha256"] == sha256(data).hexdigest()
                and pinned["bytes"] == len(data), f"Manifest release data pin differs: {path}")

    offerings = json.loads(release_files[CATALOG])["products"]
    catalog = {(p["id"], v["id"]): (p, v) for p in offerings for v in p["variants"]}
    bindings = {(b["offeringId"], b["offeringVariantId"]): b
                for b in json.loads(release_files[BINDINGS])["bindings"]}
    pairs = set()
    assets = {}
    asset_hashes = set()
    for record in manifest["records"]:
        pair = record["offeringId"], record["sourceVariantId"]
        sku = record["quickOrderSku"]
        require(pair in catalog and pair in bindings and pair not in pairs, f"{sku}: invalid or repeated pair")
        pairs.add(pair)
        product, variant = catalog[pair]
        binding = bindings[pair]
        require((binding["productControlSku"], binding["productId"], binding["variantId"])
                == (sku, record["quickOrderProductId"], record["quickOrderVariantId"]),
                f"{sku}: exact Quick Order binding differs")
        require((product["displayName"], variant["label"], product["family"], product["subcategory"],
                 variant["displayState"]) == (record["canonicalName"], record["catalogVariantLabel"],
                 "research_peptides_materials", "Lyophilized Vial", "request_access"),
                f"{sku}: exact catalog identity, form or pathway differs")
        for artifact in website_candidates(record, batch):
            path, digest = artifact["relativeAssetPath"], artifact["sha256"]
            require(path not in assets and digest not in asset_hashes,
                    f"{sku}: a website path or SHA-256 is reused")
            assets[path] = artifact
            asset_hashes.add(digest)

    require(pairs, "No variants to verify")
    for path, data in git_blobs(candidate, assets).items():
        artifact = assets[path]
        require((len(data), sha256(data).hexdigest()) == (artifact["bytes"], artifact["sha256"]),
                f"Website bytes or SHA-256 differ: {path}")
        with Image.open(BytesIO(data)) as image:
            image.load()
            require(image.format == "WEBP" and image.size == (artifact["width"], artifact["height"]),
                    f"Decoded website format or dimensions differ: {path}")

    return {"ok": True, "candidate": candidate, "release": release, "batch": batch,
            "catalogPairs": len(catalog), "variantPairsChecked": len(pairs),
            "websiteWebpsChecked": len(assets), "manifestSha256": sha256(files[manifest_path]).hexdigest()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidate", required=True, help="Full artwork commit SHA")
    parser.add_argument("--release", required=True, help="Full trusted release commit SHA")
    parser.add_argument("--batch", required=True, help="Repository-relative CLAUDE artwork delivery directory")
    args = parser.parse_args()
    try:
        for commit in (args.candidate, args.release):
            require(re.fullmatch(r"[a-f0-9]{40}", commit), "Use full lowercase commit SHAs")
        require(re.fullmatch(r"deliveries/peptide-artwork-claude-1/[a-z0-9-]+", args.batch),
                "Use the exact CLAUDE-1 delivery path")
        print(json.dumps(verify(args.candidate, args.release, args.batch), indent=2))
    except (ValueError, KeyError, TypeError, OSError, subprocess.CalledProcessError) as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
