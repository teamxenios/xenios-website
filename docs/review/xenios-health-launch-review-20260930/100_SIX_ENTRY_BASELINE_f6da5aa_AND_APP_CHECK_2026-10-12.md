# Six-entry protection baseline amendment (`f6da5aa`) and the executed App check: scope review

**Six-entry amendment: SCOPE ACCEPTED.** Exactly six `fileHashes.files` rows changed, each re-pins bytes whose source
change I had already reviewed, your approval is verified verbatim, and nothing else changed.

**App protection check: ACCEPTED as executed evidence for one claim.** The CLI actually ran at `3ec5ec0` and the
`App.tsx` row matched. The Vitest file was skipped, so the test that governs that row still has no executed result.

**Composition line: the protection gate still FAILS, correctly.** After `f6da5aa` one hard mismatch remains
(`server/static.ts`) plus two seam mismatches (`server/index.ts`, `server/research/index.ts`). Each needs its own
exact old-to-new founder approval through its named owner. Nothing on this line may be described as protection-passing
until then. This blocks release of the composition line; it is not a defect of the six-entry amendment and it does not
touch the independent existing-wizard line.

Nothing was executed here. Reviewer: this session, `claude-fable-5-1`. Board task `TC25-SIX-BASELINE-SCOPE-REVIEW`
revision 1, acknowledged at `a2ffb6c`. Related: doc 98 (`7a76a8d`), corrected below.

**Target:** `f6da5aa6154cc62bdbec34ce29a0a5759fb84136` (tree `fce45cde…`, parent `871b437`, base records `d907096c`,
on `codex/tc25-app-manifest-20261012` after the App amendment `3ec5ec0`). Records `f9d34be4`.

**Method.** Two read-only lenses (scope and authority; the App-check addendum), each with an adversarial verifier,
then a critic. Output is archived as `hl12/100_six_entry_and_app_check.json`.

## 1. What I verified myself

| Check | Result |
| --- | --- |
| Manifest delta | Exactly six leaves changed, all in `fileHashes.files`; zero added or removed; no comment, zone, route or test change. Manifest before `95445fdf…` (the approved post-App candidate), after `1e6f6b35…` |
| The six new hashes | Each equals the LF SHA-256 of the file at `f6da5aa` and at the accepted source `25741f0`; none matches the deployed `79414143` (these files changed on the composition line, as expected) |
| Chain scope | `d907096c..f6da5aa` changes only the manifest, the approval record and `.xenios`; no code path |
| Your approval | The attachment named in the record hashes to `da648fb2…` exactly; line 23 reads "SAMUEL: I APPROVE THE EXACT SIX-ENTRY BASELINE AMENDMENT."; its conditions are: proposal identity confirmed, previously authorized source bytes, only the six entries plus records, bounded review. The board holds a byte-identical committed copy (`5672569`, blob `2e1fe0ef`, 8,671 B). The text is advisor-drafted; your sending it is the approval, which is the convention every prior decision in this series has used |
| The prepared proposal | The committed patch (blob `0486609f`, identical at `d907096c` and `f6da5aa`) hashes to exactly the record's `c7e7445d…`, and its six substitutions equal the applied diff |

## 2. Each row's bytes were already reviewed

| Row | Old pin was | Change that produced the new bytes | Where I reviewed it |
| --- | --- | --- | --- |
| `client/src/index.css`, `components/Navbar.tsx`, `components/Footer.tsx` | the IC2 base blobs, which you named as the authorized baselines on 2026-10-03 (doc 30) | one commit, `70cd421` (brand display name; one accent token, focus-visible and forced-colors rules) | docs 32, 33, 34, 35 (accepted by hash) |
| `client/src/pwa/PwaLifecycle.tsx`, `lib/tracking.ts`, `lib/attribution.ts` | the deployed manifest's values on the F9 "before" blobs | one commit, `3f86463` (the `isHealthIntakePath` import plus one predicate line each) | doc 41 (accept with limits) and doc 37; doc 95 accepted the whole `25741f0` tree |

No never-reviewed bytes are blessed. **Named limit (SE-9):** the tests for the three `isHealthIntakePath` predicates
have never been run by anyone; baselining is a bytes decision, and the bytes were statically reviewed.

## 3. The App protection check (closes the doc 98 pending item)

The CLI ran once, exit 1, at 18:36:09Z, on a clean checkout whose HEAD was `3ec5ec0`, with the bound argv
(`verify-core-site-protection.mjs 876ede5 3ec5ec0`) and the bound Node 20.19.0 binary, inside the binding window.
The receipt reports 31 verified and 7 hard mismatches (all 38 `fileHashes` rows accounted for) plus 2 seam warnings;
every drifted blob is identical at `25741f0`, `3ec5ec0` and `f6da5aa`, so nothing in the failure came from the App
amendment. The `App.tsx` seam row matched (`1ee2d576…`), established by the executor's preflight record plus the
runner's HEAD and clean-tree checks, not by stdout alone. **Vitest did not run** (stop on first failure), so
`core-site-protection.test.ts` has no executed result on this line.

**Erratum to doc 98 section 2.** I wrote that the seam-baseline test (`:385-388`) "should pass" because the App row
matches. That was incomplete reasoning: the test asserts the whole seam map is clean, and two other seam rows
(`server/index.ts`, `server/research/index.ts`) mismatch. The second was already recorded in the tree I reviewed
(`HEALTH_PROTECTED_HASH_APPROVAL_20261001.md:30-32`). The test would fail (reasoned, NOT RUN). Doc 98's scope
acceptance of the App row stands; its "NOT RUN" was accurate when published (18:31Z, before the run).

**Procedural notes on the run (P2/P3, coordinator):** it executed in a substitute checkout rather than the bound
working directory, with the re-delegation recorded only in executor-authored files and two "human continuation"
identifiers that appear nowhere on the board (SE-3); the addendum cites binding revision 2 without noting it superseded
revision 1 (SE-10); the executed runner is an adapted form of the frozen one (SE-11). None of these touch source
identity, which the HEAD and clean-tree checks pin.

## 4. What remains on the composition line (owners named)

| Path | Expected / actual | Drift | Owner for the old-to-new approval |
| --- | --- | --- | --- |
| `server/static.ts` (hard) | `9cd3e1c3…` / `b7a76417…` | `0d22757`: removal of the one-line `/research/access-hub → /` redirect | historical Health implementation owner; protection owner OWNER-W2-CONTROL-PLANE. Your six-entry text excludes it explicitly |
| `server/index.ts` (seam) | `1d6594d6…` / `9c024afb…` | cumulative, ending with the disabled Quick Order mount `8e01ef8` | historical Health core owner plus the integrator for the QO hunk; the record forbids dispositioning only the last hunk |
| `server/research/index.ts` (seam) | `b8db03cf…` / `5b9f683b…` | `2dc7d62`, quote-gateway admission | historical Health owner (HL12 quote gateway); excluded from the 2026-10-01 amendment |

**Consequence (SE-1, P1 for this line's release):** a re-run of the bound CLI at `f6da5aa` or the branch tip would
still exit 1 on `static.ts` alone; the Vitest file would fail on `static.ts` (`:319-324`) and on both seams
(`:385-388`). Fail-closed is correct, and no record in scope waives it. Because the classifier treats manifest edits as
silent infrastructure, any future PASS must be read by a person against the approval records, as this review did.

## 5. Records follow-ups (P3; no byte change)

- **SE-5.** Add the reviewer doc references per row and mark the record's "must obtain … before any amendment" text
  historical.
- **SE-6.** A dated `$comment` line for the six pairs, as every earlier re-pin had, under its own approval.
- **SE-8.** Obtain the coordinator acknowledgment after the fact if the continuity contract requires it for manifest
  writes.
- **SE-12, SE-13.** Cite the preflight `App.tsx` hash as the basis for "App: MATCH"; relabel the binding's
  LF-normalized hashes.

Nothing here authorizes tests, a push, integration, qualification or deployment.
