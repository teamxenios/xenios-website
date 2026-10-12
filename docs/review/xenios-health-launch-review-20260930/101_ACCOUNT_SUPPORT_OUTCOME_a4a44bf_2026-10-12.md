# Account support uncertain-outcome correction (`a4a44bf`): source review

**ACCEPTED WITH NAMED LIMITS.** No P0 or P1. One P2 follow-up (AS-1) that is an improvement over the base, not a
regression, and does not block acceptance.

The change is one text node. When a support submission ends without a definitive answer, the customer now reads "We
couldn't confirm whether your support request was recorded. Check your case history before submitting again." instead
of the base's "The request could not be recorded. Your account was not changed.", which was false on exactly those
paths.

**Why the new copy is true everywhere it appears** (`api.ts:26-56@a4a44bf6`, which I read myself). The wrapper returns
`error` only for a transport rejection, a missing or unparseable body (including a 201 whose body was lost), a
non-envelope 5xx, or a server-side exception after the insert may already have run. Every definitive refusal (400
`invalid_support_case`, 429 `rate_limited`, 401/403 denials) arrives as a `denied` envelope or status and still renders
the unchanged "Your request was not recorded" copy (`SupportView.tsx:193-194`). The draft is retained on every non-ok
outcome and cleared only on success, unchanged from the base.

**Tests.** The rewritten error cases assert the exact new text and reject the base wording, so they fail at `79414143`.
The two-case table drives the real `createAccountSupportCase` and `accountPortalFetch` with only `fetch` stubbed (a
thrown transport error; a 201 with a lost body), and asserts one POST, no retry, draft retained, prior cases retained,
and no raw error strings rendered. No `.only`/`.skip`/`.todo`.

**Submitted evidence** (not run by me): 13/13 passed, exit 0, at candidate `a4a44bf6` / tree `2c123d9f`, Node 20.19.0
(binary SHA pinned), Vitest 4.1.10, one file. The launcher refuses a dirty or mismatched HEAD; receipt, result and log
reconcile. The dependency tree is a donor copy identified by lock and metadata hashes only. Nothing was executed here.

Reviewer: this session, `claude-fable-5-1`. Board task `ACCOUNT-SUPPORT-UNCERTAIN-OUTCOME-SOURCE-REVIEW-20261012`
revision 1, acknowledged at `a2ffb6c`.

**Target:**
- **Source:** `a4a44bf6436f7e4ff21d5d5ebcda35b478c02616` (tree `2c123d9f…`, parent `79414143`, the deployed lineage).
- **Records:** `fa7de0a596bac6c8a1b290fd5b2a7358c26a5937`.
- **What changed:** exactly `client/src/research/account-portal/views/SupportView.tsx` (line 195) and
  `support-documents.test.tsx` (+95/−3). No server, API, route, payment or protected path.

**Method.** One read-only checker and one adversarial verifier; both independently reached acceptance. Output is
archived as `hl12/101_account_support_outcome_review.json`.

## Named limits

- **AS-1 (P2, follow-up slice).** The copy sends the customer to "Your cases", but that list is a mount-time snapshot
  (`resource.tsx:64-90`) and nothing refetches after an error outcome. A case persisted during the lost exchange stays
  invisible until reload, so a customer who checks and resubmits can still create the duplicate the copy is trying to
  prevent. The base invited that duplicate outright, so this is an improvement. Fix in a later slice: refetch the list
  after an uncertain outcome, or say "reload this page and check your case history".
- **ASV-1 (P3).** Any edit to the draft clears the notice, so the instruction is transient. Same lifecycle as the base.
- **AS-2 (P3).** Denial and rate-limit distinctions are still tested through a mocked `onSubmit`, not through the real
  wrapper. Pre-existing gap; extend the table with 401-non-envelope, 400 and 429 envelope cases.
- **AS-3, ASV-2, ASV-3 (P3, pre-existing, unchanged).** A 400 validation denial renders sign-in-blame copy (unreachable
  from this form, whose client validation is stricter); a few non-envelope definitive refusals outside the route map to
  the uncertain copy (literally true); a limiter outage reads as "too many requests".
- **AS-4 (P3).** Evidence limits: synthetic jsdom only; no browser, backend, idempotency, build, typecheck or protection
  evidence for this candidate; raw SHA-256 values not recomputed here (blob IDs and sizes matched).
- **ASV-5 (P3, records).** The registration's copy filenames differ from the records paths they mirror.

## Disposition

Accepted for source as an independent increment. It shares no file with the QL candidate; combining them is a separate
tree needing its own checks. Release still needs the applicable qualification (protection, build and typecheck for the
exact released candidate, a served-version check) and release authority. Nothing here authorizes a test run, a push,
integration or deployment.
