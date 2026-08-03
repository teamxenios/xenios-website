# Supplement Media Ingestion Runbook

This lane discovers official supplement media without changing the peptide render queue. It is resumable and idempotent, and it fails closed on identity or rights uncertainty.

## Input

Export rows from the authoritative workbook sheets `05 Supplements` and `07 Image Tracker` into a local JSON document. Do not commit the workbook, supplier files, credentials, or downloaded product binaries.

Each row uses `SupplementManifestRow` from `server/media/official-sources/contracts.ts`. Preserve the source row, canonical product and variant IDs, exact SKU/UPC when known, product and variant text, package/count/form/flavor/size, offer state, and official product URL.

## Source lookup

```powershell
npx tsx scripts/import-official-supplement-media.mts `
  --input C:\secure-artifacts\supplement-rows.json `
  --out C:\secure-artifacts\batch-001-manifest.json `
  --start 0 `
  --limit 50 `
  --batch-id supplement-batch-001
```

The importer prefers official Shopify product JSON, then official Product JSON-LD, then official-page metadata. It uses an official-domain allowlist, bounded redirects, sequential pacing, retry state, deterministic revisioned job keys, and atomic manifest writes. Image destinations reject local/private IPv4 and private or reserved IPv6 literals—including bracketed loopback, ULA, link-local, mapped, multicast, and documentation ranges—before a request or redirect follow occurs.

Re-running the same command preserves unchanged source/match evidence and source warnings, but always re-invokes the rights resolver. A row held only for rights may advance to `AWAITING_REVIEW` when complete current evidence is supplied; a bare approved status, malformed/future permission date, expired grant, or publication-prohibiting limitation remains `HELD`. A matcher/input semantic revision changes the idempotency key so stale identity decisions are not reused.

## Rights and derivatives

Without a rights-evidence file, every discovered source is `OFFICIAL_SOURCE_RIGHTS_PENDING`; no source file is downloaded or transformed for publication. After evidence is reviewed, provide a local rights map keyed by canonical variant ID and rerun. Every approved entry requires a nonempty evidence reference and grantor, a valid non-future ISO permission date, an unexpired ISO expiration when present, and either no limitations or an exact controlled publication-compatible limitation. Any other free-text limitation is held for renewed rights review.

Approved originals stay unchanged in authorized media storage or the controlled local artifact directory. Generate derivatives with:

```powershell
npx tsx scripts/generate-supplement-derivatives.mts `
  --manifest C:\secure-artifacts\batch-001-manifest.json `
  --originals C:\secure-artifacts\approved-originals.json `
  --out-dir C:\secure-artifacts\batch-001-derivatives `
  --report C:\secure-artifacts\batch-001-derivative-report.json
```

The derivative runner uses FFmpeg, preserves aspect ratio, pads to the required canvas, and produces catalog, detail, clean-packshot, cart, social, and Open Graph views. It refuses rights-pending or weak/conflicted source matches.

## Product Control reconciliation

```powershell
npx tsx scripts/reconcile-supplement-media.mts `
  --manifest C:\secure-artifacts\batch-001-manifest.json `
  --out C:\secure-artifacts\batch-001-link-requests.json
```

Only manually approved, exact-match, rights-approved records with storage and public URLs become link requests. Applying those requests to the canonical Product Control relation remains a release-manager-owned shared seam.

## Review and fallback

The review surface must show exact row/variant identity, official page, source image, rights, score, differences, and derivatives. Until that shared UI is registered, use the manifest as the auditable review packet.

The resolver order is exact approved variant, approved canonical product, approved official-brand placeholder, approved supplement-category placeholder, then premium image-pending visual. It never substitutes another flavor, count, formulation, or historical label.

## Configuration handoff

If a brand portal or media API requires credentials, record only the variable name and owner in the release-manager-controlled Samuel configuration queue. Required categories are supplier/media-portal credentials, approved media-storage configuration, and optional `XENIOS_FFMPEG_PATH`. Never record secret values in source control or issue comments.
