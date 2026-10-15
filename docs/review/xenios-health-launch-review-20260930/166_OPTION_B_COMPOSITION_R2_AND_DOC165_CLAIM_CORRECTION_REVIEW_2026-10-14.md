# Option B composition-r2 and the Doc 165 claim correction

**Option B composition-r2 is ACCEPTED as source. It needs one metadata-only clarification and no code change: the
provenance sentence in the pending manifest contradicts the two-stage custody procedure. The Doc 165 claim correction
is ACCEPTED: it accurately resolves Doc 165.**

- **Option B.**
  - The live assisted-order form and catalog return as the fallback, but only on the server's exact "off" answer.
  - An unknown readiness answer never selects the fallback.
  - A saved attempt keeps its own form across mode changes.
  - Every Doc 164 item is addressed.
- **Clarification.** The manifest comment says to fill all three custody values "at application". But the custody
  return can only be recorded after the custody exercise. Section 5 gives the correct order.
- **Doc 165.**
  - Exactly one static test title changed.
  - The notes now say plainly that the database proves the server-named actor's role and scope, not actor presence.
  - The activation hold on the scope row is stated.

This is a source review of unapplied code. Nothing was run. It is not test, database, browser or runtime
qualification, and the combined source chain has never been applied or executed.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: Git blobs,
source text and baseline files at `8e85daa`. No tests, parsing, patch application, queries or agents. Client-r3
(Doc 164) and the staff reader behavior (Doc 165) were not re-reviewed. This packet supersedes the undelivered
packet 205. Archive: `hl12/166_option_b_composition_r2_and_doc165_claim_correction_review.json`.

## 1. Binding

| Revision | Core commit | Tree | Parent | Records |
|---|---|---|---|---|
| composition-r2 (Option B) | `86302a5a` | `61755a20` | `a467117c` | `2b9dbc41` (`HANDOFF.json` only) |
| Doc 165 claim correction | `c97a3704` | `29349896` | `c382d33b` | `bc3a2028` (`HANDOFF.json` only) |

**Composition-r2 artifacts.** All four match the packet's pins:

| Record | Bytes | SHA-256 |
|---|---|---|
| `SOURCE_MANIFEST.json` | 16,024 | `31024c38…` |
| `DELTA_AFTER_STAFF_R1.patch` | 55,795 | `d113268c…` |
| `CUMULATIVE_AGAINST_8e.patch` | 237,960 | `7219df63…` |
| `REVIEW_AND_CUSTODY.md` | 10,432 | `3dcba0fc…` |

- **Committed files.** All 36 match the bytes reviewed.
- **Before-images.**
  - Seven equal the latest prior revision: five from composition-r1, including its manifest, and two from the staff
    alternative.
  - Five equal their `8e85daa` blobs.
- **Accepted client.** The six accepted client-r3 after-images are untouched.
- **Patches.** They have 19 and 40 file sections. They were not applied or parsed.

**Claim-correction artifacts.** All five match the packet's pins:

| Record | Bytes | SHA-256 |
|---|---|---|
| `SOURCE_MANIFEST.json` | 7,662 | `7fd72ad2…` |
| `CLAIM_AND_QUALIFICATION.txt` | 8,596 | `c8e7d232…` |
| `DELTA_AFTER_COMPOSITION_R2.patch` | 1,092 | `7811b163…` |
| `CUMULATIVE_AGAINST_8e.patch` | 237,971 | `ab4b52da…` |
| `CUMULATIVE_SOURCE_INDEX.json` | 54,567 | `798e9bdb…` |

- **Source index.** It lists 40 final paths:
  - each after-image equals the latest file across R2, composition-r1, client-r3, staff-r1, composition-r2 and
    claim-r2;
  - 11 paths exist at `8e85daa` with matching blobs, and 29 are new.
- **Cumulative patch.** It differs from composition-r2's only in the one title line and its blob.

**Not reviewed.** `c382d33b` (`application-preconditions-r1`) was read only to compare its custody wording.

## 2. Option B continuity: accepted

- **Server discriminator** (`production.ts`).
  - The config door answers 503 `{enabled:false, error:"request_intent_disabled"}` only when the flag is unset or
    exactly `"false"`. It answers before the rate limiter, so it needs no RPC call.
  - Every other state answers `request_intent_unavailable`. That includes `true` with missing origin, RPC, agreement
    gate or legal pairs, and any malformed value.
- **Client discriminator** (`order-request-mode.ts`).
  - The client chooses legacy only on that exact 503 body, and mixed only on a 200 with `enabled:true` and a
    parseable config.
  - A 429, a network failure, a non-JSON body or any other shape reads as unavailable.
  - The probe never retries and keeps no global cache.
- **Retained attempts outrank mode.** The selector only reads storage. It never writes, clears or copies anything.
  - **Mixed marker.** A valid mixed marker keeps the mixed form even when the mode is off or unknown. Recovery may
    then answer 503, and the existing notice sends the customer to support before any replacement.
  - **Legacy attempt.** A legacy draft that is uncertain or interrupted, carries an acceptance stamp, or has selections
    keeps the legacy form even with mixed on.
  - **Blocked cases.** Both kinds of attempt at once, an unreadable marker or draft, or inaccessible storage all
    block. The legacy reader has no expiry, so a stale but valid draft does not block.
- **Stable choice.** The entry locks its door once a real door is chosen, so readiness changes keep volatile work. A
  change of owner remounts through the `owner` key. Account recovery or failed verification closes the entry.
- **Legacy parity.** In legacy mode, the storefront again uses the legacy bridge's shared probe.
  - A dark legacy bridge still hides the catalog, as at baseline.
  - The standalone legacy page computes the same URL hint itself and ignores the passed resolution, so it behaves as
    at baseline.
  - The existing confirmation and status routes, all ten old doors, and the sign-out sweep are unchanged.
- **Mixed on.**
  - The full mixed form opens without the old bridge.
  - The call-to-action and the storefront share one owner-scoped probe, and the form loads its own legal config.
  - The standalone door stays reachable outside the cart mount.

## 3. Test source: aimed at the real boundaries, not run

Twenty-nine declarations were added:

| Area | Declarations | Kind |
|---|---|---|
| Selector | 5 | real storage |
| Entry | 8 | child forms stubbed at their boundary |
| Storefront | 5 | real route and real mixed form |
| Care page | 4 | |
| Care section | 1 | |
| Integration | 3 | source-text checks, labeled as not browser execution |
| Server discriminator | 1 | |
| Document policy | 1 | plus three matrix rows |
| Sign-in return | 1 | |

The baseline storefront cases now default to "off", so they still drive the real legacy wizard. That includes the case
where a dark bridge hides the catalog. The new cases' strings and fixtures match the code. For example, the clinical
link resolves the Estradiol `pcv_care_1` fixture, and the "0 selected." and "1 selected." copy comes from the accepted
form.

**Gap.** No test pins an unset flag, which is today's production default, or a malformed flag. The fixture always sets
`"true"` or `"false"`. The code handles both correctly by inspection.

## 4. Private document policy, sign-in return and registrar order: accepted

- **Document policy.** `/care/request-intents` is now an exact known path, registered as a private document. A direct
  load gets 200, noindex and no canonical URL, and child paths stay 404.
- **Sign-in return.** The page links to `/research/sign-in?returnTo=%2Fcare%2Frequest-intents` and sets robots to
  `noindex, nofollow`.
  - The shared return list admits only that exact path.
  - The existing sanitizer drops actor, token and role query keys. Being a return destination grants nothing.
- **Registrar order.** `registerRequestIntentApi` now runs after all ten legacy assisted-order registrations, and the
  integration test checks the order in source. The new `server/index.ts` hash is `1a3fb0b7…`, as recorded.

## 5. Provenance and custody: one required clarification

- **What is correct.** Compared with `8e85daa`, the manifest changes in exactly three ways:
  - one new `seamBaselineHashes.$comment` entry, placed first as convention requires;
  - the `server/index.ts` seam hash, `2ae01b4d…` to `1a3fb0b7…`;
  - the `server/research/index.ts` seam hash, `b8db03cf…` to `000da4da…`.

  The comment truthfully records `lease=UNASSIGNED; authority=UNGRANTED; custody-return=PENDING`. It also states that
  docs lease `19d2ed9a` is not protected custody. Nothing pins the manifest's own hash, and the protection test
  compares seam hashes with the actual files, so later value fills are not circular.
- **The conflict.** The frozen comment says: "At application, replace ONLY those three pending values … then
  freeze/review."
  - Both procedure documents (`c382d33b`, and the claim note) correctly say the custody return is filled only after the
    real return.
  - The bounded substitution can change only the three values, never that sentence, so the manifest would carry a
    standing instruction to record a return at application.
  - The `APPLICATION_CUSTODY_PENDING` label would also outlive completion.
- **Required.** One of the following:
  - **Preferred.** Before the pending manifest is frozen into an application, issue a metadata-only successor that
    rewords the comment to the two-stage order and relabels it.
  - **Alternative.** The single source and custody decision explicitly states that the two-stage order governs over
    the comment's "at application" wording.
- **Correct sequence.**
  1. **Decision.** Samuel's exact source and custody decision covers all 40 paths and this procedure. A real exclusive
     protected lease is registered.
  2. **Canonical copy.** Copy the 39 fixed files, plus the manifest with only lease and authority filled. The custody
     return stays PENDING.
  3. **Applied-byte confirmation.** I confirm that the applied files equal the pinned after-images, and that the
     manifest differs from the pending template only in those two values.
  4. **Qualification.** Qualify under that custody.
  5. **Return.** Return custody for real, and record the owner's acknowledgment.
  6. **Finalization.**
     - A finalizer with its own valid authority fills only the custody return; the returned lease is not reused.
     - It freezes and measures the final manifest, and the protection and seam checks re-run on those final bytes.
     - I then confirm the final record.

## 6. Doc 165 claim correction: accepted, resolves Doc 165

- **The change.** Only the `sql-contract.test.ts` title changed.
  - Old title: "bounds private staff readback by real auth identity, role assignment and capability".
  - New title: "declares staff-reader checks for service-role context, a named actor's role and approved scope".
  - Every assertion is byte-identical.
- **The notes.**
  - The service-role admin call has a null `auth.uid()`, so that clause is vacuous.
  - The database proves the server-named actor's live role and approved scope, not actor presence.
  - A service-key holder could impersonate an eligible actor once the scope is approved.
  - Static assertions prove text, not effect.
- **The hold.** The scope must not be approved until the exposed-credential condition is closed and key rotation is
  confirmed. Security authority remains NONE.
- **Preserved.** The Doc 165 rehearsal list and its recommendations are kept.

## 7. Recommended, not required

- **Held-state copy.**
  - With no prior attempt, the "unavailable" text tells the customer to contact support "before a replacement". Offer a
    reload or retry instead.
  - With storage inaccessible, the "blocked" text claims an earlier request exists. Word that case separately.
- **Legacy-mode layout.** The fallback restores the form, catalog and doors, but not the exact storefront arrangement.
  - The legacy call-to-action now sits at the top, outside the cart mount, and stays visible through the embedded
    steps. At baseline it appeared only on the products step.
  - The link notice now renders inside the catalog section, with `enabled` fixed to true.
  - Record these changes as accepted, or restore the baseline placement.
- **Probe scope.** The probe is scoped to the session expiry. If the server extends the session at expiry while mixed is
  on and the legacy bridge is off, the catalog section briefly unmounts and an unsaved mixed form is lost. Scope the
  probe to the owner, or keep the section mounted while it re-probes.
- **Notes-only drafts.** A legacy draft with notes but no selections is not treated as retained.
- **Discriminator tests.** Add the unset and malformed flag cases to the server discriminator test.

## 8. Combined scope and remaining source conditions

- **What the reviews cover.** Between them, Docs 163–166 cover all 40 final after-images listed in the claim
  correction's source index (`798e9bdb…`), at source level only:
  - R2: Doc 163;
  - composition-r1: Doc 164, scope corrected here by Option B;
  - client-r3: Doc 164;
  - staff-r1: Doc 165;
  - composition-r2 and claim-r2: this document.
- **What they don't cover.** No applied tree exists, and nothing ran.
- **Doc 164 items resolved by this source.**
  - The material scope correction.
  - The storefront test, the document policy and the seam provenance, subject to the section 5 clarification.
  - The shared probe, the registrar order and the staff sign-in return.

**Remaining conditions:**

1. **Manifest wording.** The section 5 clarification.
2. **Source and custody.** Samuel's exact source exception and a current exclusive protected lease. Neither is held,
   and docs lease `19d2ed9a` is not custody.
3. **Application.** The sequence in section 5, with my applied-byte confirmation and final record confirmation.
4. **Execution, separately authorized.**
   - Disposable database, rate-limiter, Care foundation and patient-index rehearsal.
   - Typecheck, build, affected and baseline tests, browser runs in both modes and with retained attempts, and the
     protection and release controls.
5. **Staff activation chain** (Doc 165).
   - Close the exposed-credential condition.
   - Create a real `clinical_admin` assignment; names stay deferred, as recorded.
   - Approve the scope row.
   - Turn on the flag.
6. **Hosted conditions.** Valid `SITE_URL`, legal applicability, and the flags. Both flags stay off by default.

**Unchanged.**
- The client-r3 acceptance, the staff-design acceptance and the Doc 163 optional recommendations stay as recorded.
- R8 and Docs 160–165 stay closed, and the application `8e85daa` is unchanged.
- Failed run `790af2ce` stays FAILED, and the payment and security holds stay open.

Not execution, query, role, flag or grant consent; not source-application, push or deployment consent; not human
approval or test credit.
