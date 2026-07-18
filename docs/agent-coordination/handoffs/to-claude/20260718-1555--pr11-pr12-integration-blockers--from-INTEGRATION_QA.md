# Handoff: PR #11, PR #12, and PR #15 integration blockers

**From:** INTEGRATION_QA
**To:** CLAUDE_PRIMARY
**Versioned by:** CODEX_UI at the integration lane's request
**Date:** 2026-07-18
**PR #11 head reviewed:** `9cf711ee718e5f0719419cf9b2ba3a060cc110b9`
**PR #12 head reviewed:** `3adfadea78531c2cc606e54282ed308840407bd9`
**PR #15 head reviewed:** `0d0814c`
**Decision:** **Do not merge any reviewed PR until the blockers below are addressed and re-reviewed.**

This is a non-code handoff so Claude can read the integration findings through Git. PR #13 does not modify the referenced backend, admin, shared-contract, or Supabase source files.

## Integration protocol

INTEGRATION_QA is an explicit third participant in the repository protocol. Read docs/agent-coordination/status/INTEGRATION_QA.md before merging or starting an overlapping lane. Findings are advisory until versioned; once versioned, every P1 below blocks merge until the owning lane addresses it and INTEGRATION_QA re-reviews the revised commit.

## PR #12: referral foundation

### P1: reward and ledger transitions are not atomic

- `server/research/referrals.ts:168-195` inserts a held reward and then updates the attribution in a separate unchecked operation. A failure after the insert leaves a reward with an attribution that can be retried into a duplicate-key result rather than a consistent qualified state.
- `server/research/referrals.ts:214-236` changes the reward to `available` before inserting the ledger entry. If the ledger insert fails, the reward is already available and the credit is lost. Concurrent balance reads at `:223-231` can also calculate the same running balance.
- `supabase/research-referrals.sql:89-103` has no unique constraint on `member_credit_ledger.referral_reward_id`, so retry/concurrency protection does not prevent duplicate credit rows.

Required direction: move each money-bearing transition into a database transaction/RPC or another atomic compare-and-write boundary. Enforce ledger uniqueness for a referral reward and make retries return the committed result safely.

### P1: member-credit flag is unused and reward types are mixed

- `shared/research/referral-types.ts:26-35` defines `RESEARCH_MEMBER_CREDITS_ENABLED`, but `server/research/referrals.ts:17` gates all behavior only on `RESEARCH_REFERRALS_ENABLED`.
- `server/research/referrals.ts:168-179` accepts the program's `credit`, `benefit`, or `commission` reward type, while `server/research/referrals.ts:223-235` writes every matured reward into `member_credit_ledger` as `referral-earned` cents.

Required direction: enforce the member-credit flag before any credit reward or ledger write, and route non-credit reward types through separate typed handling instead of the credit ledger.

### P1: same-member self-referral is not checked

- `server/research/referrals.ts:104-113` disqualifies only an email match at application attribution time.
- `server/research/referrals.ts:148-162` loads both the referrer identity and activated `input.memberId`, but the code labeled "self-referral re-check" never compares `identity.owner_id` with `input.memberId`.

Required direction: compare the authenticated/activated member identity with the referral owner during qualification and disqualify a same-member referral even when emails differ.

### P1: disabled or out-of-window programs can pay

- `server/research/referrals.ts:64-72` selects an enabled default program but does not enforce `starts_at` or `ends_at`.
- `server/research/referrals.ts:157-179` reloads the attributed program only by ID and can create a reward after the program has been disabled or moved outside its active window.

Required direction: validate `enabled`, `starts_at`, and `ends_at` against the relevant attribution/activation time at capture and qualification, including before creating or promoting a reward.

## PR #11: admin review queue

### P1: UI states that email was sent even when delivery failed

- `client/src/pages/AdminResearchTab.tsx:259` says the information-request note is sent to the applicant.
- `client/src/pages/AdminResearchTab.tsx:287` says the approval email goes out immediately.
- `client/src/pages/AdminResearchTab.tsx:305` says the applicant receives a decline email.
- `client/src/pages/AdminResearchTab.tsx:330` says the applicant was emailed.
- The corresponding server calls intentionally detach and swallow delivery failure at `server/research/membership.ts:497-527` via `void ... .catch(() => {})`, while the admin action still returns success at `:485-486`.

Required direction: persist and return a delivery outcome or queue state, and make UI copy distinguish state transition success from email delivery success. Never claim delivery from the current response.

### P2: queue requests can race and leave stale actionable rows

- `client/src/pages/AdminResearchTab.tsx:92-103` loads a queue without aborting or sequencing requests; switching at `:107-120` allows an older response to overwrite the newly selected queue.
- `client/src/pages/AdminResearchTab.tsx:181-200` discards the action response and launches detail/list reloads without awaiting them. Action controls derived at `:206-207` can remain stale and actionable until both reads settle.

Required direction: cancel or sequence queue loads, ignore stale responses, immediately apply the returned transition, and suppress actions until the authoritative row/detail state is refreshed.

### P2: 200-row ceiling has no pagination

- `server/research/membership.ts:423-440` applies `.limit(200)` and returns no cursor, total, or next-page signal.
- `client/src/pages/AdminResearchTab.tsx:123-155` renders the returned array with no pagination or truncation warning.

Required direction: add server-side cursor/range pagination and visible paging/loading controls so older actionable applications cannot disappear silently.

### P2: list and detail DTOs expose more PII than each surface needs

- `server/research/membership.ts:423-440` uses `.select("*")` for the queue list.
- `client/src/pages/AdminResearchTab.tsx:8-28` uses one broad application type containing phone, occupation, organization, interests, goals, fit text, and referral fields even though the collapsed queue consumes only the fields rendered at `:129-148`.
- `server/research/membership.ts:447-457` also returns the raw application row for detail rather than an explicit admin DTO.

Required direction: define separate minimal list/detail DTOs and explicit select/mapping allowlists. Return sensitive fields only to the detail surface that needs them.

### P2: textarea and tab accessibility contracts are incomplete

- Queue tabs at `client/src/pages/AdminResearchTab.tsx:107-120` lack tab IDs, `aria-controls`, roving keyboard focus, and an associated `tabpanel`.
- Information and decline textareas at `client/src/pages/AdminResearchTab.tsx:259-267` and `:303-314` have nearby text/placeholders but no programmatic `<label>` or accessible name.
- The parent admin tabs at `client/src/pages/Admin.tsx:356-379` and `:386-408` likewise omit `aria-controls`, roving focus, and `tabpanel` relationships.

Required direction: implement the WAI-ARIA tab pattern or simplify to ordinary buttons/navigation, and provide explicit labels for every textarea.

## PR #15: member claiming and authentication

### P1: generic status tokens can be replayed to claim membership

- `server/research/members.ts:98` accepts the generic application status token as the claim credential.
- `server/research/membership.ts:49-65` creates a 90-day token that is not purpose-bound to membership claiming and has no one-time-use state.

Required direction: issue a short-lived, claim-specific, one-time token with server-side consumption/replay protection. A general application-status token must never authorize account creation or member claiming.

### P1: Auth user can be stranded when member insertion fails

- `server/research/members.ts:112-133` creates the Supabase Auth user before inserting the member row, with no transaction, compensating deletion, or resumable idempotent recovery when the second write fails.

Required direction: make the cross-system workflow recoverable and idempotent. Either compensate the created Auth user on member-write failure or persist a resumable claim state that safely completes on retry without creating an orphaned account.

### P1: expired approvals remain claimable

- `server/research/members.ts:101-105` checks application status but ignores `approval_expires_at` before allowing the claim.

Required direction: reject expired approvals using a server-side timestamp check before creating or linking any account/member state.

### P2: authorization trusts mutable JWT email instead of stored Auth identity

- `server/research/members.ts:60-76` authorizes member lookup using the JWT email claim.
- `supabase/research-members.sql:10` already stores `auth_user_id`, which is the stable identity binding.

Required direction: authorize by the verified JWT subject/Auth user ID and the stored `auth_user_id`. Treat email as profile/contact data, not the authorization key.

### P2: referral adapter does not bind a unique member identity

- `server/research/members.ts:179-208` selects referral identity by `owner_email` and miskeys balance lookup instead of binding the adapter to one unique member/Auth identity.

Required direction: join referral identity and balances through the stable member ID/Auth binding, enforce uniqueness, and never select or aggregate money state by mutable email.

### PR #15 review verification

- Focused suite: 10 of 10 passed.
- Full suite: 31 of 31 passed.
- Typecheck: only the pre-existing `server/storage.ts:48` implicit-`any` error remains.

Passing tests do not remove the authorization, replay, expiry, or partial-write blockers above. **PR #15 must not merge until addressed.**

## Coordination conflicts intentionally left for integration

PR #12 and PR #13 both add or edit these three coordination files:

- `docs/agent-coordination/integration/route-ownership.md`
- `docs/agent-coordination/project-state.md`
- `docs/agent-coordination/status/CLAUDE_PRIMARY.md`

Do not resolve those documentation conflicts in the backend/admin fix commits. Integration should reconcile them after the P1/P2 source fixes are ready and the final merge order is known.

## Production verification

INTEGRATION_QA rechecked https://xeniostechnology.com/research at 2026-07-18 15:42 CDT. It returned HTTP 503 with body "The research section is not configured." PR #14's environment-diagnostic work does not by itself prove the live gate is fixed.
