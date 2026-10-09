# Doc 62 records follow-up (integrator `3df14c2`, subscription `c6893f6`): bounded records review

**RECORDS ACCEPT WITH LIMITS.** Both commits are records-only and touch only their owner's registry rows. The composed
source `cad2c4d` and the Workstream C source `736bb2a` are unchanged.

| Doc 62 item | State |
| --- | --- |
| D62-4, catalog freeze recorded | Corrected, in the integrator's lease records |
| D62-5, authority citation | Corrected |
| D62-6, inventory digest derivation | Stated exactly, and it reproduces: 3,278 rows and `d6a1e886…` with default path quoting; 3,277 rows and `1204f550…` without |
| D62-7, full transitive dependency list | The 39-module list matches an independent import walk |
| D62-8, stale successor pointer | Marked superseded |

The D62-3 ownership proposal is correctly scoped and explicitly unapplied. Applied as written, it would fail the
release-gate ownership check. No P0, P1 or P2. Nothing was executed.

Reviewer: this session, `claude-opus-5-5`. Board task `DOC62-RECORDS-FOLLOWUP-20261008` r1, acknowledged at `ab1d43f`.
Method: one read-only lens with an adversarial verifier. The verifier upheld five lens findings, lowered one, refuted
one and added five. Lens output archived as `hl12/66_doc62_records_followup_lens_findings.json`.

## 1. Identity (verified)

| Item | Value |
| --- | --- |
| Integrator records | `3df14c276b4812edd44132266fcbdb2e880e8cb2`, tree `ce66379e…`, parent `f175f3c`; nine paths, all under `docs/` and `.xenios/` |
| Subscription records | `c6893f6ddeb2aef6a5295cb7058e1f984d8501cc`, tree `85670e3c…`, parent `ce5e58f`; six paths, all under `docs/` and `.xenios/` |
| Source unchanged | the `client/`, `server/` and `shared/` trees equal `cad2c4d` and `736bb2a` respectively, and every frozen blob is unchanged |
| Records recompute | the bindings, the preservation inventory and the masked foreign-row digests recompute; neither commit is on a remote |

## 2. D62-3 ownership proposal

The patch would remove only `ProductPage.tsx` from the Website 2 reservation in `docs/coordination/FILE_OWNERSHIP.json`.
It keeps `product-subscribe.test.tsx` reserved, and it is labelled unapplied everywhere.

- **The narrowing is acceptable.** Doc 62 asked for the whole reservation to be superseded. The composed candidate
  writes `ProductPage.tsx` but not `product-subscribe.test.tsx`, so keeping the test reserved is a sound refinement.
- **It is not safe to apply as written (D66-1).** It adds a rule key the ownership parser rejects.
- **It would leave the page unowned (D66-2).** Nothing else would own `ProductPage.tsx`.

## 3. Findings (all P3, verified)

- **D66-1. The proposal adds a non-canonical key.** It adds `partiallySupersededReservations`, which the release
  ownership parser rejects, so it would fail closed if applied verbatim. Redraft it to keep the six canonical rule keys,
  and record the supersession details elsewhere.
- **D66-2. The page would be left unowned.** Removing the pattern leaves `ProductPage.tsx` with no write owner, which
  the release check reports as an unowned file. Name the replacement owner in the same decision.
- **D66-3. The shared registry needs one decision for all eight files.**
  - The four catalog files are still under an active Website 3 write rule for a lane that has no branch.
  - Three of the four Workstream C paths have no write owner in the shared registry.
  - The `.xenios` freeze and custody entries are advisory, because the tools ignore leases in handoff state.

  The coordinator should take one decision covering all eight accepted files with the registry's owner, using only
  canonical rules.
- **D66-4. Two hashes for one blob.** The subscription receipt gives `ProductPage.tsx` a working-file hash, `b9532627…`,
  while the raw Git-byte hash of the same blob is `77fd8156…`. Label the field, and add the Git hash on the owner's
  next records turn.
- **D66-5. Older coordinator records lack the caveat.** Four coordinator records written before doc 62 still cite
  `d6a1e886…` without the path-quoting caveat. Point them to the exact derivation at the next coordinator checkpoint.
  Any snapshot-S packet that cites the digest must copy the derivation.
- **D66-6. No forward pointer on the subscription branch.** The D62-5 correction has no pointer on the branch where the
  miscited bytes live.

The verifier refuted one lens finding: the handoff pointers are adequately labelled, and the coordinator had already
bound them to their containing commits.

## 4. Disposition

- Subjects: integrator records `3df14c2`, subscription records `c6893f6`; the composed source `cad2c4d` is unchanged.
- **RECORDS ACCEPT WITH LIMITS.** D62-4 to D62-8 are closed. D62-3's narrowing is confirmed, but the proposal must be
  redrafted before it is applied (D66-1 and D66-2).
- **Next action:** the coordinator, with the shared registry's owner, decides ownership for all eight accepted files in
  canonical form (D66-3). Owners fold D66-4 and D66-6 into their next records turn.
- Doc 62's source acceptance of `cad2c4d` stands.
