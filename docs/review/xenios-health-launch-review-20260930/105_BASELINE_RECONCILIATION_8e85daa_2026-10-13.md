# Production-baseline reconciliation on the release candidate (`8e85daa`): bounded applied-diff review (QS-R3)

**SOURCE ACCEPTED WITH NAMED LIMITS. The applied change is byte-for-byte the frozen seven-path proposal Samuel
approved, stays inside every clause of that approval, weakens no test, and every new identity literal traces to the
authorized provider readback. Two conditions are owed before it can carry a release: no qualification has yet been
executed at this SHA, and the same production identity was already reconciled differently on the records, board and
review lineages on 2026-09-26, so the two records must be reconciled before any merge in either direction. Nothing
here is qualification or deployment.**

Reviewer: this session, `claude-fable-5-1`. Reviewed on sight: the approval text orders "register the bounded
review", the records say the successor was sent to the coordinator for registration, and no board entry names this
candidate to me yet. Controlling: doc 104 (`db7ed35`, companion bound at `5817055`), doc 103 (`2795ce8`).

**Target:** `8e85daa156ab04837fc5bfb73c0e661bba83cfee`, tree `25507c2f1568c35dc4984555ec619f2ed03a8219`, one commit on
`3dd3d9667…` (tree `7a4ce7c3…`), branch `codex/doc104-production-baseline-reconciliation-20261013` (local only, no
origin ref), committed 2026-10-13 11:11:43 CDT under the shared machine identity. Board tip read `074364a`; records tip
read `a8f4e42`.

**Method.** Mechanical checks by me (pre-images, apply, post-images, hashes, lineage), then three read-only lenses
(validator and test semantics at the successor; scope, authority and custody; completeness and build/evidence
consequences), each with an adversarial verifier, then a completeness critic: seven agents, 220 tool uses, nothing
executed. Archive: `hl12/105_baseline_reconciliation_review.json`.

## 1. Source scope: exactly the approved proposal

- **Seven blobs, nothing else.** `git diff-tree -r 3dd3d96 8e85daa`: `ACTIVE_RELEASE_GRAPH.json` `eaefcc0c→1ffbedd8`,
  `ACTIVE_RELEASE_GRAPH.mmd` `ba0917c6→df4dd368`, `CURRENT_PRODUCTION_STATE.json` `2ac56c2a→aa78d599`,
  `CURRENT_PRODUCTION_STATE.md` `791d4f29→6151766a`, `FILE_OWNERSHIP.json` `035c61be→f92824fe`, `MIGRATION_DAG.json`
  `e1a2c7af→8d85ef1c`, `server/release-control-plane.test.ts` `aa27c53a→9ca5f3cc`. Every "from" blob is the `3dd3d96`
  blob; every "to" blob is the decision record's `after.gitBlob`; the LF post-images hash to the decision's
  `after.rawSha256` values; the applied hunks equal the frozen patch (sha256 `e5fffc31…`, 21,264 B, 7 files, 17 hunks,
  +62/−26; the decision's "+57" undercounts) per file. Applying the patch myself to the `3dd3d96` blobs reproduces the
  same bytes.
- **Content.** Trusted baseline `c545a70` / `dep-dag8l567bikc738a1nj0` (2026-09-14 record) → `79414143` /
  `dep-daqft3vf3r2c73b7e88g`, live since 2026-09-24T10:43:29Z, reconciled/verified 2026-10-13T13:49:12Z, in the five
  machine inputs and two human mirrors; the old `c545a70` evidence row moves intact from `evidence` to
  `historicalEvidence`; the old `deployTrigger` text survives in that row; graph node `production-c545a70`
  → `SUPERSEDED_AUDITED_BASELINE`, new node `production-79414143` (`AUDITED_BASELINE`) and one edge; `FILE_OWNERSHIP`
  and `MIGRATION_DAG` change only `productionBaselineReconciledAt`/`productionSha` plus one appended DAG note; the test
  changes `PRODUCTION_SHA`, one comment, the single `AUDITED_BASELINE` node-id expectation and two
  `productionBaselineReconciledAt` expectations. No `expect()` removed (180 before and after), no negative control
  changed, no runtime, dependency, lockfile or ownership-rule change.
- **Within the approval.** Board `074364a` records the approval text (987 B, sha256 `2834b8fa…`, decision identity
  `7e4b4b9d…`, patch `e5fffc31…`, base `3dd3d96`) with provenance (thread/message identifiers; human timestamp not
  separately exposed). Its instructions: unchanged proposal, seven paths, complete pre-images and current custody
  verified before applying (records `SOURCE_HANDOFF.json`: all seven pre-images and all fourteen fixtures matched);
  baseline still matches the provider (`PRODUCTION_PROVIDER_CURRENTNESS.json`: service and deployments re-read at
  16:08–16:10Z, still `79414143` / `dep-daqft3vf3r2c73b7e88g`; an owner record, not a Git-verifiable fact); runtime,
  dependencies, lockfile, historical evidence, negative controls and unrelated ownership records preserved (verified
  above); no test weakened, no expansion; applied through the existing owner in an isolated successor (one-time custody
  `6b4775a` 16:10:40Z → source `8e85daa` 16:11:43Z → custody returned `02e1fca` 16:14Z; registry restored to its
  pre-image hash `b0fb285c…`); "perform the affected qualification" and "register the bounded review" are owed
  (section 2); "document any permitted reuse" is addressed in section 2.
- **Provider consistency.** Every new identity literal (`79414143…`, `dep-daqft3vf3r2c73b7e88g`,
  `2026-09-24T10:43:29.274153Z`, service `srv-…dfcg`, workspace `tea-…ocj0`, branch
  `release/early-access-code-session-checkout`, 13:49:12Z) is present in the cited readback (sha256 `f70e0fed…`). The
  new node's owner string "Website 2 / release-manager", the node type/state words and the edge relation are author
  prose, not readback content.
- **Validator and test semantics (static).** All 19 assertions in the patched test that read the control-plane
  records hold against the patched files; `SUPERSEDED_AUDITED_BASELINE` is an opaque string to the validator (it
  matches only `AUDITED_BASELINE`/`PROHIBITED`); `historicalEvidence` is ignored; `lastSuccessfulValidation` is
  absent, so its check is unreachable; the deployment id matches `RENDER_DEPLOYMENT_PATTERN`; `validateMigrationDag`
  resolves the two `sourceSha`-less entries at `79414143`, whose blobs are identical at `c545a70`, `79414143` and
  `3dd3d96` and hash to the recorded checksums; `79414143` is in the successor's ancestry (13 commits); neither `tsc`
  entry point can fail on literal-and-comment changes; the protection gate classifies the six `docs/` paths as
  infrastructure and the test as a reported test file, and no pinned hash covers any of the seven; no control-plane JSON
  is embedded in the production build (`script/build.*` and the runtime consumer read none of the changed files at
  build time), so the `dist` identity of `3dd3d96` is expected unchanged. These are predictions from source, not
  evidence.

## 2. Execution evidence at `8e85daa`: none yet; what is owed and what transfers

The records state `newTestRuns 0`, `newBrowserRuns 0`. Owed at this SHA, from a full-history checkout whose HEAD
descends from `79414143`, each with runner identity, input hashes and a finite window:

1. `npm run check:release-control-plane` (tsc over the acceptance scripts and the changed test).
2. `vitest run server/release-control-plane.test.ts`, including the canonical-checksum case that shells out to
   `git cat-file blob 79414143:…` and the validator's `merge-base --is-ancestor`.
3. `vitest run server/research/assisted-order/audit-store-sql.test.ts server/research/inventory-admin/integration.test.ts`
   (the only other readers of `MIGRATION_DAG.json`).
4. `npm run verify:migration-dag`.
5. `npm run verify:production-state` with the explicit expected identity (`79414143`, head `8e85daa`, branch
   `release/early-access-code-session-checkout`) — **valid only between 2026-10-13T13:44:12Z and
   2026-10-20T13:49:12Z**; afterwards `STALE_PRODUCTION_EVIDENCE`/`STALE_EVIDENCE` fire (QS-R6).
6. `node scripts/acceptance/verify-core-site-protection.mjs 79414143… 8e85daa…` (explicit two-argument form; 17
   paths = doc 104's ten plus these seven; predicted 3 allowed / 8 infrastructure / 5 test / 1 seam, PASS). The doc 104
   ten-path receipt does not transfer. CI's default `origin/main` base is not comparable (3,398-path diff; pre-existing).
7. The QS-R2 release manifest regenerated over the exact 17-path `79414143..8e85daa` delta.

**Reuse I accept on input identity (reasoning, not pin matches), per the approval's "document any permitted reuse":**
`npm run check` (tsconfig excludes tests; no `docs/` input); static route uniqueness (server/shared runtime trees
unchanged); the targeted pair 91/91 and the whole-36 companion (neither reads any of the seven paths); the literal
render-build with `npm ci` and its 346-artifact inventory `a5a4ed43…` (no changed file is a build input); full-suite R5
except the three vitest files in items 2–3. The R5 receipt pins the worktree, so this is reviewer reasoning, as in
doc 104.

## 3. Release-side conditions (not source)

- **QS-R5 (P2, new, decision for the control-plane owner).** The same production identity was already reconciled on
  2026-09-26 on every lineage except the release candidate's: `0f92ca7` moved the four control-plane JSONs to
  `79414143` / `dep-daqft3vf3r2c73b7e88g` (verifiedAt 2026-09-26T19:14:17.985Z, four evidence rows, `c545a70` typed
  `historical_production_baseline`/`HISTORICAL_SUPERSEDED_BASELINE`) and `2b4888e` moved the test; the records
  (`a8f4e42`), board (`074364a`) and this review branch all carry that version, while `3dd3d96` (merge-base with all of
  them = `79414143`) predates it and still said `c545a70`. `8e85daa` therefore fixes the release lineage with a
  *different* reconciliation (13:49:12Z, one evidence row, `SUPERSEDED_AUDITED_BASELINE`/`production_baseline`). A
  merge in either direction conflicts on five of the seven paths (both `.md`/`.mmd` mirrors are untouched elsewhere).
  The decision record did not disclose the existing reconciliation. Before `8e85daa` or any descendant is merged or
  pushed toward those lineages, one record must be chosen and the test re-pinned to it; the release lineage is the one
  that deploys, so this does not block qualification of `8e85daa` itself.
- **QS-R6 (P2).** Time-boxed validity: the manual `verify:production-state` CLI passes only until
  2026-10-20T13:49:12Z; the vitest suite derives its clock from the record and cannot detect expiry. A release after
  that date needs a fresh provider read and another seven-path change.
- **QS-R7 (P2).** The approval's "still matches the authorized provider readback" was met at application time by an
  owner re-read at 16:08–16:10Z; any deployment must re-check immediately before it, as the readback itself says.
- **Carried from doc 104 §3, now binding to `8e85daa`/`25507c2f`:** QS-R1 (second authority message untranscribed);
  QS-R2 (manifest, now 17 paths); QS-R4 (delivery of the successor to the deploy path, deploy-time build log showing
  `npm ci`, served `RENDER_GIT_COMMIT`); QS-2 — the records now designate a primary operating owner but record
  `runbookReadAcknowledged false`, `operatingCoverageAttested false`, `verifiedAccess false`; the attestation must come
  from that named person with verified queue access, and I will not treat a designation as an attestation; browser
  lost-response journey and admin PATCH refusal (capacity hold persists; the one helper tree found idle was 36 MiB);
  staff readback; Samuel's current release authority with destination, rollback and no-overwrite checks (the rollback
  caveat — `79414143` predates the QL-12 payment hold — is now written into the patched state record).

## 4. Named limits (P3)

- `ACTIVE_RELEASE_GRAPH.mmd` mislabels: it marks `3814c68` as `SUPERSEDED_AUDITED_BASELINE` and draws
  `LIVE3814 → CURRENT794`, whereas the JSON supersedes `production-c545a70` (the mirror has no `c545a70` node). No
  reader; human mirror only.
- The patched state's evidence row and the `.md` cite the readback at records commit `d1da8f22`, which is not an
  ancestor of the successor; the board's identical copy is not cited.
- The stale narrative comment at test lines 47–49 remains above the new constant; cosmetic.
- Derived records still say `c545a70`: `docs/platform/XENIOS_SITE_SYSTEM_OF_RECORD.*`, `.xenios/PROJECT_STATE.json`,
  `.xenios/RELEASE_STATE.json`; no gate cross-checks them, but an admin surface reads the generated record at runtime as
  the last verified production SHA. Follow-up outside this custody.
- No archive of the superseded state/graph into `docs/coordination/history` and no new `historicalSnapshots` entry,
  unlike earlier baseline moves (the 2026-09-14 move also skipped it).
- Custody-before-write is attested by timestamps inside the records (lease 16:10:40Z, census 16:11:05Z, commit
  16:11:43Z, first custody record committed 16:12:17Z); the first custody receipt cited the wrong message identifier and
  was corrected at `02e1fca`. The commit carries the shared machine identity; who typed it rests on the records.
- `docs/coordination/FILE_OWNERSHIP.json` has four live blobs across lineages; the patch updates the candidate's copy,
  the temporary custody rule was written over and restored on the records copy.
- The new node owner string and node type/state words diverge from the 2026-09-26 record's typing of the same identity
  (part of QS-R5).
- All validator/test outcomes above are static predictions; the binary pins in any future receipt are not derivable
  from Git.

## 5. Next steps

1. **Owners:** execute items 1–7 of §2 at `8e85daa` within the QS-R6 window; record the reuse dispositions of §2 as
   reviewer-accepted reasoning; open the QS-R5 reconciliation decision with the control-plane owner before any merge.
2. **Coordinator:** register this disposition against `8e85daa`/`25507c2f` on the existing task (next revision);
   transcribe the second authority message (QS-R1); carry the QS-2 designation as *not yet attested*.
3. **Reviewer:** on receipt of the §2 items, append their bindings to the queue; a different candidate is a new
   revision.

Source acceptance of `8e85daa` is not qualification, installation or deployment, and does not resolve QS-R5. Nothing
here authorizes tests, a push, a merge, integration, hosted configuration or deployment. Nothing was executed.
