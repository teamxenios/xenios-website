# Mixed-catalog request intent, revision 2: source review

**ONE NARROW CLIENT CORRECTION REQUIRED before mounting. The design is otherwise sound against baseline `8e85daa`.**

- **Correction.** The form treats every refusal as an unknown outcome, including refusals the server knows wrote
  nothing. The customer is then left stuck.
- **Blocker.** Authorized staff readback cannot work in production today. It is gated on the Care rail being
  enabled, and the baseline documents Care as hard-disabled.

This is a source review of unapplied, unmounted code. Nothing was run. It is not test, database, browser or runtime
qualification, and it does not mean the full goal is live.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: Git blobs,
source text and baseline files at `8e85daa`. No tests, parsing, queries, schema work or agents. Archive:
`hl12/163_mixed_catalog_request_intent_r2_source_review.json`.

## 1. Binding

- **Commit.** Core `fdbe3e80` (tree `1cefb730`, parent `58cd065e`). All files sit in
  `mixed-catalog-request-intent-source-proposal/`.
- **Records.**

| Record | Bytes | SHA-256 |
|---|---|---|
| `SOURCE_MANIFEST.json` | 19,650 | `d5eb4ac0…` |
| `PATCH_AGAINST_ACCEPTED_8e.patch` | 120,576 | `29768ea6…` |
| `R2_DELIMITER_CORRECTION_RECEIPT.json` | 1,794 | `85b6e67c…` |

- **Root's copies.** Root's frozen copies in `DOC194_MIXED_REQUEST_R2_SOURCE_FROZEN_20261014/` are byte-identical.
- **The patch.** It adds exactly 15 new files. None exists at `8e85daa`, and every one reconstructs byte for byte.
  No existing application file is touched.
- **The revision-2 change.** It replaces only the four single-`$` delimiters in the two staff-list functions with
  `$$`. The revision-1 SQL was not reviewed as current.

## 2. What is sound

- **Catalog.**
  - The form scans the viewer's whole master catalog through the existing reader and pathway authorities. It fails
    closed on a partial scan.
  - At baseline that is 420 products, one variant each, which matches the code's one-variant rule.
  - Only the two non-merchandise shipping items, plus any coming-soon or planned item, are excluded. None of the
    latter exists at baseline.
  - Clinical items (care-pathway, 244) are requestable with no price shown. Held and restricted items stay
    requestable, and their restriction is shown and stored, which fits per-item manual decisions.
  - Families, workflow modes and display states all match the baseline enumerations.
- **Owner and isolation.**
  - The owner is derived only from the authenticated viewer: the auth user ID for members, or the customer reference
    plus session hash for Early Access.
  - Contact email never establishes ownership. Recovery requires the same owner.
- **Minimum data.**
  - Stored data is contact details, dated acknowledgments and exact lines.
  - There are no notes, documents, medical answers or payment facts, and closed key sets enforce that in both
    TypeScript and SQL.
  - The browser keeps only an attempt marker with no products or contact data, under the existing sign-out sweep
    prefix.
- **Atomic save, replay and concurrency.**
  - One security-definer function inserts on (owner, attempt) with `on conflict do nothing`. If it lost, it reads
    the committed winner.
  - Changed facts under the same attempt raise a conflict. Every line and the audit event are written together or
    not at all.
  - The service looks up the attempt before standing, catalog or legal checks, so a saved attempt always replays.
- **Truthful receipt.** "Request saved" appears only after a validated receipt. Its reference is derived from the
  stored ID, and its whitelisted fields are pending-only.
- **Staff authorization.**
  - The app layer requires the exact enabled Care capability and `care:administer`.
  - The database independently requires an active `clinical_admin` assignment and an approved enabled Care row.
  - All functions are executable only by `service_role`. The private schema has no table grants, forced RLS and no
    policies, and the actor comes from the verified principal.
  - No direct Data API path exists.
- **Baseline matches.**
  - The validator copies the shipping address into billing when they are the same. The 200-line, no-duplicate and
    per-item 100-maximum rules match the SQL checks.
  - The SHA-256 hex hasher fits the 64-character checks. The Care principal's subject ID is the auth user ID.
  - `care_role_assignments` and `care_capabilities` have exactly the columns used.
  - Every client import exists, and every catalog string is within the SQL's 300-character bound.
- **Commerce refusal.** It is unchanged. There is no endpoint to approve, pay, prescribe, convert, fulfill or upload.

## 3. Required correction: separate known refusals from unknown outcomes

`request-intent-api.ts` turns every non-OK response into "Request outcome is unconfirmed". `RequestIntentForm.tsx`
then shows the recovery notice ("We could not confirm the result... retry the same attempt") and locks editing. A
reload leaves only the "check your earlier request" screen.

- **Why that is wrong.** On the first POST of an attempt, a 400, 401, 403 or 429 means the server refused before
  any write. The service checks validation, owner, standing, catalog and acknowledgments before the single write.
  So the outcome is known: nothing was saved.
- **Why it traps the customer.** Retrying the same frozen attempt cannot succeed for a refusal like
  `selection_requires_refresh` or `current_acknowledgments_required`. The customer is stuck without support. That
  is not truthful refusal guidance.

The fix:
- **Expose the status.** Make the HTTP status available to the form.
- **First POST, known refusal.** On the first POST of an attempt, treat 400, 401, 403 and 429 as "not saved". Show
  guidance matched to the cause, clear the attempt marker, and let the customer edit and resubmit under a fresh
  attempt.
- **Everything else stays unknown.** Keep 409, every 5xx, network failures, malformed bodies and any refusal on a
  retry as unknown. A retry's refusal could race an earlier in-flight attempt that later commits.

Add written tests for both branches. This changes the client only, and it is not a security change.

## 4. Recommended, not required

- **Database refusals.** `rpc-repository.ts` maps every database error to 503 "uncertain". A check-constraint
  violation (23514) or `request_intent_invalid` (22023) rolls back and is a known refusal. Mapping those to a
  definite invalid-request code would avoid permanent "unconfirmed" outcomes for a parity gap.
- **Contact size cap.** The SQL contact cap of 6,000 bytes can sit below what the TypeScript validator accepts for
  maximum-length text in multibyte scripts. Raise the cap, or enforce the same bound in TypeScript.
- **Billing address.** It is collected for an unapproved request through the reused contract. That is defensible
  for later follow-up, but not needed to record intent.

## 5. Integration blockers and prerequisites

1. **Care enablement for staff readback.**
   - Both the Care guard and the database check need four things: the Care capability enabled and approved, both
     `CARE_ENABLED` and `CARE_ENABLE_APPROVED`, and an active `clinical_admin` assignment.
   - The baseline records Care as hard-disabled in production. Enabling it opens the whole `/api/care` surface.
   - So staff readback needs one of two things: Samuel's explicit production decision to enable Care, or a separately
     reviewed change to an existing staff authority.
   - This review creates no authority and asks no operator-name question.
2. **Care foundation dependency.** The Care tables come from `supabase/care-access-foundation.sql`, outside the
   migrations folder. Any rehearsal or registered migration must account for that file.
3. **Disposable database rehearsal before any registration.** It must prove six things:
   - the new pattern of a role setting checked inside security-definer functions admits `service_role` through
     PostgREST and refuses everyone else;
   - forced RLS with no policies still lets the function owner read and write, which needs bypass rights;
   - insert-or-replay under concurrency;
   - parity between the TypeScript validators and the SQL checks;
   - immutability;
   - the staff guards.
4. **Migration placement and registration, then mounting.** These come next, under protected-path custody. The
   mount, guard and manifest change for the existing customer and staff shells is a separate packet that needs its
   own review.
5. **Runtime qualification and release.** These follow, including the browser journey for save, retry, recovery,
   refusal and staff readback. Until a notification path exists, staff must check the queue themselves.

**Unchanged.** R8 and Docs 160, 161 and 162 stay closed. The application `8e85daa` is unchanged, failed run `790af2ce`
stays FAILED, and the payment and security holds stay open.

Not execution consent, not human approval and not test credit.
