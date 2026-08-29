# Deterministic release evidence

These scripts produce automated release evidence for one exact Xenios candidate
commit. They do not make the release decision: generated results remain
`AUTOMATED_PASS`, `AUTOMATED_PASS_WITH_NOTES`, `AUTOMATED_FAIL`, or `PENDING`,
and the manifest generator always leaves `finalVerdict` pending and
`readyForSamuelDeployReview` false.

## Required execution contract

- Run every candidate build and capture command from the root of a clean
  checkout whose `HEAD` is the exact 40-character SHA passed with `--sha`.
  Modified, staged, or untracked files make the provenanced workflow fail.
- Use exactly Node `v20.19.0` and npm `10.8.2`. The candidate builder rejects a
  different Node or sibling npm version. Every capture records both exact
  versions, and the manifest independently validates them.
- The candidate builder installs only with `npm ci --no-audit --no-fund` from
  the verified clean checkout. It hashes that checkout's actual
  `package-lock.json`, verifies that the install and build do not change it,
  and binds the exact hash and install method into preview and capture
  provenance.
- Use a fresh absolute `--out-dir` outside the checkout. Primary capture tools
  write artifacts before later tools recheck cleanliness, and the synthetic
  tool explicitly refuses an output path inside the repository. Never reuse an
  output directory from another SHA or run.
- Use an HTTP loopback preview origin. The provenance client rejects non-loopback
  and HTTPS origins, and the raw HTTP tool rejects redirects away from the exact
  preview origin.
- Keep focus walk, media variants, zoom, the PII scan, and all routes enabled
  for a release run. The corresponding `--no-*` and subset switches are only for
  local diagnosis.

The scripts use raw Chrome DevTools Protocol through the repository's existing
`ws` dependency. Chrome is discovered from the Playwright-managed Chromium
under `%LOCALAPPDATA%\ms-playwright`; set `XR_EVIDENCE_CHROME` (or synthetic
capture's `--chrome-path`) only when an explicit binary is required. No browser
package or browser download is part of this workflow.

## Exact PowerShell workflow

Run this from the frozen checkout's repository root. The example evidence root
is outside the repository and uses the current `20260829` release-evidence
namespace; choose another persistent external location if needed.

```powershell
$Toolchain = $env:XR_NODE20_TOOLCHAIN
if ([string]::IsNullOrWhiteSpace($Toolchain)) {
  throw "Set XR_NODE20_TOOLCHAIN to the unpacked Node 20.19.0 toolchain directory"
}
$Node = Join-Path $Toolchain "node.exe"
$Npm = Join-Path $Toolchain "npm.cmd"
$Npx = Join-Path $Toolchain "npx.cmd"
foreach ($RequiredTool in @($Node, $Npm, $Npx)) {
  if (-not (Test-Path -LiteralPath $RequiredTool -PathType Leaf)) {
    throw "Pinned toolchain file is missing: $RequiredTool"
  }
}

& $Node --version                              # exactly v20.19.0
& $Npm --version                               # exactly 10.8.2

$SHA = (& git rev-parse HEAD).Trim()
if ($SHA -notmatch '^[a-f0-9]{40}$') { throw "HEAD is not an exact commit SHA" }
if ((& git status --porcelain=v2 --untracked-files=all)) {
  throw "Evidence must run from a clean checkout"
}

$EvidenceRoot = Join-Path $env:LOCALAPPDATA "Xenios\release-evidence\20260829"
$OUT = Join-Path $EvidenceRoot "candidate-$SHA"
if (Test-Path -LiteralPath $OUT) { throw "Use a fresh evidence output directory: $OUT" }
New-Item -ItemType Directory -Path $OUT | Out-Null

# 1. Build dist with the pinned sibling npm and bind it to the clean SHA/tree.
& $Node scripts/evidence/build-candidate-preview.mjs --sha $SHA
if ($LASTEXITCODE) { throw "Candidate build failed" }

# 2. Serve only that provenanced dist on loopback. The launcher strips ambient
#    application credentials and owns a read-empty/write-refusing local adapter.
$env:PORT = "5184"
$Preview = Start-Process -FilePath $Node `
  -ArgumentList @("scripts/preview-research.mjs") `
  -WorkingDirectory (Get-Location).Path `
  -WindowStyle Hidden `
  -PassThru

try {
  # This endpoint must become ready and report candidateSha=$SHA before capture.
  $PreviewProvenance = $null
  for ($Attempt = 0; $Attempt -lt 80 -and -not $PreviewProvenance; $Attempt++) {
    if ($Preview.HasExited) { throw "Preview exited before becoming ready" }
    try {
      $PreviewProvenance = Invoke-RestMethod `
        "http://127.0.0.1:5184/__xenios_evidence_provenance" `
        -TimeoutSec 2
    }
    catch {
      Start-Sleep -Milliseconds 250
    }
  }
  if (-not $PreviewProvenance) { throw "Preview provenance endpoint did not become ready" }
  if ($PreviewProvenance.candidateSha -ne $SHA) { throw "Preview SHA mismatch" }

  # 3. Primary raw-HTTP and browser evidence. Both independently validate the
  #    clean checkout and the served build provenance.
  & $Node scripts/evidence/capture-http-evidence.mjs `
    --base-url http://127.0.0.1:5184 --out-dir $OUT --sha $SHA
  if ($LASTEXITCODE) { throw "HTTP evidence capture failed" }

  & $Node scripts/evidence/capture-browser-matrix.mjs `
    --base-url http://127.0.0.1:5184 --out-dir $OUT --sha $SHA --reviewer "<reviewer>"
  if ($LASTEXITCODE) { throw "Browser matrix capture failed" }
}
finally {
  if ($Preview -and -not $Preview.HasExited) { Stop-Process -Id $Preview.Id }
}

# 4. Supplemental dev-only synthetic-production-shape journeys. This performs
#    its own fresh provenanced build, starts three isolated loopback harnesses,
#    and captures 10 required states at 1440 px and 390 px (20 captures).
& $Node scripts/evidence/capture-synthetic-journeys.mjs `
  --out-dir $OUT --sha $SHA --reviewer "<reviewer>"
if ($LASTEXITCODE) { throw "Synthetic journey capture failed" }

# 5. Required, non-skipped text/file-name PII and secret scan. Pass the SHA
#    explicitly and fail the command on any finding.
& $Node scripts/evidence/pii-scan.mjs `
  --out-dir $OUT --sha $SHA --fail-on-findings
if ($LASTEXITCODE) { throw "Evidence PII scan failed" }

# 6. Merge primary, synthetic, HTTP, provenance, artifact-integrity, and PII
#    evidence into the schema-v2 manifest. The checked-in template and the
#    20260829 artifact-root default are used unless explicitly overridden.
& $Node scripts/evidence/generate-evidence-manifest.mjs `
  --out-dir $OUT --sha $SHA --reviewer "<reviewer>"
if ($LASTEXITCODE) { throw "Evidence manifest generation failed" }

# 7. Tooling tests. Run with the same pinned npm/Node toolchain.
& $Npx vitest run --config scripts/evidence/vitest.config.mjs `
  --no-file-parallelism --testTimeout 60000
if ($LASTEXITCODE) { throw "Evidence tooling tests failed" }
```

`Start-Process` is asynchronous, so the bounded loop waits for the provenance
endpoint and fails if it never becomes available. Do not bypass that check.
Always stop the preview in `finally` as shown.

The manifest generator's defaults are
`scripts/evidence/evidence-manifest.template.json` and
`docs/review/xenios-research-full-site-20260829/browser`. Override them only with
the supported syntax. The artifact root is the repo-relative namespace recorded
in manifest artifact paths; generation does not write evidence into the
checkout.

```powershell
& $Node scripts/evidence/generate-evidence-manifest.mjs `
  --out-dir $OUT --sha $SHA --reviewer "<reviewer>" `
  --template "<manifest.json>" `
  --artifact-root "<repo-relative-artifact-directory>" `
  --output "<manifest-output.json>"
```

Git Bash rewrites arguments beginning with `/`, including route values passed to
`--only`. Use PowerShell or prefix a Bash invocation with
`MSYS_NO_PATHCONV=1`.

## Candidate and network provenance

`build-candidate-preview.mjs` runs a clean `npm ci` and the repository build with
npm located beside the executing Node binary. It checks the exact runtime,
package-lock hash, clean SHA, and source tree before and after the install/build,
inventories and hashes every emitted `dist` file, and writes
`dist/evidence-provenance.json`.

`preview-research.mjs` refuses a dirty checkout or a distribution that does not
match that SHA, source tree, runtime, package-lock hash, install method, file
inventory, and inventory hash. Before importing or serving the application it
copies the verified distribution to an isolated directory below the checkout's
ignored `node_modules`, re-inventories that snapshot, and imports only the
snapshot entry. Keeping the snapshot below `node_modules` preserves resolution
of the build's external packages without allowing later writes to authoring
`dist` to change the running preview. The provenance endpoint re-inventories the
snapshot on every read, and primary and synthetic capture revalidate the exact
snapshot again after their final artifact read. It serves that narrow endpoint
through an outer loopback proxy and starts the application with only explicit
non-production fixtures. It must not be used to judge canonical data
completeness, pricing, or production provider behavior.

The production app's Inter Tight 500/600/700/800/900 and JetBrains Mono 500/600
faces are bundled from pinned Fontsource packages. The served root document must
declare zero network-generating external resources; there are no evidence-time
font or resource substitutions. Browser interception blocks any off-origin
request before dispatch, WebSockets are disabled for the primary matrix, and
`SAME_ORIGIN_NETWORK_BOUNDARY` is blocking. Boundary telemetry covers the page,
dedicated workers, SharedWorkers, and service workers; a child target cannot
escape the page target's policy. WebRTC constructors are disabled before page
code runs (with Chromium's non-proxied UDP policy as defense in depth), so STUN
or peer-connection UDP cannot bypass the HTTP boundary. Network settle is
fail-closed: a capture fails unless a complete quiet interval remains idle
through the final paint and telemetry flush before the deadline.
`SELF_HOSTED_FONTS_LOADED` checks the computed body family and every
required loaded face. It is explicitly not-applicable only for the separately
owned static Hino microsite.

The supplemental synthetic tool permits only its three declared loopback HTTP
origins and the catalog harness's loopback Vite HMR WebSocket. It blocks external
DNS, intercepts requests before dispatch, passes a minimal child environment,
uses synthetic in-memory adapters, and records zero external mutations. Its
claim scope is `UI_PRESENTATION_ONLY`, not production behavior.

## Blocking browser checks

The primary inventory currently defines 100 routes, eight CSS widths
(`1440,1024,768,430,390,375,360,320`), a 200% zoom equivalent, and 390 px
reduced-motion and forced-colors variants. Each default route/width capture
writes a screenshot, rendered-text sibling, run JSON, and SHA-256 hashes.
Full-page screenshots must cover the entire measured CSS content box. Capture
records the CSS dimensions, device-pixel ratio, expected bitmap dimensions, and
actual PNG dimensions, then remeasures the layout after capture and refuses any
growth or drift; the manifest also parses the artifact's PNG header and rechecks
them. Content taller than the hard 24,000 CSS-pixel safety ceiling is refused
instead of silently truncated.

Every route carries a non-empty route-specific semantic contract. Every public
raw-document route also carries an exact title/description contract sourced from
the reviewed client content, and every indexable route additionally binds the
browser and raw HTTP canonical and Open Graph identity to the same exact route
contract. Generic or inherited shell metadata cannot satisfy the gate.

Important assertion semantics:

| Assertion                                                                                  | Blocking contract                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NO_HORIZONTAL_OVERFLOW` / `NO_CLIPPED_TEXT`                                               | No document overflow or silently clipped text.                                                                                                                                                                     |
| `TARGETS_44x44`                                                                            | Visible interactive targets meet the target-size rule; only an exact source- and fingerprint-bound reviewed Hino note can become `PASS_WITH_NOTES`.                                                                |
| `SINGLE_MAIN_LANDMARK` / `NO_NESTED_MAIN`                                                  | Exactly one visible main landmark and no nested main.                                                                                                                                                              |
| `SINGLE_H1`                                                                                | Exactly one visible `h1`; this is blocking, not informational.                                                                                                                                                     |
| `NO_DUPLICATE_IDS`                                                                         | No duplicate element IDs.                                                                                                                                                                                          |
| `FORM_CONTROLS_LABELLED` / `IMAGES_HAVE_ALT` / `ARIA_REFERENCES_RESOLVE` / `DOCUMENT_LANG` | Labels, alternatives, ARIA references, and document language are present and valid.                                                                                                                                |
| `FOCUS_ORDER_REACHABLE`                                                                    | A real Tab walk reaches the complete rendered/tabbable baseline set, does not trap or cycle early, and completes/cycles before `--max-tab-stops`. A truncated or incomplete walk fails.                           |
| `FOCUS_VISIBLE_PRESENT`                                                                    | Every reached stop exposes an outline or box shadow while focus-visible.                                                                                                                                           |
| `ROUTE_LOCATION` / `ROUTE_STATE_CONTRACT`                                                  | The browser is on the inventory path and that route's required/forbidden selectors and text prove the expected state. Missing semantic contracts or not-applicable state evidence are invalid for required routes. |
| `EXPECTED_HTTP_FAILURES_OBSERVED`                                                          | Every declared fail-closed response matches exact URL, method, status, body SHA-256, request count, and console text/count.                                                                                        |
| `CONSOLE_CLEAN` / `NETWORK_CLEAN`                                                          | No undeclared console errors, failed requests, or HTTP errors. Exact expected denials may be `PASS_WITH_NOTES`.                                                                                                    |
| `SAME_ORIGIN_NETWORK_BOUNDARY` / `SELF_HOSTED_FONTS_LOADED`                                | No off-origin dispatch and all applicable pinned self-hosted font faces load.                                                                                                                                      |

Focus walks run at the first configured width, 390 px, and the forced-colors
variant. Before every walk, the tool resets focus and recomputes the complete
tabbable identity baseline for that width/media state, so responsive DOM changes
cannot reuse a stale baseline. The manifest independently compares the expected
set, visited set, missing identities, stop cardinality, and cycle point. Zoom
captures intentionally record focus as not run; the manifest validates
assertion applicability rather than treating that as a pass.

The browser-level public → private → public restoration check is also blocking.
It verifies exact public/private/return paths (including the expected `returnTo`
query), stable semantic identity on both surfaces, a private `noindex` directive,
metadata that actually changes at the private boundary, and exact restoration of
title, canonical, and robots metadata on return. A navigation that never reaches
the private identity cannot pass.

## Blocking raw-HTTP checks

`capture-http-evidence.mjs` stores each raw response before client JavaScript and
evaluates `STATUS_CODE`, `CONTENT_TYPE_HTML`, `X_ROBOTS_TAG`, `ROBOTS_META`, `RAW_HTML_TITLE`,
`CANONICAL`, `OPEN_GRAPH`, `SITEMAP_PARITY`, `STRUCTURED_DATA_SCOPE`, and the
`AUTHORITATIVE_404` probe. `PUBLIC_TO_PRIVATE_METADATA_RESTORATION` is delegated
to the browser matrix.

`CONTENT_TYPE_HTML` requires the exact `text/html` MIME type for governed HTML
documents; a correct-looking body served as `text/plain` cannot pass.

`X_ROBOTS_TAG` requires the explicit route-appropriate server header; an HTML
meta tag cannot substitute for it. Independently, `ROBOTS_META` requires a
present document meta directive that byte-for-byte matches the canonical route
policy: indexable routes use
`index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1`, and
other governed routes use `noindex,nofollow,noarchive`. The authoritative 404
requires status 404 plus the exact noindex policy in both header and raw HTML.
The static external Hino microsite makes only `X_ROBOTS_TAG` not applicable;
its `ROBOTS_META` remains blocking and must exactly equal
`noindex, nofollow, nocache`.

Only indexable 200 responses may assert metadata authority. They require one
exact credential-free production HTTPS canonical and one each of `og:title`,
`og:description`, `og:image`, `og:url`, and `og:type`; `og:url` must be the exact
route URL and `og:image` must be exactly
`https://xeniostechnology.com/og/xenios-og-image-v2.png`. Private,
unindexable, and 404 responses instead receive blocking `PASS` assertions only
when canonical and every `og:*` tag are absent; presence is a failure, not an
applicability exception. The generator independently recomputes these rules.

The served `robots.txt` and `sitemap.xml` are captured as complete byte
artifacts and must match the candidate's tracked source files byte-for-byte and
by SHA-256. Every sitemap `<loc>` must be unique, exact credential-free
production HTTPS with no query or fragment. The generator compares the complete
served URL set to the tracked sitemap, then separately requires each inventory
route to be present or absent according to its indexability.

## Synthetic coverage

`capture-synthetic-journeys.mjs` captures these 10 production-shape UI states at
1440 px and 390 px, for exactly 20 captures:

1. catalog default
2. product detail default
3. account overview rich
4. orders rich
5. membership rich
6. orders empty
7. assisted-order review
8. assisted-order confirmation
9. order-status neutral error for a denied valid-shaped bare reference
10. order-status server-verified for the accepted same-session request

Each synthetic capture applies the shared browser audit plus exact route/state,
expected-view, local-network-boundary, and zero-external-mutation assertions. The
tool sanitizes generated references and fixture credentials from textual
artifacts and refuses pre-existing synthetic output.

## PII and manifest integrity

Run `pii-scan.mjs` only after both primary and synthetic capture have finished.
It scans every valid UTF-8 text artifact and every filename, records a sorted
SHA-256 inventory, and binds the result to the shared exact candidate SHA.
Artifact classification is fail-closed: an unknown extension, malformed text,
or opaque binary container makes scan coverage incomplete and prevents a clean
manifest gate. Only structurally validated PNGs without free-form metadata are
accepted as manual-review images; their pixels still require review and their
paired rendered-text files are scanned automatically. `--fail-on-findings` is
mandatory for the release workflow and exits nonzero for either findings or
incomplete scan coverage. The manifest independently reclassifies the exact
inventory and rejects missing, duplicated, or forged coverage declarations.

The manifest generator consumes `browser-matrix.json`,
`synthetic-journey-evidence.json`, `http-evidence.json`, and `pii-scan.json`. It
cross-checks SHA/tree/runtime/build provenance, route inventory, capture and text
artifact hashes, expected route/width/state coverage, assertion applicability,
the 20-capture synthetic set, metadata restoration, the zero-external-resource
contract, and the PII inventory. It independently reparses every primary and
synthetic full-run JSON file and every raw HTML artifact, then compares their
contents with the envelope assertions and exact artifact inventory. Missing,
stale, mismatched, skipped, late-boundary, or not-applicable evidence cannot
silently become an automated pass.
An alternate `--template` may add context, but a canonical-minimum policy check
rejects any template that removes or weakens required routes, widths, states,
journeys, assertions, tools, provenance bindings, or test-backed gates.

## Output layout

All paths below are relative to the external `--out-dir`:

```text
captures/*.png, captures/*.text.txt       primary screenshots and rendered text
runs/*.json                               full primary per-run audits
browser-matrix.json                       primary matrix, provenance, and summary
raw-html/*.html, raw-html/robots.txt,
raw-html/sitemap.xml                      raw crawler-facing documents/assets
http-evidence.json                        raw-HTTP assertion records
synthetic/captures/*.png                  synthetic screenshots
synthetic/captures/*.text.txt             sanitized synthetic rendered text
synthetic-journey-evidence.json           20-capture synthetic index and hashes
pii-scan.json                             exact-SHA PII/secret scan and inventory
evidence-manifest.json                    merged schema-v2 automated manifest
```

Artifact names contain surface/state/viewport identifiers only. They must never
contain a person's name, email, real order reference, status token, credential,
or an absolute workstation path.

## Diagnostic switches

For targeted debugging only:

```text
capture-browser-matrix.mjs:
  --routes <inventory.json>
  --only /research,/research/about
  --widths 1440,390
  --max-tab-stops 80
  --no-focus-walk
  --no-media-variants
  --no-zoom

capture-http-evidence.mjs:
  --routes <inventory.json>
  --only /research,/research/about

capture-synthetic-journeys.mjs:
  --chrome-path <path>
  --catalog-port <port>
  --account-port <port>
  --step1-port <port>
```

Do not use subset or `--no-*` output as final release evidence.
