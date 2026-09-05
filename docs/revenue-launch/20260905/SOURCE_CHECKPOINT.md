# Seth revenue launch: source and production reconciliation

This is an engineering checkpoint, not a release candidate or a live launch.
Session `codex-seth-revenue-launch-20260905` continues on isolated branch
`codex/xenios-seth-revenue-launch-20260905`, based on accepted parent
`ba3ea05bec38efe6eda94a9eb6b6f37f728baa1c`.

The available package's 44 checksum entries agree exactly with its file
manifest. Fourteen declared files were found with matching byte counts and
SHA-256 hashes. Thirty remain absent, including the 25,300-byte source workbook
(`41ab91bfd7120a0f0a47bc6ab9d8cd7ea7ba5ea63efe50aeb4894de2e31fcc83`),
original implementation manifest, starter source/tests, and generated starter
evidence. The package's reported tests were not rerun because their code is
missing. Hash agreement with the supplied manifest does not establish founder
approval, workbook correctness, or production eligibility.

The available live JSON and both CSV files independently agree on all 39 Phase A
rows and 117 positive, nonincreasing integer-cent tiers. All 68 Phase B rows are
preserved separately. Exceptions remain on SETH-CAND-046 (no positive price),
063, 064 and 066 (inverted tiers). No prices were corrected or approved by this
inspection. Only product, configuration, target prices and review flags enter
the generated reconciliation input; cost proxies, demand notes and clinical
claims do not become customer facts.

Read-only Render and canonical product observations at
`2026-09-05T04:23:27.735991+00:00` confirm:

- Render service `srv-d8s9vej7uimc7384dfcg` remains live on
  `db5a2d447114c1e8a14185a9865ded50ee3f1ac6`, deploy
  `dep-dad08h740ujc73aprfcg`; automatic deployment is off.
- Service configuration has `RESEARCH_EARLY_ACCESS_CART_ENABLED=false` and
  `RESEARCH_ASSISTED_ORDER_BRIDGE_ENABLED=true`. This is configuration evidence,
  not an authenticated runtime smoke.
- Canonical reads returned 236 products, 439 variants and 452 price rows. These
  are total rows, not counts of purchasable products or active approved prices.
- The historical August 19 price release provides 34 exact source-to-product,
  variant and SKU references that still join correctly against current rows.
  Five source bindings remain unresolved. All 34 referenced variants lack
  canonical presentation/format and shipping class; their products lack
  commerce approval and approved product documentation. Six source rows retain
  formulation assumptions or a pending component split. Historical joins do
  not close those gates.
- Direct supplier-table reads are intentionally forbidden by the repository's
  RPC boundary. The existing bulk read RPC returns HTTP 404 in production;
  fresh supplier liveness has not yet been attested. No table grants changed.
- The migration ledger, running-process environment, payment authorization,
  inventory/capacity, exact lot documentation and authenticated purchase flow
  have not yet been independently verified for this launch.

Other dirty worktrees were inventoried read-only and preserved. No active
foreign lease was taken over. The source-only checkpoint does not alter the
application runtime, approve prices, publish products, apply migrations, change
flags, send communications or perform operational transactions.

Validation: seven Python regression tests pass, covering byte tampering,
traversal, CSV/JSON disagreement, lost/duplicate rows, invalid cents, formula
input, unauthorized publication claims and preserved Phase B exceptions.
The validator ran against the actual available files. Application release
gates have not been rerun for this source-only slice.

Reproduce with the bundled Python runtime:

```text
python -m unittest discover -s scripts/revenue-launch -p test_source.py -v
python scripts/revenue-launch/validate_source.py --manifest <PACKAGE_MANIFEST.json> --checksums <SHA256SUMS.txt> --root <package-or-download-directory> --output config/research/revenue-launch/seth-source-reconciliation-20260905.json
python scripts/revenue-launch/read_production.py --output <private-review-output.json>
python scripts/revenue-launch/reconcile_source.py --source config/research/revenue-launch/seth-source-reconciliation-20260905.json --production <private-review-output.json> --historical docs/research-launch/PRICE_RELEASE_2026-08-19.json --output <reconciliation-output.json>
```

Next engineering slice: extend canonical Product Control price versions with
quantity tiers, immutable source intake and review transitions; wire approved
current prices into existing quote and order recomputation. Missing workbook
and operational authority remain explicit release blockers while engineering
continues. No exact-SHA production GO has been requested or granted.
