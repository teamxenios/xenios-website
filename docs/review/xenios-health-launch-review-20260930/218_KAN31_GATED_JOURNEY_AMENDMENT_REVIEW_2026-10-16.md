# KAN-31 gated staging journey amendment: narrow review of the Doc 217 delta

**ACCEPTED.** Amendment `GATED_JOURNEY_AMENDMENT_UNAPPLIED.json` (9,399 B, SHA-256 `b4a8f5cb…`) is accepted.

- **The change.** It sets `RESEARCH_EARLY_ACCESS_OPEN_ACCESS` to `false`, with an existing valid staging-only password
  hash. That implements Samuel's chosen gate on the request journey only.
- **What it gets right.** The A and B prestate conditions are correct for the unchanged hosted browser, and the
  missing-input and fallback boundaries are stated truthfully.
- **Doc 217 stands.** All Doc 217 isolation, save and approval conditions are preserved.
- **What this is not.** Not an operation, credential or session authority.

Reviewer: `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session.
- **Identity.** Core `e6dc67b6` (tree `512cc2ba`, parent `60099f70`) adds exactly one file.
- **Method.** Read-only, against E33 `e33c12a9` and accepted browser source `050b0409`; no agents.

## Answers

1. **The gate covers the journey only.** E33 checks the password only when `openAccess` is false
   (`private-access-routes.ts` 586–592), and a missing or malformed hash keeps the gate closed.
   - The client auto-POSTs `/unlock` only when the session endpoint reports `openAccess === true`
     (`EarlyAccessRoute.tsx` 229–237). With `false`, a session-less visitor stays at the unlock form.
   - The gate applies to the Early Access route and APIs, so marketing pages and assets stay public.
   - The existing salted scrypt format is reused, and no new scheme is invented.
2. **The prestates are correct.** A and B must each have a live **member** session and a **native E33 Early Access
   session unlocked for the gated origin**.
   - The accepted browser allows only request-intent submit and recovery POSTs, so any unlock or password POST
     during a scenario is refused (`UNAPPROVED_MUTATION`). The browser never enters the password.
   - If B lacks a valid Early Access session, B's recovery fails closed, because Doc 210 requires exactly
     `200 {receipt:null}`. It cannot pass vacuously.
   - The anonymous context stays unauthenticated and un-unlocked, and the accepted 401/403 or null-receipt denial
     still applies.
   - The point that a fresh Early Access session secret invalidates states signed under any earlier secret is
     correct. Final A and B states can only be prepared **after** the final configuration is active.
3. **The boundaries are stated truthfully.**
   - The hash's presence, provenance, format validity and password custody are all **UNVERIFIED**.
   - The fallback (a new staging-only gate password plus its canonical hash) must be **named** in the one
     consolidated approval, not folded into the session-secret approval.
   - Account creation, grants and state exports need separate authority.
   - Nothing was generated, read or exported.

## Added notes (not defects)

- **Member token lifetime.** Member Supabase access tokens are short-lived, about an hour by default. The accepted
  browser fails closed with `MEMBER_CREDENTIAL_CHANGED` if the UI refreshes its token mid-run. Prepare the A and B
  states close to the run window, within both the member token's lifetime and the 240-minute Early Access session
  lifetime.
- **Exposure.** The gate resolves the public-exposure point Doc 217 raised for the request journey.

## Still open: the private operator inspection

These are Samuel's six status groups:

- database isolation;
- service-key isolation;
- session-secret isolation;
- gate-hash availability and custody;
- two existing staging member accounts;
- the complete inventory and Save-only readiness.

After those, Root's one consolidated approval, then the separate E33 deploy, session use, SQL and hosted-run
authorities.

NOT LIVE.

Comment text for KAN-31, for Root to relay: `REVIEW | KAN-31 | gated journey amendment (Core e6dc67b6, GATED_JOURNEY_AMENDMENT_UNAPPLIED.json b4a8f5cb) | reviewer 6abf1edf | ACCEPTED: OPEN_ACCESS=false + existing valid staging-only hash gates only the EA journey (password checked only when openAccess false; client auto-unlock only when openAccess true; marketing stays public); A/B prestates (live member + native EA-unlocked for gated origin) correct for unchanged browser, which refuses unlock/password POSTs and fails closed if B is not unlocked; truthful UNVERIFIED hash/custody and named-fallback boundary; Doc 217 conditions preserved. Note: prepare A/B states close to the run (member token ~1 h, EA TTL 240 min; refresh fails closed) | next: Samuel's six-group private inspection, then one consolidated approval | doc 218.`

Not an operation, credential, session, deployment, approval or production consent; not human approval.
