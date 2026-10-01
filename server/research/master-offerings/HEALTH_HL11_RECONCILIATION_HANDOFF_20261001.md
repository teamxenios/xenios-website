# HL-11: approved 424-variant catalog, retained identity authority

Local implementation on the continuing
`codex/xenios-health-launch-implementation-20260930` branch. Not price release,
independent acceptance, managed qualification or permission to deploy.

Runtime source: `4cba24af1d42ad59fe44856859cc1721846e6df5`.
Runtime tree: `6395273fc4370b7df713a2b72b019785f547d1fb`.
Test-only tip: `fbfa12bfc0c18dd433fc6eafbbab571b298f5f72`.
Inherited release-control commit: `9ce940f6914a957e244dac95ff2b0252550bd2b8`.
The main materialization is `9c3358b8aecfb91f59629ee99c43d99201fc4a78`, with
tests `fe306740b146e644ded7fa74767657b07a0c3f68`. The final source/test pair
adds only an exact-identity display fix and its regression. All four commits
are pushed. Their union changes 20 source/build/data paths and 15 test paths,
no migration, route, protection baseline or release-control setting.

## Source and identity

The original workbook is unchanged. Its raw-byte SHA-256 is
`6478ad0d3f710b75c6bf0c5f5e56ff1189ab2a2a4439cab23c2a28498134ea6f`.
The private exporter reads all426 source rows into ignored local scratch. The
reviewed reconciliation keeps424 canonical variants, with explicit provenance
for GRP-0402 -> GRP-0426 and GRP-0407 -> GRP-0425. All source rows remain evidence;
supersession does not delete a workbook row or a Product Control record.

The prior420-variant artifact came from a different workbook edition, hash
`1be4f6720675fc6b90c172d52c19d2fb9a8d53f5beab6592ca96c701119c791d`.
It is not relabeled as the approved426-row source. Exact predecessor blobs are
pinned at `3416f8de6a58e9ea0fdf4e1c77bab4421e010df2`:

- Catalog canonical Git-blob SHA-256:
  `b8634a5d1c1e02bade42661eeefaa2d8321e76e750178f932d0ae4c8b3178643`.
- Binding canonical Git-blob SHA-256:
  `587595e68cb1b47a8ee7f55728eb65d64c2f55f36ad242080232743a9c53ae24`.

The identity delta is 420 predecessor - 2 superseded + 6 new = 424, equivalently
418 retained + 6 new = 424. The new
source identities are GRP-0421 through GRP-0426. Their identities are generated
from untouched source fields, not customer-facing rewrites or row offsets.
The previous417 Product Control pairs become415 active retained pairs and two
archived pairs. No UUID is transferred to a new identity. Nine rows remain
unbound: six new identities, two genuine quote-only rows and one shipping row.

Historical417-pair MD5: `062a30f0d3d0a0571e78837b5b92d4f6`.
Local retained415-pair MD5: `86fdd019d3153e75920090136579b184`.
Both digest sorted `productId|variantId` lines. The second is a local subset
calculation, not a fresh production measurement. The original binding read-back
at2026-08-15T05:05:00.000Z is preserved verbatim. The separately dated price
fixture was observed2026-08-20; it is not current production truth.

## Authority and presentation are different contracts

The real-reader local fixture now has423 customer rows:

| Presentation | Count | Meaning |
| --- | ---: | --- |
| Numeric Research price | 173 | Existing retained Product Control binding and fixture price |
| Care price withheld | 242 | Canonical price retained, hidden from the Research projection |
| Quote-only | 2 | BAM15 and Syringes & Alcohol Swabs |
| New identity awaiting binding | 6 | Visible, no borrowed UUID or invented price |

The prior419-row fixture was175 numeric +242 Care-withheld +2 quote-only.
The change removes two superseded priced identities and adds six unbound source
identities. Neither the earlier244 null prices nor the current250 null prices
are all missing-price defects. Every bucket is asserted separately, with exact
identity, no-zero, purchase refusal and exhaustive submit fingerprint checks.
The full424-row artifact preserves GRP-0364 FedEx; its stable identity excludes
it from the423-row customer merchandise projection. Shipping stays separate.

The six new rows have no approved binding publication in this slice. Recorded
price decisions remain intact: the17 approved display-cent rounding decisions,
Tesamorelin16927, Hexarelin6250 and Oxytocin10750. None is manufactured into a
new live price row. Retatrutide ladder review, component-split evidence,
quantity tiers and affiliate decisions remain distinct unresolved work.

GRP-0422's display label loses internal `split pending` wording only after raw
identity hashing. Its exact variant ID remains
`mov_f61758881da2b7bfa539`; both action and assisted-order list/submit paths apply
the same structured hold independently of editable wording. GRP-0080 retains
its original identity and previously approved colon presentation.

The server reads one exact pinned reconciliation filename, never whichever
filename sorts newest. Dataset metadata carries that record's normalized-LF
UTF-8 content SHA-256; the current value is
`d63eade14720c36547fe07b17f954000cc704094a376f246352757af33597976`.
Only CRLF is normalized. JSON whitespace/key order changes remain significant.
This policy is not used for raw workbook checksums or canonical migration bytes.

## Local qualification and limitations

The real exporters and runtime reader passed424 offerings/424 variants. The
retained binding generator passed415 active/9 unbound/2 archived and scanned
for private source values. No confidential private intake is committed.

The six-file whole-catalog run passed87 tests with one expected conditional
inverse-availability skip, exit0,13.83s, under private Nodev20.19.0. All423
customer rows resolved again at submission with identical fingerprints.
The action census passed157 RUO,242 provider request,2 availability review,
42 activation request,6 pricing request and131 direct order request. The
separate merchandise Add to Cart matrix remains zero in current presentation;
hypothetical publication counts are not active purchase availability.

Earlier failed runs remain separate: the coverage run's expected timestamp
literal lacked the original milliseconds, and the initial explicit-root
reader regression lacked a pinned authority lookup in the selected root.
The later compatibility reproduction separately failed three cases before
the revision/scan reader paths supplied the same pinned authority. Those failed
runs are retained, not combined with the passing reruns.
Compatibility regressions passed104 tests/eight files. The broader actual
catalog/assisted-order/client run passed1367 tests with13 conditional skips
across83 passing files/one skipped, exit0,169.98s. Its application/test source
was stable throughout the precommit run. Typecheck/build and final aggregate
qualification are recorded at the final exact-SHA checkpoint, not inferred
from these focused results.

Precommit typecheck passed in67.914s. A final generator-only ordering adjustment
then preserved the predecessor order of the415 retained bindings, reducing diff
noise without changing identities; its binding/whole-catalog run passed36 tests
across three files in8.18s.

The clean build at `ea452a2d15a479b45a1abc359eafbbcc82217ce8` failed, exit 1,
because the permanent no-em-dash gate rejected an escaped em-dash input matcher.
That failed run is retained as `hl11-build-final`; it is not a passing build.
The narrow successor selects the already-approved colon label only for the
exact original offering and variant IDs. It does not weaken the gate, change
dataset output, or infer identity from a row number alone. The regression run
passed 35 tests across three files, exit 0, in 6.52 seconds.

Clean checkpoint `fbfa12bfc0c18dd433fc6eafbbab571b298f5f72`, tree
`80b59f68209ff6f2c2aed0988f315943109c565b`, passed typecheck in 8.607 seconds
and build in 39.354 seconds. The unchanged no-em-dash gate scanned 1,345 source
and 225 production-build files with zero forbidden forms. The resource-controlled
aggregate ran from 2026-10-01T08:00:09.322Z to 08:19:42.263Z on that clean
checkpoint using one worker and no file parallelism: 18,889 PASS / 5 FAIL /
85 SKIP, 1,006 passing files / 3 failed / 6 skipped, exit 1, 1,171.51 seconds.
Four assertions still expected the old catalog census or label-based missing
rows; the fifth is the unchanged protected-seam baseline assertion. No timeout
occurred. This failed run is preserved in `HEALTH_HL11_QUALIFICATION_20261001.json`,
log SHA-256 `a603add1c5c8ffd21b351ce66391a5b167ebbe06efa3056a5ecde4c6f82fc9a0`.
Source and tests remained frozen during the run; intermediate HEAD changes were
records only. The census correction and subsequent qualification remain pending.

The binding generator also reproduced and repaired an identity-only schema
gap: unexpected fields could survive a reviewed input spread. Exact five-field
validation and allowlisted copies now cover both retained and archived bindings.
The actual generated artifact never contained those extra fields. The seven-pass,
two-fail reproduction and ten-pass fixed run remain distinct evidence.

The prior N2 aggregate at03bf593 was18,856 PASS/1 FAIL/85 SKIP, exit1. It remains
separate and does not qualify this catalog successor. Its sole unchanged
protected-seam assertion must not be relabeled as a pass. No protected baseline,
global timeout, conditional skip or release gate is weakened by this slice.

No fresh production price/availability/role read occurred. Positive price
doubles in coverage are test fixtures, not replacement prices. There is no
new browser/zoom, managed PostgREST, hosted email or live checkout evidence.
Superpower and Mito Health remain Coming soon only. Imagery candidates and the
separate media-commerce-decoupling branch are not integrated or approved here.

## Local reproduction

Use the pinned private Node20.19.0 executable and npm10.8.2. The environment
variable below is process-local, not a hosted configuration change:

```powershell
$nodeExe = 'C:/Users/sboad/.codex/tmp/node-v20.19.0-win-x64/node.exe'
$env:PATH = "C:/Users/sboad/.codex/tmp/node-v20.19.0-win-x64;$env:PATH"
$env:XENIOS_MASTER_OFFERINGS_DATASET = (Join-Path (Get-Location) 'server/research/master-offerings/data/member-safe-master-offerings.generated.json')
& $nodeExe node_modules/tsx/dist/cli.mjs scripts/research/verify-master-offerings-dataset.ts $env:XENIOS_MASTER_OFFERINGS_DATASET 424 424
& $nodeExe node_modules/vitest/vitest.mjs run server/research/master-offerings server/research/assisted-order client/src/research/assisted-order shared/research/master-offerings/pathway-authority.test.ts --maxWorkers=1 --no-file-parallelism
& $nodeExe node_modules/typescript/bin/tsc --noEmit
& $nodeExe 'C:/Users/sboad/.codex/tmp/node-v20.19.0-win-x64/node_modules/npm/bin/npm-cli.js' run build
& $nodeExe node_modules/vitest/vitest.mjs run --maxWorkers=1 --no-file-parallelism
```

Generation additionally needs the exact original private workbook, its private
export and the pinned predecessor blobs. Do not replace missing source evidence
with hand-authored rows. The new `--retain-reviewed` mode verifies full ancestor
SHA and canonical Git blobs, then keeps only exact reviewed pairs. It does not
query or write a database. Exact executed generation arguments and log hashes
belong in the final qualification receipt.

## Independent handoff and remaining work

Claude should independently review the exact successor and policy delta,
especially raw identity versus presentation, held submit resolution, retained
binding provenance, superseded identity denial and absence of implied price
release. N2/F4/HIST payment review retains priority if both are ready together.
Sending a packet is not evidence of execution or acceptance.

Remaining work includes provider-neutral durable attempts/authenticated event
journal, N2 void/refund and historical outcomes, independent exact successor
review, protected-seam owner decisions, public/account/partner/supplier/admin
journeys, product details and reviewed imagery integration. Managed staging and
production still require their existing exact-SHA authorization and gates.
No hosted changes, migration apply, real email, money, procurement, clinical
action, price release, account grant, merge or deployment occurred.
