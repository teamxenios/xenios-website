# Accepted-source integration `756a906`: final bounded review (part 2 of 2)

**Decision: SOURCE ACCEPT** for the accepted-source composition. Evidence is sufficient for **source-integration
acceptance**. **Release qualification is NOT complete.** This is not production readiness, real-purchasing readiness,
or founder/hosted-action approval.

Reviewer: this session, `claude-fable-5-1`. Per the coordinator the CLI was launched with `--effort max`; the
configured effort independently observed from inside this session was `xhigh` (doc 34), and no higher actual runtime
setting is claimed. Read-only: Git objects from `C:/xenios-wt/health-review`; the integration branch was not checked
out or edited, and no tests, builds, databases or browsers were launched for this part.

Revision note: first pushed at `04cbbee`. This revision corrects the focused-set overlap count in the PS-R1/PS-R5
section, restates the effort disclosure, and removes any reading of the later-slot aggregate note as advance acceptance
of failures. Decision, bounds, holds and all other figures are unchanged. No test, build, browser or database rerun.

## Identity (verified)

| Item | Value |
| --- | --- |
| Integration source | `756a906877dbc174b7e228a259d2faa9c3af48ca`, tree `787432948d9464880df1dcfc5dff58eec7d889aa` |
| Evidence commit | `fc53751ff7a988d029d5dabbd9f24f1431b62d19`, tree `d8a60128db5e98d6f4035c48051d062cb206b8a2` |
| Handoff commit (branch tip) | `38c723964358c18b8c5090f2f9a0aa92f74601b0`, tree `48f3fc4793f01978f7aae1b16ad7954737169d66` |
| Branch | `codex/accepted-source-integration-20261005`; history `3eaa017 → 66fda5c (lease) → 756a906 → fc53751 → 38c7239`, linear |
| Records-only successors | `fc53751` and `38c7239` touch only `docs/` and `.xenios/`; `client/`, `server/`, `shared/`, `supabase/`, `scripts/`, `package.json`, `package-lock.json` trees are identical to `756a906` |
| Base | `3eaa017fcbd28989c65ffc4bb439a554aa1f3f59` |
| Prior parts | doc 33 (acceptance chain, `42d8b6d`), doc 34 (source composition, `e939d68`) |

## Results by area

| Area | Result | Basis |
| --- | --- | --- |
| 1. Composition identity | **PASS** | Doc 34 file-by-file proof (65 paths: 55 exact single-lane, 8 MC-01 files correctly in D/E form, 1 hand-merge, 1 test superset, 0 dropped, 0 extra, no Finance). The producer's `composition-invariants.json` (65/65 pass; 63 exact; the same two intended differences) and its 12-input ledger agree. Records are the only non-runtime additions. |
| 2. Core bytes and protection | **PASS** (bytes) / **FAIL expected** (gate) | Navbar `6cdfbb0f…`, Footer `420b45dc…`, index.css `b475a8ee…` at `756a906` equal the pending approval pairs. Manifest, `static.ts`, `App.tsx`, `server/index.ts`, `server/research/index.ts`, ledger, DAG, release-control map, package files identical to base. Bounded gate (`3eaa017..HEAD`): 69 changed = 37 allowed + 4 infrastructure + 3 seam + 25 tests; hash FAIL on exactly the three authorized files plus inherited `static.ts`; seam notices App/server/index/research/index inherited. Default gate (origin/main `6077a6b`): 26 out-of-zone paths, every one unchanged between base and candidate (**0 new**). No new regression. Founder hash approval and GATE-01 remain unresolved. |
| 3. Invariant preservation | **PASS** (static) | Lane bytes are exact, so the fork verdicts carry: IC-2 neutral timeline (`assisted-order.css` = `c93bf5a` blob), admin isolation, `brand.ts` display-only name, partner `returnTo` literals with the unchanged `safeResearchReturnTo` allowlist, D/E IC-3 fallback and the DE-R1 renderer-only lifetime exception with the 300 s timer cap (`ProductMedia.tsx` = `e6a8171` blob), `ProductPage` `product={null}` with no create control. The one hand-merge (`AssistedOrderPage.tsx`) is exactly Core's customer class plus D/E's media slot. |
| 4. Receipts and provenance | **PASS** | All **44** `evidence-index.json` entries re-verified by byte length and SHA-256 against blobs at `38c7239` (independent of the coordinator). All 8 completed jobs: `head 756a906`, `tree 78743294`, dirty start/end empty, exit code as reported, `logHashMatches true`. Provenance samples: 47 of 47 sampled processes run `node-v20.19.0-win-x64\node.exe` (sampled, not continuous). 49/49 focused-test bindings equal the committed blobs. |
| 5. Tool gates | **PASS** / **DEFERRED** | Typecheck exit 0 with an empty log (sha256 of empty = no diagnostics). Build exit 0: 1,357 runtime and 228 build files, zero forbidden forms; dist inventory 349 files, `17a26c8f…`. Routes 462/453 PASS. DAG 53 nodes PASS. **Full aggregate DEFERRED** on resource pressure (805 then 1,452 MiB available; 27.31 GiB disk); no pass and no source failure inferred. |
| 6. Browser | **PARTIAL** (bounded, honestly scoped) | Production client over the real `researchPageGate`/`serveStatic`, loopback-bound, GET/HEAD only (405 otherwise), outbound sockets denied, CSP restricted, synthetic unsigned read fixtures. Zero document overflow at measured 1440/1024/**767**/430/390/320 on 8 routes; exact 768, native 200%/400% and CLS unproved; forced-colors via CDP emulation only; keyboard focus to "Xenios Health home" with the 2.5 px purple outline. Fallback text exact, no `role="img"`, 1:1 square measured; no onError trace, no delivered-byte proof. Preview stop: TTY exit 1, **no** `INTEGRATION_PREVIEW_STOPPED` event in the log, result receipt absent (index flag false); PIDs absent; 349 snapshot files rehashed unchanged. Not live Auth, partner activation, purchase, payment or production data proof. |

## PS-R1 and PS-R5

- **PS-R1: CLOSED.** `integration-subscription17-run1-{start,result}.json` run the exact 17-file set at clean
  `756a906`/`78743294`: 17 files, **401 passed, 0 failed, 0 skipped**, exit 0 (log sha256 verified via the index).
  The 17 paths are **identical** to the subscription lane's own focused set in `03b72f8`
  `focused-run1.json`. The earlier 377+23 split and the 396/3 failed receipts remain historical.
- **PS-R5: CLOSED at adapter level, with an explicit limit.** At `756a906`
  `client/src/research/adapters/product-subscription-create.test.ts` parameterizes the canonical refusal over
  `it.each([400, 403])`, asserting `kind: "denied"`, `code: "capability_disabled"` and exactly one fetch. The file ran
  and passed in both the 17-file (401) and 36-file (626) runs. Exactly one case was added: 401 = the lane's 400.
  Limits: the statuses are real `Response` objects behind a mocked fetch, not a live HTTP server; the archived Vitest
  logs are summary-only (247 and 1,084 bytes), so the per-case lines are not in the log and the case-level pass is
  established by exit 0 / 0 failures plus the committed test bytes.
- The 36-file affected run (626/0/0, exit 0, clean `756a906`) includes all **25** test files changed since base. The
  17 and 36 sets share exactly **4** files and cover **49** distinct files; the counts (401 and 626) are not additive.
  Evidence note (correction of 2026-10-05, recomputed from the `command` arrays in
  `integration-subscription17-run1-start.json` and `integration-affected-run1-start.json` at `38c7239`): the shared
  files are `client/src/research/product-subscriptions/ProductSubscriptionCreate.test.tsx`,
  `client/src/research/adapters/product-subscription-create.test.ts`,
  `client/src/research/pages/member/ProductPage.subscription.test.tsx` and
  `server/research/commerce/subscription-intent-journey.test.ts`. The 49-file union equals, path for path, the 49
  entries of `focused-source-bindings.json` (0 extra, 0 missing). The first push of this record (`04cbbee`) said
  "7 shared files"; that count was wrong and nothing else in the record depended on it.

## Findings

- **P0:** none. **P1:** none. **P2:** none.
- **P3-1 (evidence):** Vitest logs were archived with the summary reporter only; future receipts should use
  `--reporter=verbose` or JUnit so per-case results (for example the PS-R5 400 case) are readable directly.
- **P3-2 (records):** the handoff could not locate the historical ENOSPC aggregate receipt. It exists on the finance
  branch at `b13c29e`: `server/research/assisted-order/finance-sprint-20261003/evidence/runs/full-20261005-01/`
  (`receipt.json` sha256 `bc5d395c511a0de9171f2bf243de71869e48b908eea85eb5ed3682d33d09eb36`; exit 1; 16 failed /
  1,007 passed / 6 skipped files; 2 failed / 19,078 passed / 85 skipped tests; stdout sha256 `d6837b2f…`). It was
  run at finance source `dfd8b9b`, not at this candidate. Records-only follow-up; do not relabel.
- **P3-3 (provenance):** README mentions about 304 MiB available during typecheck; the retained deferral receipt
  holds only the later 805/1,452 MiB samples (coordinator already flagged). The later samples still justify deferral.
- **P3-4 (carried, not new):** "admin unchanged" is true for the Core customer-style boundary only; accepted MC-01
  intentionally changes the Product Admin media notice, whose copy overstates runtime behaviour until the MC-01 SQL
  chain is applied (doc 32 MC01-R1).

## Carried release holds (none resolved here)

- **Founder:** exact approval of the three protected hash pairs; GATE-01 / Access Hub disposition; intended
  subscription SKU/plan, quantity policy (effective cap 50 enforced) and product plan.
- **Subscription:** all six real-buying gaps OPEN (durable create idempotency, referral lineage, decisive current-price
  validation, canonical eligible-offer projection, durable production activation/currentness, independent payment
  finality); PS-R2 and PS-R3 server holds; test-only persistence seam preserved.
- **MC-01:** persistent-cart predecessor chain → reviewed candidate → non-image Product Control re-approval → separate
  launch transition, with preservation/adoption where cart history exists. SQL candidates unregistered and unapplied.
- **D/E:** delivered-byte/hash integrity, canonical readers, metadata ingestion/review writer, descriptor SQL execution
  and runtime qualification OPEN; fallback-first only.
- **Finance:** excluded from this candidate; F1, refund/dispute, ADP-G2–G4, LENS adoption OPEN; ADP-G1 PARTIAL; no
  provider, payment, commission, payout or notification authority enabled.
- **Qualification:** full aggregate (resource-deferred), protection gate red pending founder approval and GATE-01,
  exact 768 / native zoom / CLS / native forced-colors, inherited seam findings.

## Minimum re-execution for a later serialized slot (not required for source acceptance)

1. Full aggregate at exactly `756a906` on a quiet host (about 2 GiB free RAM, 20 GiB disk). The inherited protection
   assertions are expected to fail for the known reasons, but no failure is accepted in advance: every failure in that
   run must be examined and attributed before the run counts for anything.
2. Re-run the two focused sets with `--reporter=verbose` to archive per-case PS-R5 evidence.
3. Browser qualification at exact 768 and native zoom when a native helper is available.

## Next bounded action for the existing owner

Samuel's explicit approval of the three old→new hash pairs; then the Core protection owner re-cuts the manifest in its
own records-only commit on this lineage, which Claude verifies. Separately, Samuel's GATE-01 disposition. Nothing in
this review authorizes database execution, real data collection, payment or provider activation, partner activation,
imagery publication or deployment.
