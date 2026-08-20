# Handoff: declared affiliate code + referral share-path fix (Lane 4B)

- **Session:** `claude-fable-lane4-affiliate`
- **Branch:** `lane/affiliate-attribution-core` (pushed)
- **Exact SHA:** `ccd7f5f9b4f26e4145a32ab75827fbe95dc81e53`
- **Rebased onto:** `cf649c1` (integration head)
- **Packet:** `docs/research-launch/INTEGRATION-LANE-4B-DECLARED-AFFILIATE-CODE.md`
- **Assignment:** lead message `2026-08-20T15-00-00-000Z-MANUAL-AFFILIATE-CODE-DESIGN`
  plus the `/r/:code` question routed in `…16-00-00-000Z-QA-FINDINGS-ADJUDICATED`.

## 1. Defect found and fixed: partner links pointed at a 404

While answering the `/r/:code` question I found the failure is total, not
cosmetic. Signed referral links were broken on **both** available paths:

- `attribution.ts` and `member-linkage.ts` each built `{base}/r/{code}`, but
  the composition root mounts **`/api/r/:code`** (route census forbids non-`/api`
  paths). Nothing served `/r/`, so every issued link — and `qrPayloadFor`,
  which returns that same URL — answered 404 and captured nothing.
- `/research?ref=` cannot substitute: the client filter is
  `^[A-Za-z0-9_-]{2,64}$` and a signed code is ~72 chars containing dots, so it
  is dropped in the browser before any request is made. Short **stored** codes
  do travel that way; signed ones never do.

Fixed by collapsing the two URL builders into one exported `referralShareUrl`
over a single `REFERRAL_SHARE_PATH = "/api/r"`. Regression tests pin the share
URL to the mounted door and prove a signed code round-trips and still verifies.
Already-issued links follow automatically (a URL is computed from its stored
code on every read, never persisted).

**Decision for the lead:** ship `/api/r/` for launch. The prettier
`/r/CODE` needs a route census exception; when granted, flip the one constant
and register `app.get("/r/:code", referralDoor("/r/:code"))`. Snippet in the
packet. I did not add it — `server/index.ts` is yours.

## 2. The declared affiliate code (founder requirement 5)

A claim, never an attribution. Nothing here writes `affiliate_attribution_ref`.

- Keeps the customer's words verbatim (`"Jane Smith"` survives — the shipped
  field invites it) plus an alphanumeric `matchKey` so `xen-101`, `XEN 101`,
  `Xen.101` all reconcile to `XEN101` for manual matching.
- Refuses an `@` entry and stores **no value**, but does record that something
  unusable arrived — silence would read like a bug when an affiliate insists
  they sent the customer.
- Four states: `not_provided`, `captured_unmatched`, `matched_manual`,
  `invalid_ignored`.
- Append-only events: capture is immutable; a manual match and its correction
  are separate, named admin events. The table needs **no UPDATE grant**.
- Nothing can throw into a submit path: an unusable or unstorable code never
  stops an order.

Files added: `declared-affiliate-code.ts`, `declared-affiliate-code-store.ts`,
two test files, and `supabase/candidates/20260820_research_affiliate_declared_codes{,_precheck,_postcheck}.sql`.

## 3. Trap the wizard lane must not step in

`server/research/assisted-order/service.ts:393-396` deliberately pins
`affiliateAttributionRef: null` inside the **idempotency fingerprint** so a
replay with changed cookie state still matches. `declaredAffiliateCode` must be
excluded identically. If it enters the fingerprint, a customer who retypes or
clears the field on a retry forks request identity and receives a **second
order**.

## 4. Flagged, not edited (not my path)

`client/src/research/referral-capture.ts` — `PLAUSIBLE_CODE` silently drops any
code it does not like. Correct for short codes, but it fails closed with no
signal. Worth a comment at minimum so nobody later assumes `?ref=` carries
signed codes.

## Integration hooks needed

1. Call `recordDeclaredAffiliateCode(...)` at submit, after the request id
   exists (exact snippet in packet). Never blocks the order.
2. Render `declaredAffiliateCodeSummary(...)` on the admin request screen. The
   wording already matches `communications.ts`'s `affiliateLine`.
3. Add the optional `declaredAffiliateCode?: string` contract field for S3 —
   **excluded from the fingerprint**.
4. Optional: the `/r/:code` census exception.

## Schema expectations

One new table, purely additive; no existing table, column, grant, or routine is
touched, so the live Early Access path cannot be disturbed. Precheck expects
`APPLY_READY`, postcheck `DEPLOYED_AND_LOCKED`. A partial unique index enforces
one capture per request. `service_role` holds SELECT + INSERT only; RLS on with
no policies. **No change to the M71 submit RPC.**

**Applying it is a production mutation requiring Samuel's current explicit
approval.** Until applied, `recordDeclaredAffiliateCode` returns false, the
order completes normally, and admin honestly shows no claim.

## Gates at this SHA

```
npx vitest run server/research/partners server/research/assisted-order server/research/commerce shared/research
  -> 80 files, 1811 passed, 3 skipped
npm run check -> clean
```

## Production mutated

NO.
