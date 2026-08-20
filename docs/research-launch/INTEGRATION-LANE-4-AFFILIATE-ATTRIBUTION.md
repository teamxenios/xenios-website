# Lane 4 integration: the durable affiliate attribution binding

Branch `lane/affiliate-attribution-core`, cut from `5bb3fa9` (the launch
integration head). This packet carries the wiring Lane 4 could not do itself
because the target files belong to active writers: `server/index.ts` and
`server/research/early-access/register.ts` (both dirty in the lead's tree
right now) and `supabase/**` application, which is founder-gated.

Everything Lane 4 owns is committed and inert: the modules compile, are fully
tested, and **nothing in the running process calls them until the lead pastes
the two blocks below.**

## The gap this lane closes

The Gen 2 spine (Lane B, `3121dfd`) captures a referral as an append-only
touch plus a signed `xr_aff` cookie, and the assisted-order submit reads that
cookie server-side. The Early Access cart lane (Lane C, `5389a9e`) reads a
*durable* referral grant at checkout and settlement.

Nothing connected the two. Concretely, at `5bb3fa9`:

- `SupabaseEarlyAccessReferralGrantWriter` (EA `commerce-ports.ts`) has **zero
  production callers**. Its own comment says the caller is "the customer-bind
  seam"; that seam was never built.
- The cookie was therefore the *only* carrier of attribution across sign-in. A
  cleared cookie, a 30-day expiry, or a different browser silently destroyed a
  legitimate affiliate's credit **before any order existed**.

Lane 4 builds the missing middle: the first request that carries BOTH a
verified cookie AND a resolved customer identity writes a durable,
customer-keyed binding. From then on the attribution survives the cookie.

## What Lane 4 shipped (no wiring required)

| Piece | File |
| --- | --- |
| Durable binding record, insert-if-absent store (in-memory + Supabase), the binder, and the identity-source decorator | `server/research/partners/customer-attribution-binding.ts` |
| Binding → Early Access referral grant translation, with the `pending_program` refusal and the stable long-code digest | `server/research/partners/early-access-grant-adapter.ts` |
| Binder / store / decorator negatives (spoof, forge, tamper, expire, self-referral, store failure, first-bind-wins) | `server/research/partners/customer-attribution-binding.test.ts` |
| Grant translation negatives and the exact EA grant shape | `server/research/partners/early-access-grant-adapter.test.ts` |
| End-to-end spine: real capture door → real cookie → bind → grant | `server/research/partners/attribution-spine.test.ts` |
| Founder-gated table candidate + sibling precheck/postcheck | `supabase/candidates/20260819_research_affiliate_customer_bindings{,_precheck,_postcheck}.sql` |

**373 tests pass** across `server/research/partners`,
`server/research/assisted-order`, and `shared/research/affiliate-program`;
`npm run check` is clean.

## The trust boundary, restated

The browser may present a **referral code** and nothing else. It cannot
provide, and this lane never reads from a request body/header/query:

| Fact | Source |
| --- | --- |
| `affiliate_id` (partnerId) | the HMAC-verified `xr_aff` payload, only |
| commission rate | `resolveAffiliateProgram(env)`, read at translation time |
| commission amount | the commission ledger, never this lane |
| paid / payout status | the payout ledger, never this lane |

`isOpaqueSubjectKey` refuses an address-shaped or whitespace-bearing customer
key **before** anything is read, so the binding table cannot become a place
identity is stored.

## (a) `server/research/early-access/register.ts` — one wrapped expression

The bind moment is where Early Access already resolves identity. At
`register.ts:799` the composition builds `const identity = ...`. Wrap that
final expression; **nothing else changes**, and the decorator returns the
inner directory's answer unchanged in every case — bind success, refusal, or
store failure — so attribution can never break a customer's session.

```ts
import {
  createCustomerAttributionBinder,
  resolveAffiliateCustomerBindingStore,
  withCustomerAttributionBinding,
} from "../partners/customer-attribution-binding";
import { resolveAffiliateProgram } from "@shared/research/affiliate-program/config";
```

```ts
  const identity = withCustomerAttributionBinding(
    options.identity ??
      (options.sessionIdentity === true
        ? new SessionScopedEarlyAccessIdentityDirectory({
            resolveSession,
            readSessionId,
            primary: boundIdentity,
            continuitySecret: effectiveConfig.sessionSecret,
          })
        : boundIdentity),
    createCustomerAttributionBinder({
      // The SAME secret that signs partner codes and the cookie. Absent =>
      // nothing verifies, so nothing binds. Fail-closed, spine-wide.
      linkSecret: process.env.RESEARCH_PARTNER_LINK_SECRET ?? null,
      bindings: resolveAffiliateCustomerBindingStore(),
      // Null until AFFILIATE_PROGRAM_ENABLED === "true". A null program still
      // BINDS (stamped pending_program); it just carries no economics.
      program: resolveAffiliateProgram(process.env),
    }),
  );
```

Note the decorator only touches the store when the raw `xr_aff` cookie is
actually present, so ordinary requests pay one string scan.

### Optional: the self-referral check at bind time

If the composition can map an EA customer ref to that customer's own partner
id, pass `ownPartnerIdFor`. It is optional because a *missing* answer must not
read as permission — the grant adapter and the settlement lane both refuse
self-referral again where money actually moves.

## (b) The grant write — where economics enter

`earlyAccessGrantFromBinding` / `writeEarlyAccessGrantFromBinding` translate a
binding into the exact `EarlyAccessReferralGrantInput` the EA writer accepts.
Call it **only** when the founder has activated the program; while
`resolveAffiliateProgram` returns null it answers `pending_program` and
performs no lookup and no write.

```ts
const written = await writeEarlyAccessGrantFromBinding(
  new SupabaseEarlyAccessReferralGrantWriter(run),
  binding,
  {
    program: resolveAffiliateProgram(process.env),
    // Joins the Gen 2 partner directory to the EA customer directory. Null
    // => "affiliate_unmapped": no grant, and nothing invented.
    affiliateCustomerRefFor: async (partnerId) => /* composition-owned */ null,
  },
);
```

`holdBasisPoints` is the program's **first-order** rate. The grant is written
when the customer arrives, before any order exists, and the hold is a
reservation ceiling — the ledger still computes what actually pays per order
(first vs repeat, window, partner state). Reserving high can only over-reserve,
never over-pay.

`affiliateCustomerRefFor` is the one piece Lane 4 deliberately did not invent:
the Gen 2 partner directory and the EA customer directory are different
identity spaces, and fabricating a mapping would fabricate an affiliate.

## (c) SQL — founder-gated, additive, one new table

`supabase/candidates/20260819_research_affiliate_customer_bindings.sql`
creates `research_affiliate_customer_bindings` and nothing else. It is
**purely additive**: no existing table, column, grant, or routine is touched,
so it cannot disturb the live Early Access path.

First-bind-wins is enforced at the privilege level, not just in code: the
PRIMARY KEY makes a second bind a conflict, and `service_role` is granted
**SELECT and INSERT only** — no UPDATE, DELETE, or TRUNCATE — so no
application defect can re-point an attribution that already landed. RLS is
enabled with no policies; `anon` and `authenticated` hold nothing.

Run the sibling precheck (expect `APPLY_READY`) before applying and the
postcheck (expect `DEPLOYED_AND_LOCKED`) after. **Applying it is a production
mutation and requires Samuel's current explicit approval.**

Until it is applied, the Supabase branch's insert fails, the binder answers
`store_unavailable`, the journey continues untouched, and attribution is
honestly not recorded rather than falsely claimed.

## Negative guarantees the tests pin

- A **spoofed affiliate id** in a request body is ignored — there is no code
  path that reads one.
- A **forged, tampered, or expired** cookie binds nothing (`no_attribution`).
  Swapping the partner id inside the payload invalidates the signature.
- An **invalid code** yields a normal journey: 204, no cookie, no touch, no
  binding, no grant.
- A customer **cannot change attribution after binding** — a rival partner's
  valid cookie arriving after sign-in returns the standing binding unchanged.
- An **affiliate cannot create their own commission**: self-referral is
  refused at bind and again at translation.
- **No cross-affiliate reads exist**: the store offers only
  `putBindingIfAbsent` and `findByCustomerKey`; there is no partner-scoped
  enumeration, so no affiliate can list who was bound to anyone.
- **No economics without approval**: a null program still preserves
  attribution as `pending_program` and refuses to emit a rate.

## Gates run on this branch

```powershell
npx vitest run server/research/partners server/research/assisted-order shared/research/affiliate-program
npm run check
```

Result: 21 files / 373 tests passed; `tsc` clean.
