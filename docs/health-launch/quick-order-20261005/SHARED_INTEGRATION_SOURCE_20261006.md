# Quick Order shared integration — source-only checkpoint

Pushed source: `9118a82633e9f10637764c896ce2a6e53ad1e3eb`.
Tree: `5142b61564921cbe892099c8ef55896935508fa9`.
Exact nine-path source receipt: `evidence/shared-integration-source-9118a82.json`.
The earlier static-draft receipt predates the applied UI amendment; it is not the
final source inventory. Tests NOT RUN; independent acceptance PENDING.

Source diff whitespace checks passed. The records diff flags the literal blank
context line at the end of the retained UI patch as trailing whitespace; those
bytes are required to preserve the approved patch hash. Records excluding the two
literal patch artifacts pass `git diff --check`.

Authority is Samuel's actual bounded source approval at coordinator
`dc3329bb2cfb3b93d8d054c8bbc77a291df0e671`, exact packet `1d4f2c3`.
The six-file patch has SHA256
`b7427650d987954e12d88df1a118a646d3498aaab19a902e3ad562150ca0f15f`.
All six current before hashes matched; both new test paths were absent; current
389a and 3221 active leases had no conflicting writer. The same builder lease
was extended by exactly eight paths. Pure decoder checkpoint `10208fe` and
records `e7e3d44` remain separately reviewable.

The approved patch wires the existing admin repository through the proposed
service-only wrapper, then runs both the strict QO envelope decoder and existing
canonical detail decoder. Existing `read_all` and status/finance guards remain.
The canonical status update preserves immutable intake and marks notification
observation stale. The UI refreshes it once; failed refresh does not resubmit a
saved mutation. The renderer accepts only a request UUID and public reference
under the exact schema and derives its link from the fixed trusted origin.
The dispatcher loop and legacy renderers are unchanged.

The only compatible amendment to the pure module is the exported name
`QUICK_ORDER_ADMIN_DETAIL_RPC = "research_health_quick_order_admin_detail"`.
It is a proposed dependency, not an installed function or deployment permission.
Four approved patch targets retain exactly the original approved contents. The
two UI targets additionally contain the separately recorded current-affiliate
readback amendment below, directed within the same approved paths.
The two new test files use synthetic infrastructure with real repository/service/
route and renderer/dispatcher code. Their source is authored; execution is NOT RUN.

## Additional test fixture amendment, not applied

Source inspection found four existing provider-hold cases in
`server/research/assisted-order/provider-journal-http.test.ts` whose RPC stub only
handles the old reader and returns a partial legacy object. The new reader would
reach that stub's unexpected-RPC exception before its financial-hold assertions.
This is a static inference, not an observed failure. That file is outside this
assignment and remains untouched.

`PROVIDER_JOURNAL_FIXTURE_AMENDMENT_PROPOSED_20261006.patch` is the exact proposed
test-only correction: handle the new wrapper name and wrap the same legacy detail
in explicit null submitted-event/enrichment evidence, including its canonical
source/currency/nullable declared-code fields. Existing 409/no-effect assertions
remain unchanged. `git apply --check` passed; no application/test code was run.
Before/after and patch hashes are in
`evidence/provider-journal-fixture-amendment-proposed-20261006.json`.
This extra path requires the coordinator's recorded scope amendment before edit.

## Current affiliate readback amendment, applied within approved paths

The original approved UI patch hid the canonical affiliate block on Quick Order
rows. Its replacement shows the immutable initial review state under the label
"Attribution review." A later canonical `matched_manual` or `invalid_ignored`
state would therefore disappear while the original unmatched label remained.
Refresh could not repair this because the intake is intentionally immutable.

`CURRENT_AFFILIATE_READBACK_AMENDMENT_PROPOSED_20261006.patch` restores the current
canonical block and labels the declaration review as recorded at submission. It
amends only the existing UI and its named test, leaving OperatorDeclarations and
all trusted-attribution/commission authorities untouched. The added cases retain
the initial state alongside later matched/ignored code states. Exact target and
patch hashes are in the corresponding proposed and applied evidence JSON.
The coordinator directed this exact correction within the existing approved
source paths. Patch/before hashes were rechecked, it was applied, and both after
hashes matched. Its tests are NOT RUN. This is source implementation only; actual
operator readback and independent review remain unqualified.

## Qualification and deployment boundary

**Do not deploy this reader cutover before the future wrapper is installed and
qualified.** Missing RPC or evidence is an error, never a legacy fallback. This
source does not implement SQL, durable storage/currentness, commit RPC, authority
publication, actual operator readback or notification delivery. No durable or
operational claim follows from the synthetic fixtures.

G1 remains consumed/refused/released at 17:54:58Z with zero test processes. No new
resource observation, reservation, syntax check, typecheck, build, browser,
database call or transport was performed. Mandatory HTTP red/green evidence is
still pending. SQL naming/fence review, final protected hashes/manifest/GATE-01,
Health legal/classification/destination/standing inputs and all managed actions
remain separate. The four composition test paths are not in this slice.
