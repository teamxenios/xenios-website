"""Read-only inspection of the supplied launch package; never activates prices.

Uses SHA-256 identity, including for browser-renamed standalone downloads. No
package code is executed. Raw workbook/customer values are never exported.
"""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def safe_relative(value):
    if not isinstance(value, str) or "\\" in value or ":" in value:
        raise ValueError("Invalid package path")
    path = PurePosixPath(value)
    if path.is_absolute() or any(p in ("", ".", "..") for p in value.split("/")):
        raise ValueError("Unsafe package path")
    return path


def inventory(manifest, roots):
    files = manifest.get("files")
    if not isinstance(files, list) or not files:
        raise ValueError("Missing package file manifest")
    identities = {}
    for entry in files:
        name = str(safe_relative(entry["path"]))
        if name in identities:
            raise ValueError("Duplicate package path")
        if type(entry["bytes"]) is not int or entry["bytes"] < 0:
            raise ValueError("Invalid file size")
        digest = entry["sha256"]
        if not isinstance(digest, str) or len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
            raise ValueError("Invalid SHA-256")
        identities[name] = entry
    wanted_sizes = {entry["bytes"] for entry in files}
    candidates = {}
    for root in roots:
        if not root.is_dir():
            continue
        # Only declared relative locations and standalone sibling downloads.
        # Do not crawl unrelated repositories or private customer directories.
        paths = {p for p in root.iterdir() if p.is_file()}
        paths.update(root.joinpath(*PurePosixPath(name).parts) for name in identities)
        for path in sorted(paths):
            # Resolving also rejects escapes through parent directory symlinks
            # and Windows junctions, not just links on the final filename.
            if (not path.resolve().is_relative_to(root.resolve()) or path.is_symlink()
                    or not path.is_file() or path.stat().st_size not in wanted_sizes):
                continue
            candidates.setdefault((path.stat().st_size, sha256(path)), []).append(path)
    result, resolved = [], {}
    for name, entry in identities.items():
        matches = candidates.get((entry["bytes"], entry["sha256"]), [])
        result.append({**entry, "status": "verified" if matches else "missing",
                       "locatedNames": sorted({p.name for p in matches})})
        if matches:
            resolved[name] = matches[0]
    return result, resolved


def factor_rows(manifest):
    """Lossless display: print identical row fields once, every differing field."""
    result = {}
    for key, value in manifest.items():
        if isinstance(value, list) and value and all(isinstance(r, dict) for r in value):
            common = {k: v for k, v in value[0].items() if all(k in r and r[k] == v for r in value)}
            result[key] = {"commonFieldsAppliedToEveryRow": common,
                           "rows": [{k: v for k, v in row.items() if k not in common} for row in value]}
        else:
            result[key] = value
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--root", type=Path, action="append", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--read-manifest", action="store_true")
    args = parser.parse_args()
    package = json.loads(args.manifest.read_text(encoding="utf-8-sig"))
    files, resolved = inventory(package, args.root)
    report = {"schemaVersion": 1, "packageManifestSha256": sha256(args.manifest),
              "package": package["package"], "files": files,
              "verifiedFileCount": sum(f["status"] == "verified" for f in files),
              "declaredFileCount": len(files), "packageComplete": len(resolved) == len(files),
              "suppliedStarterExecuted": False, "productionMutated": False}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    launch_key = "manifests/XENIOS_SETH_LIVE_REVENUE_LAUNCH_MANIFEST_2026-09-05.json"
    if args.read_manifest:
        if launch_key not in resolved:
            raise ValueError("Launch manifest bytes not verified")
        print(json.dumps(factor_rows(json.loads(resolved[launch_key].read_text(encoding="utf-8-sig"))), ensure_ascii=False))
    else:
        print(json.dumps({k: v for k, v in report.items() if k != "files"}))


if __name__ == "__main__":
    main()
