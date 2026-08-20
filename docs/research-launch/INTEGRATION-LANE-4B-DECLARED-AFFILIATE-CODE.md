# Lane 4B: the customer-declared affiliate code + the referral link 404

Branch `lane/affiliate-attribution-core`, rebased onto the integration head
`cf649c1`. Answers the lead's `MANUAL-AFFILIATE-CODE-DESIGN` message (founder
requirement 5) and the `/r/:code` question routed from the conversion-QA
adjudication.

## Part 1 — a defect found while answering the `/r/:code` question

**Every referral link and QR code a partner would be given pointed at a 404,
and the fallback could not carry a signed code either.** Two individually
correct modules, one dead seam:

1. `attribution.ts` and `member-linkage.ts` each built share URLs as
   `{base}/r/{code}`. The composition root mounts the door at **`/api/r/:code`**
   (the route census forbids non-`/api` paths). Nothing serves `/r/`, so every
   issued link — and `qrPayloadFor`, which returns that same URL — answered 404
   and captured nothing.
2. The other entry cannot substitute. `client/src/research/referral-capture.ts`
   only forwards codes matching `^[A-Za-z0-9_-]{2,64}$`, and a signed Gen 2
   code is ~72 characters containing dots:

   ```
   v1.cGFydG5lci0x.bm9uY2UtYWJj.m3LSDKLbkC491Ao-OReCOIf-6L9eFkaj7YeKbssULLA
   ```

   So `/research?ref=<signed code>` is dropped in the browser before any
   request is made. Short **stored** codes (`SPRING24`) do travel that way;
   signed ones never do.

**Fixed in this lane.** Both copies of the URL builder are replaced by one
exported `referralShareUrl` over a single `REFERRAL_SHARE_PATH` constant, now
`"/api/r"` — a door that is actually served and that handles signed codes.
Regression tests pin the share URL to the mounted door and prove a signed code
survives the round trip. Because a link's URL is computed from its stored code
on every read, this retroactively fixes links already issued.

**Your decision, if you want the pretty URL.** `xeniostechnology.com/r/CODE` is
nicer for print and QR. It needs a route census exception; when you grant one,
flip the single constant to `"/r"` and register the door — nothing else
changes:

```ts
// server/index.ts, beside the existing referral door registrations
app.get("/r/:code", referralDoor("/r/:code"));
```

I did not add that line: `server/index.ts` is yours, and `/api/r/` works today
without an exception. My recommendation is to ship `/api/r/` for launch and
take the pretty path as a follow-up.

**Also worth routing:** the client `PLAUSIBLE_CODE` filter is a silent dropper.
It is correct for short codes, but if anyone ever puts a signed code in a
`?ref=`, it will vanish with no error. `client/src/research/referral-capture.ts`
is not my path — flagging rather than editing.

## Part 2 — the declared affiliate code

A **claim**, never an attribution. The two facts stay separate exactly as your
message required; nothing in this lane writes to `affiliate_attribution_ref`.

| Piece | File |
| --- | --- |
| Normalization, the four states, the append-only event model, projection, admin summary | `server/research/partners/declared-affiliate-code.ts` |
| Durable store (in-memory + Supabase) and the two operations callers use | `server/research/partners/declared-affiliate-code-store.ts` |
| Tests (26 + 18) | `…/declared-affiliate-code.test.ts`, `…-store.test.ts` |
| Founder-gated table candidate + sibling precheck/postcheck | `supabase/candidates/20260820_research_affiliate_declared_codes{,_precheck,_postcheck}.sql` |

### Design decisions I made, and why

**Whitespace is preserved, not refused.** Your guidance suggested refusing
whitespace. The shipped field is labelled *"Referral code or who referred you"*
and its own comment keeps internal spaces so `"Jane Smith"` survives — refusing
whitespace would throw away exactly the evidence the field invites and that you
need in order to match by hand. Instead each claim carries two values: the
customer's words verbatim (`rawCode`), and an alphanumeric `matchKey` so
`xen-101`, `XEN 101` and `Xen.101` all reconcile to `XEN101`.

**`@` is still refused, and nothing is stored when it is.** An address is
another person's identity, and this table must not become somewhere third-party
PII accumulates — the same rule the touch ledger and the bindings table follow.
The event records *that* an unusable entry arrived (`invalid_ignored`) with no
value at all, because a silent absence reads like a bug when an affiliate
insists they sent the customer.

**Events, not columns.** The capture is immutable — it is what the customer
typed. A manual match is a separate, later, named admin judgment, and a mistake
is corrected by appending `match_cleared` rather than rewriting. This is the
commission ledger's own discipline, and it means the table needs **no UPDATE
grant at all**: `service_role` holds SELECT and INSERT only, so append-only
survives an application defect.

**A separate table, not a column on the request row.** It keeps a claim
physically away from `affiliate_attribution_ref`, and it means **no change to
the M71 submit RPC** — that SECURITY DEFINER function stays byte-identical.

### The trap that would have bitten the wizard lane

`server/research/assisted-order/service.ts:393-396` deliberately pins
`affiliateAttributionRef: null` inside the **idempotency fingerprint** so a
replay whose cookie state changed still matches the original request. A
declared code must be excluded the same way. If `declaredAffiliateCode` enters
the fingerprint, a customer who retypes or clears the field on a retry forks
request identity and gets a **second order**. S3: add the field to the submit
input, but not to the fingerprint.

### Wiring (yours; I touched no file I do not own)

Capture at submit, after the request id exists:

```ts
import {
  recordDeclaredAffiliateCode,
  resolveDeclaredAffiliateCodeStore,
} from "../partners/declared-affiliate-code-store";

const declaredCodes = resolveDeclaredAffiliateCodeStore();

// Returns false when nothing was typed OR the store could not record it.
// It never throws: an unusable code must never stop an order.
await recordDeclaredAffiliateCode(
  declaredCodes,
  storedRequestId,
  input.declaredAffiliateCode,
  new Date(),
);
```

Admin projection:

```ts
import { declaredAffiliateCodeFor } from "../partners/declared-affiliate-code-store";
import { declaredAffiliateCodeSummary } from "../partners/declared-affiliate-code";

const claim = await declaredAffiliateCodeFor(declaredCodes, requestId);
// One sentence, already carrying its own unverified labelling:
//   Customer-entered "xen-101" (unverified, awaiting manual match)
const line = declaredAffiliateCodeSummary(claim);
```

The wording deliberately matches `communications.ts`'s `affiliateLine`, which
already renders `declaredAffiliateCode` as `customer-entered "…" (unverified)`,
so the email and the admin screen cannot describe the same fact differently.

Contract field for S3 (`shared/research/assisted-order/contract.ts`), optional
and inert:

```ts
  /**
   * A code the CUSTOMER typed. A claim awaiting manual matching — never an
   * attribution. It changes no price, access, payment, eligibility, or
   * ownership, and must NOT enter the idempotency fingerprint.
   */
  declaredAffiliateCode?: string;
```

S3 reuses `EarlyAccessReferralField` as your message specified; prefill from
`?ref=` is fine, and the verified cookie remains the authority regardless of
what the field contains.

## SQL

Additive: one new table, no existing table/column/grant/routine touched, so it
cannot disturb the live Early Access path. Precheck expects `APPLY_READY`,
postcheck `DEPLOYED_AND_LOCKED`. A partial unique index enforces one capture
per request. **Applying it is a production mutation needing Samuel's current
explicit approval.** Until then `recordDeclaredAffiliateCode` returns false, the
order completes normally, and admin honestly shows no claim.

## Gates

```
npx vitest run server/research/partners server/research/assisted-order server/research/commerce shared/research
  -> 80 files, 1811 passed, 3 skipped
npm run check -> clean
```
