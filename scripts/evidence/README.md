# Evidence tooling — browser matrix, HTTP head evidence, manifest, PII scan

Deterministic, re-runnable scripts that produce the evidence the review packet
(`docs/review/xenios-research-full-site-20260828/evidence-manifest.json`,
schemaVersion 2) asks for. Built by helper `A11Y-EVIDENCE` for the Lead to run on
the **final frozen SHA**. Nothing here claims a release verdict: every result the
tools write is `AUTOMATED_PASS` / `AUTOMATED_PASS_WITH_NOTES` /
`AUTOMATED_FAIL` / `PENDING`, never a reviewer
`PASS`, and `finalVerdict` / `readyForSamuelDeployReview` are never set.

## Zero new dependencies

- Browser driver: **raw Chrome DevTools Protocol over the repo's existing `ws`
  package** (`lib/cdp.mjs`). No Playwright/Puppeteer package is installed in the
  private `node_modules`, and the helper rules forbid installs.
- Browser binary: the Playwright-managed host Chromium under
  `%LOCALAPPDATA%\ms-playwright\chromium-<rev>\chrome-win64\chrome.exe`
  (highest revision wins; override with `XR_EVIDENCE_CHROME=<path>`). Do not
  run `playwright install`.
- Node 20.19.0 from `C:\Users\sboad\projects\xr-toolchains\node-v20.19.0-win-x64`.

## Exact commands (run from the repo root of the frozen checkout)

```powershell
$env:Path = "C:\Users\sboad\projects\xr-toolchains\node-v20.19.0-win-x64;$env:Path"
node --version                                   # must print v20.19.0
$SHA = (git rev-parse HEAD)                      # the frozen candidate
$OUT = "C:\Users\sboad\projects\XENIOS_RESEARCH_FULL_FINISH_20260828\CONTROL\EVIDENCE\browser-$SHA"

# 0. Serve the production build locally on a free port (never 5000/5221/5231).
node script/build.mjs
$env:PORT = "5184"; Start-Process node -ArgumentList "scripts/preview-research.mjs" -PassThru | Tee-Object -Variable preview
#    (record $preview.Id; stop it with Stop-Process $preview.Id when done)

# 1. Raw HTTP document evidence: status, X-Robots-Tag, raw <title>/canonical/OG, JSON-LD, sitemap parity, 404 probe.
node scripts/evidence/capture-http-evidence.mjs --base-url http://127.0.0.1:5184 --out-dir $OUT --sha $SHA

# 2. Browser matrix: 8 widths + 200 % zoom equivalent, audits, focus walk, reduced-motion + forced-colors renders, screenshots.
node scripts/evidence/capture-browser-matrix.mjs --base-url http://127.0.0.1:5184 --out-dir $OUT --sha $SHA --reviewer "<reviewer>"

# 3. PII / secret scan of everything the two steps wrote (text + file names; screenshots listed for manual review).
node scripts/evidence/pii-scan.mjs --out-dir $OUT --fail-on-findings

# 4. Merge into a schemaVersion-2 manifest (template = the packet's draft manifest).
node scripts/evidence/generate-evidence-manifest.mjs --out-dir $OUT --sha $SHA --reviewer "<reviewer>" `
  --template docs/review/xenios-research-full-site-20260828/evidence-manifest.json `
  --artifact-root docs/review/xenios-research-full-site-20260828/browser

# 5. Unit tests of the tooling itself (pure parsers / reporters / manifest merge / in-page audit under jsdom).
npx vitest run --config scripts/evidence/vitest.config.mjs --no-file-parallelism --testTimeout 60000
```

Git Bash note: MSYS rewrites arguments that begin with `/` (e.g. `--only /research`)
into Windows paths. Prefix bash invocations with `MSYS_NO_PATHCONV=1` or use PowerShell.

Useful switches: `--only /research,/research/about` (subset of routes),
`--widths 1440,320`, `--no-focus-walk`, `--no-media-variants`, `--no-zoom`,
`--routes <inventory.json>`, `--max-tab-stops 80`.

## What each run checks

Per route × width (`capture-browser-matrix.mjs`, in-page audit `lib/page-audit.js`):

| Assertion | Meaning |
|---|---|
| `NO_HORIZONTAL_OVERFLOW` | `documentElement/body.scrollWidth <= clientWidth`; offending elements listed |
| `NO_CLIPPED_TEXT` | text inside `overflow-x: hidden/clip` boxes wider than their box without `text-overflow: ellipsis` |
| `TARGETS_44x44` | visible interactive elements (`a[href], button, input, select, textarea, summary, role=button/link/tab/…, [tabindex]`) below 44×44 CSS px; inline links inside running text are exempt per WCAG 2.5.8 |
| `SINGLE_MAIN_LANDMARK` / `NO_NESTED_MAIN` | exactly one visible `main`/`role=main`, none nested |
| `NO_DUPLICATE_IDS` | duplicate `id` attributes |
| `SINGLE_H1` | exactly one visible h1 (informational) |
| `FORM_CONTROLS_LABELLED` | every visible input/select/textarea has a label, aria-label, aria-labelledby or title |
| `IMAGES_HAVE_ALT` | every visible `img` has an `alt` |
| `ARIA_REFERENCES_RESOLVE` | `aria-labelledby/describedby/controls/errormessage` ids exist |
| `DOCUMENT_LANG` | `html[lang]` present |
| `FOCUS_ORDER_REACHABLE` | real `Tab` key walk (CDP `Input.dispatchKeyEvent`) reaches stops and does not trap |
| `FOCUS_VISIBLE_PRESENT` | every stop reached shows an outline or box-shadow while `:focus-visible` |
| `EXPECTED_HTTP_FAILURES_OBSERVED` | every route-declared fail-closed API response occurs at its exact URL, method, status, response-body SHA-256, network count, and console text/count |
| `CONSOLE_CLEAN` / `NETWORK_CLEAN` | no unexpected console errors/exceptions or failed/≥400 responses; exact declared fail-closed responses are `PASS_WITH_NOTES` and retain their raw records |

Also recorded per run: `main` selectors, heading outline, landmark counts, live-region
count, dialog semantics (`aria-modal`, labelled), skip-link target existence,
`prefers-reduced-motion`/`forced-colors` match state, rendered page text
(`*.text.txt`, used by the PII scan), console records, failed requests.

The route matrix preloads the product's session-only PWA dismissal flag before
every document. This prevents the install-education pill from covering the route
under review; every run and the matrix tool metadata record that controlled UI
state. PWA lifecycle behavior remains covered by its dedicated tests.

Media variants (at 390 px): `reduced-motion` (`Emulation.setEmulatedMedia`
`prefers-reduced-motion: reduce`) and `forced-colors` (`forced-colors: active`, with a
fresh focus walk so forced-colors focus indicators are checked).

200 % zoom equivalent: a **720 CSS px viewport at deviceScaleFactor 2**, i.e. a 1440 px
screen at 200 % browser zoom (WCAG 1.4.10 reflow equivalent). Method is recorded in
each run (`zoomMethod`) and in `browserMatrix.twoHundredPercentZoomEquivalent`.

Client-side metadata restoration: navigates public → private → public with
`history.pushState` and compares `document.title`, canonical and `meta[name=robots]`
(`browserMatrix.metadataRestoration`, `gates.seo.publicToPrivateMetadataRestoration`).

Per route (`capture-http-evidence.mjs`, pure parser `lib/html-metadata.mjs`) — the
packet's `httpHeadEvidence.requiredAssertions`: `STATUS_CODE`, `X_ROBOTS_TAG`,
`RAW_HTML_TITLE`, `CANONICAL`, `OPEN_GRAPH`, `SITEMAP_PARITY`, `STRUCTURED_DATA_SCOPE`,
`AUTHORITATIVE_404` (the probe route must be a real 404 with noindex),
`PUBLIC_TO_PRIVATE_METADATA_RESTORATION` (delegated to the browser step). Raw HTML of
every response is kept under `raw-html/`.

## Outputs (all under `--out-dir`)

```
captures/<surface>--<state>--chromium--<width|200pct>[-<variant>]--01.png   screenshots (full page, ≤ 6000 px tall)
captures/<same>.text.txt                                                   rendered page text
runs/<nnn>-<slug>.json                                                     full audit + assertions per run
browser-matrix.json                                                        index, tool versions, summary, metadataRestoration
raw-html/<route>.html, raw-html/sitemap.xml                                raw documents
http-evidence.json                                                         per-route head evidence
pii-scan.json                                                              scan result + screenshot list for manual review
evidence-manifest.json                                                     merged schemaVersion-2 manifest
```

File names follow the packet convention and never contain names, emails, order
references or tokens (the PII scan checks file names too).

## Route inventory

`routes.public.json` maps every route to a packet `surface` id, a `state`, an
`indexable` expectation and an optional `syntheticFixtureId`. `/care/schedule`
is the public Tebra surface; `/care/appointments` is captured separately in its
private, disabled state. Private routes
(`/research/account*`, `/research/member*`, `/admin/research*`) are captured in their
**unauthenticated** state only; authenticated states require a Lead-provided synthetic
session and are recorded as `requires Lead session` in the handoff. `RESEARCH_INDEXABLE`
is false at this head, so every Research document is expected `noindex`; flip
`indexable` per route when the Lead composes indexing.

The preview server (`scripts/preview-research.mjs`) runs against an owned,
read-empty loopback adapter;
data-backed surfaces render their fallback/empty states, which is what the
`loading`/`empty`/`unavailable` captures document. Console/network assertions on those
routes record exact expected fail-closed responses with method/status/count and
production-parity evidence. Broad URL failure allowlists are not used by the
release inventory. Hino's protected historical target-size debt is the sole
reviewed assertion note and is bound to the exact live-production finding
fingerprints; any selector, count, or dimension drift remains blocking.

## Determinism

Fixed viewport sizes, `--force-device-scale-factor=1`, `--hide-scrollbars`, emulated
media, network-quiet wait (800 ms quiet, 8 s bound) plus one painted frame before each
audit/screenshot, sorted route/width iteration, zero-padded sequence numbers. Re-running
on the same SHA and build reproduces the same assertions; pixel-identical screenshots
depend on font rasterisation of the host and are not asserted.

## Integrating the tests into the root suite (Lead-owned `vitest.config.ts`)

Add `"scripts/evidence/**/*.test.mjs"` to `test.include`. Until then run them with the
standalone config above.
