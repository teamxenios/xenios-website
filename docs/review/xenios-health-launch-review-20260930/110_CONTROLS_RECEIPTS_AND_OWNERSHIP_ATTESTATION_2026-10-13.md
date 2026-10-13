# Revision 11: completed pure-control receipts, and the integration-ownership-review attestation for `79414143..8e85daa`

**Part A — ACCEPTED as bound receipts.** The 15-group command-mapping control and the 36-group wrapper-gate control
both ran under finite LIGHT admissions at `8e85daa`, passed completely, and re-hash to the registration. With doc 108's
acceptance of the R3 controller, the static-CLI profile is technically complete for its control stage: it may proceed to
its three actual CLI receipts under separate human-derived finite tickets and fresh G0 checks. No execution permission
comes from this verdict, and nothing here is a real CLI, handshake, OS-observation or browser result.

**Part B — ATTESTATION PUBLISHED.** I independently recomputed the ownership findings for the exact 17-path
`79414143..8e85daa` delta against the trusted base policy with the validator's own rules; every digest and count in
the owners' unattested template reproduces. Because the attestation asserts only facts I verified, and every one of the
17 paths was reviewed in docs 99–105, I have filled my identity and time and published the schema-1 artifact in my own
records at `artifacts/integration-ownership-review-8e85daa.json` (1,027 B, sha256 `20a03bb6…`). It attests a review
of ownership findings; it is not release approval, push consent or a manifest PASS.

Reviewer: this session, `claude-fable-5-1`. Board registration revision 11 on
`DOC96-EXISTING-WIZARD-QL11-QL12-DELTA-REVIEW-20261012` (20:23:03Z;
`DOC108_ACTUAL_CONTROLS_AND_MANIFEST_OWNERSHIP_REVIEW_REGISTRATION_20261013.json`). Application
`8e85daa`/`25507c2f`, build `3dd3d96`, QS-2, QS-R5 and docs 104–109 unchanged. Reviewed directly, read-only, no
agents, nothing executed. Archive: `hl12/110_controls_receipts_and_ownership_attestation.json`.

## A. The two control receipts (owner-produced; verified in bytes)

1. **Mapping-15** (`DOC108_STATIC_MAPPING15_ACTUAL_PASS_20261013/`, records `05918a16`, root disposition
   `59ebb85f…`). `receipt.json` 7,278 B `2c38adfa…`, `stdout.json` `50bf8547…`, empty stderr; both equal the
   registration. Pins before and after: old controller `68f738b3…`, new controller `55b7ff04…`, wrapper `e3898fe7…`,
   control `18cbff0a…`, LIGHT parent `35a7e1b0…`, pwsh `362a356c…`; the archived copies re-hash to those values.
   Exit 0, 128 MiB heap, 15.5 ms control / 104.6 ms outer, source matched and clean after, independent closure
   (PID 51604 absent). The 15 named checks are exactly the specification accepted in doc 108: three source pins,
   exact-delta-only, and for each of the three modes old-mismatch / corrected-match / different-executable-refused /
   different-argument-refused, then post-pins; the `mappings` block records old raw comparison false and corrected
   true for all three modes. This is the executed form of doc 107's proving check.
2. **Wrapper-36** (`DOC108_STATIC_WRAPPER36_ACTUAL_PASS_20261013/`, records `b693afd3`, root disposition
   `04c923a1…`). `receipt.json` 5,948 B `2c1fad81…`, `stdout.json` `6055cbb8…`, empty stderr. Pins: wrapper
   `e3898fe7…`, pure36 control `44f33dab…`, its parent `4e72ba22…` (archived copy re-hashes), pwsh, git, node. Exit 0,
   7.2 ms control / 116.3 ms outer, source matched and clean, independent closure (PID 52560 absent, scope 0). The 36
   named checks are exactly the pure36 specification read in doc 107: wrapper pin, three exact commands, unknown
   command refused, valid ACK starts once, twelve wrong-field refusals, twelve missing-field refusals, extra key,
   expired window, observation from the future, stale wrapper start, wrong expected wrapper, post pin.

**What they prove and do not prove.** They prove the corrected controller's command comparison and the wrapper's ACK
gate in pure form. They do not prove readiness files, OS observation, a real ACK, a real CLI or cleanup; those come
only from the three actual runs (migration DAG; production state inside the QS-R6 window ending
2026-10-20T13:49:12Z; protection `79414143 8e85daa`, 17 paths), each under its own ticket and G0.

## B. The ownership attestation

- **What the validator requires** (`scripts/acceptance/verify-release-manifest.ts` at `8e85daa`, sha `862e5071…`;
  schema `147a8297…`): a schema-2 manifest carries `integrationOwnershipReview` whose fields the validator recomputes
  independently — `baseSha`, `headSha`, the trusted policy digest loaded from the base commit, the canonical digest of
  the exact `git diff --name-only --no-renames base..head` path set, the canonical digest and counts of ownership
  findings computed with `ownersForFile` (write-mode, non-retired rules, glob semantics) against the manifest's lane —
  plus a non-empty `reviewerIdentity` ≤200 characters, a `reviewedAt` no older than 7 days and not materially in the
  future, a safe repository path and the artifact's own sha256. When the artifact at that path parses to the closed key
  set and every recomputed value matches, `UNOWNED_FILE` and `WRONG_LANE_OWNER` findings are treated as reviewed;
  `OWNERSHIP_CONFLICT` can never be reconciled this way.
- **What I recomputed myself.** The 17-path diff equals the canonical path inventory (digest `3d260180…`). The
  trusted policy is the `79414143` blob `035c61be` (43,145 B, sha256 `bb4ea1f7…`), 48 write-mode rules, none retired.
  Applying the validator's algorithm in a separate implementation: four paths match no rule (`AssistedOrderPage.test.tsx`,
  `draft-store.ts`, `draft-store.test.ts`, `ql-protection-carryforward-20261012/APPROVAL_AND_PREIMAGE.json`); thirteen
  match exactly one rule whose lane is `release-manager` (`OWNER-W2-CONTROL-PLANE` for the seven control-plane files,
  the manifest, `package.json` and the release-control-plane test; `OWNER-PHASE-ZERO-ASSISTED-ORDER-WIRING-20260819`
  for `AssistedOrderPage.tsx`, `service.ts`, `service.test.ts`, `http-e2e.test.ts`), not the manifest lane
  `existing-request-intake-release`; none matches two rules. Counts 4 / 13 / 0; findings digest `d7d21615…`; both equal
  the template. The manifest lane need not exist in the policy (the validator only requires a non-empty string), and
  it must not be changed later without a fresh attestation, since the counts would change.
- **Why I can sign it.** The attestation asserts identities, digests and counts I reproduced, and that an independent
  reviewer reviewed the files behind the findings. Every one of the 17 paths was reviewed by me: the QL client files and
  the server service/tests in docs 99, 102 and 103; `package.json` and the protection manifest in doc 104; the seven
  control-plane files and `FILE_OWNERSHIP.json` in doc 105; the carry-forward approval record was read in docs 104
  and 105 as a historical preimage. The attestation does not say the lane assignment is correct, that custody was
  transferred, that the release is approved, or that any check passed; it says the ownership findings were reviewed.
- **The artifact.** `docs/review/xenios-health-launch-review-20260930/artifacts/integration-ownership-review-8e85daa.json`,
  serialized exactly as the validator's `serializeIntegrationOwnershipReviewArtifact` (two-space indent, LF, trailing
  newline, closed key order), 1,027 bytes, sha256 `20a03bb6cfcafadd5d17fa739f15ade96e233e91c05ae5e99b6e9c4b1172057e`,
  Git blob `6c0a4113…`, `reviewedAt` `2026-10-13T20:31:14.950Z`, `reviewerIdentity` "Original independent acceptance
  reviewer: Claude session 6abf1edf-2b16-476e-8305-23b9a0014e06 (claude-fable-5-1), branch
  claude/xenios-health-launch-review-20260930" (164 characters), `reviewArtifactPath`
  `docs/health-launch/ql-build-20261012/release-manifest-8e85daa/integration-ownership-review.json`. The manifest's
  `integrationOwnershipReview.reviewArtifactSha256` must be that sha256 of these exact bytes; the owners copy the bytes,
  unchanged, to the declared repository path through their alternate-index procedure. Any byte change invalidates it.
- **Time limit.** The validator accepts this review until 2026-10-20T20:31:14Z (7 days); the production-state
  evidence window closes earlier, 2026-10-20T13:49:12Z.

## C. Not changed by this record

Doc 108's three receipts and doc 109's observer source acceptance stand; browser R2 remains failed-closed with no
test credit; the alternate-index export, the final manifest's test-evidence assembly, the three CLI receipts, the
17-path manifest validation run, QS-R1 (its human continuation transcript is recorded), QS-R4 and release authority
remain the owners' work. Nothing here authorizes staging, a push, a deployment, database, role or payment changes.
Nothing was executed.
