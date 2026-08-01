# Partner portal registration packet

For the release authority. Two edits, both one line of real change, in two files that
only the release authority may touch. Everything else is already merged, tested, and
proven safe from outside the seam.

Written against `origin/main` at `b911babc3ebc459dcff8fba647384a50a53e5271`.

## What is wrong today

PR #204 merged sixteen partner API contracts into `server/research/partners/`. None of
them is reachable, for two independent reasons:

1. **Not registered.** The router is never mounted. Registration is one call inside
   `server/index.ts`, whose content hash is pinned in
   `docs/phase2/CORE_SITE_PROTECTION_MANIFEST.json`. The file and the manifest must move
   in the same commit or the core-site protection tripwire fails, so a build lane cannot
   ship it.
2. **Walled.** Even once registered, the `/api/research` gateway wall in
   `server/research/index.ts` runs before route matching and answers a bearer-only
   partner request `401 {"ok":false,"message":"Access required."}`. `/partner` is in none
   of its allow lists. Verified below.

Both must land for the portal to work. Either one alone leaves it dark.

## Edit 1 of 2: register the router

**File:** `server/index.ts` (hash-pinned; update
`docs/phase2/CORE_SITE_PROTECTION_MANIFEST.json` in the same commit)

### The imports

Add alongside the other research imports near the top of the file. The existing
`registerCommerceApi` import sits at line 14 on the base SHA; anywhere in that block is
fine, these two modules have no import-order constraints.

```ts
import { registerPartnerPortalApi } from "./research/partners/portal-routes";
import { partnerSubmissionsEnabled, resolvePartnerPortalPort } from "./research/partners/portal-production";
```

### The call site

Directly after the existing `registerCommerceApi(...)` call. On the base SHA that block
ends at line 218. The surrounding context is reproduced verbatim so there is no ambiguity
about where the new call goes; **only the marked lines are new.**

```ts
const adaptGuard =
  (guard: (req: Request, res: Response, next: NextFunction) => unknown) =>
  async (req: Request, res: Response, next: () => void): Promise<void> => {
    await guard(req, res, next as unknown as NextFunction);
  };
registerCommerceApi(app, commerceDependencies, {
  requireActiveMember: adaptGuard(requireActiveMember),
  requireMember: adaptGuard(requireMember),
  requireAdmin: adaptGuard(requireSupabaseAdmin),
});
// >>> NEW: the sixteen partner portal contracts from PR #204. Same injected
// >>> member guard as the commerce lane, so there is no parallel auth.
registerPartnerPortalApi(
  app,
  { port: resolvePartnerPortalPort(), submissionsEnabled: partnerSubmissionsEnabled() },
  { requireMember: adaptGuard(requireMember) },
);
// >>> END NEW
registerMemberCatalogApi(
  app,
  buildMemberCatalogProductionService(),
  requireActiveMember,
);
```

`adaptGuard`, `requireMember`, `Request`, `Response`, and `NextFunction` are all already
in scope at that point. No other declaration is needed.

### Why the call is safe to paste

`registration-readiness.test.ts` mounts this exact expression into a real Express app
and drives all sixteen contracts over real HTTP. It asserts, before the seam is touched:

- the production expression compiles and registers exactly sixteen routes
- every contract answers over HTTP, and the same paths 404 without the call
- an anonymous request is answered by the guard **and the data port is never called**
  (spy asserted at zero, so a handler running before the guard cannot pass)
- a guard that admits without attaching a member still yields 403, never data
- a member with no partner account gets `404 partner_not_found`
- organization and event reads are scoped to the credential, including when a partner id
  is planted in the body, the query string, and the path at once
- no member identity and no supplier cost, multiplier, or margin field appears in any of
  the sixteen payloads
- `AFFILIATE_COMMISSION` is tagged and `WHITE_LABEL_WHOLESALE` never appears
- every write verb on the payout path is a real Express 404
- `Cache-Control: no-store` and `Referrer-Policy: no-referrer` on every answer

### Resulting route list

Sixteen routes, read out of the Express router by the test, not declared by hand.

| Method | Path |
| --- | --- |
| GET | `/api/research/partner/onboarding` |
| GET | `/api/research/partner/training` |
| GET | `/api/research/partner/leads` |
| GET | `/api/research/partner/conversions` |
| GET | `/api/research/partner/commissions` |
| GET | `/api/research/partner/payouts` |
| GET | `/api/research/partner/resources` |
| GET | `/api/research/partner/campaigns` |
| GET | `/api/research/partner/events` |
| GET | `/api/research/partner/organizations` |
| GET | `/api/research/partner/compliance` |
| GET | `/api/research/partner/security/sessions` |
| POST | `/api/research/partner/campaigns/request` |
| POST | `/api/research/partner/events/request` |
| POST | `/api/research/partner/organizations/request` |
| POST | `/api/research/partner/compliance/submissions` |

Unchanged and still owned by `server/research/commerce/routes.ts`:
`/api/research/partner/me`, `/partner/dashboard`, `/partner/apply`, `/partner/links`.

### What these routes will actually answer on first deploy

Without Supabase credentials, `resolvePartnerPortalPort()` returns the unconfigured port
and every contract answers `404 partner_not_found`, which the pages render as their
prepared-state copy. Nothing is fabricated and nothing half-works. This is asserted, not
assumed, in the last test of `registration-readiness.test.ts`, which now DELETES
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in a `beforeEach` (restoring them after) so
the unconfigured precondition is established by the test rather than inherited from the
shell. Before that pin, the same test built the Supabase port in any environment carrying
those variables and issued sixteen live queries, timing out at five seconds: green
locally, a false blocker in a configured CI.

With Supabase configured, the reads are live against tables that already exist in the
shipped schema. Three surfaces stay honestly empty because the schema has no table behind
them, named in the header of `server/research/partners/portal-production.ts`: the
approved asset library, partner session history, and campaign/event/organization request
intake. The request forms answer `503 capability_disabled` rather than reporting a
success that did not happen.

## Edit 2 of 2: admit `/partner` at the gateway wall

**File:** `server/research/index.ts`, line 254 on the base SHA.

### The verification, done

Claim checked directly against current `main`. It is **true**, and it is broader than
reported.

- `MEMBER_AUTHED_PREFIXES` is `["/member", "/activation", "/catalog", "/orders"]`.
  `/partner` is absent.
- `/partner` is also absent from `MEMBER_SESSION_READ_PATHS`,
  `MEMBER_SESSION_WRITE_PATHS`, `MEMBER_SESSION_REPLACE_PATHS`,
  `MEMBER_SESSION_REMOVE_PATHS`, `DOWNSTREAM_MEMBER_GUARDED_READ_PATHS`, and every
  anchored predicate.
- `grep -n partner server/research/index.ts` returns **nothing**. The string does not
  appear in the file at all.
- The wall is mounted `app.use("/api/research", ...)` and runs before route matching, so
  it answers regardless of whether a partner route exists.
- Consequence: in password-gated mode a member who signed in with Member Login and never
  typed the shared review password is answered `401 Access required.` on every partner
  path, and the partner route's own guard never runs.
- **Wider than the sixteen new contracts.** The commerce lane's four older partner paths
  (`/partner/me`, `/partner/dashboard`, `/partner/apply`, `/partner/links`) are walled by
  the same omission today. That is why the partner pages have never had a working
  authenticated read in password-gated mode.
- This is a lockout, not an exposure. It fails closed.
- It is not mitigated by public mode: with `RESEARCH_PUBLIC=true` the wall short-circuits
  and the partner routes work, but that is not the mode the research surface ships in.

### The change

```ts
// before
const MEMBER_AUTHED_PREFIXES = ["/member", "/activation", "/catalog", "/orders"];

// after
const MEMBER_AUTHED_PREFIXES = ["/member", "/activation", "/catalog", "/orders", "/partner"];
```

The bypass stays tied to a real credential: the branch that consults this list is
`if (bearer && MEMBER_AUTHED_PREFIXES.some(...))`, so a request with no
`Authorization: Bearer` is still walled. That is asserted permanently in
`partner-gateway-wall.test.ts` and must keep passing after the change.

### A note on prefix versus exact paths

`MEMBER_AUTHED_PREFIXES` is a bare-prefix list. The newer `MEMBER_SESSION_*` sets are
deliberately exact or anchored, under the rule stated in that file that a future route
added under a namespace should be walled by default. Adding `/partner` to the prefix list
therefore admits any future `/api/research/partner/*` route automatically.

That is acceptable here, and it is the change this packet recommends, because every
partner route in both owning modules is already behind the injected `requireMember` guard
and resolves the partner from the authenticated member only. If you prefer to keep the
stricter posture, the alternative is to add the twelve GET paths to
`MEMBER_SESSION_READ_PATHS` and the four POST paths to `MEMBER_SESSION_WRITE_PATHS`
(plus the four commerce paths), at the cost of a twenty-line change that must be updated
whenever a partner route is added. The one-line prefix is the recommendation; the choice
is yours and both are compatible with the tests below.

### The accompanying test edits

In the **same commit**, in `server/research/partners/partner-gateway-wall.test.ts`:

1. Delete the two tests in the `describe("BLOCKER, current state: ...")` block. Both are
   named `DELETE WITH THE FIX: ...`. Delete the whole `describe` and its header comment.
2. Change `it.fails(` to `it(` on the two tests in
   `describe("THE FIX: /partner belongs in MEMBER_AUTHED_PREFIXES")`. Both are named
   `PENDING ONE-LINE FIX: ...`. They then stand as ordinary regression tests.
3. Leave the `describe("the wall, characterised where the fix does not change it")` block
   untouched. It passes in both states.

This sequence was rehearsed end to end before this packet was written: with `/partner`
appended and those edits applied, the file is 5 passed / 0 failed. Without them, it is
5 passed / 2 expected-fail.

## The exact commands that prove it worked

Run from the repository root, after both edits.

```bash
# 1. The registration itself, at the HTTP layer.
npx vitest run server/research/partners/registration-readiness.test.ts
#    expect: 23 passed

# 2. The wall. After the edits above this must be fully green with no expected-fail.
npx vitest run server/research/partners/partner-gateway-wall.test.ts
#    expect: 5 passed, 0 expected fail
#    a remaining "expected fail" means the .fails markers were not removed
#    a failure in "keeps every partner path walled when no credential is presented"
#    means the widening was made too broad and admits an unauthenticated caller

# 3. The rest of the partner lane, unchanged by either edit.
npx vitest run server/research/partners

# 4. The pinned-seam tripwire. Fails until the manifest hash for server/index.ts
#    is regenerated in the same commit.
node scripts/acceptance/verify-core-site-protection.mjs
#    expect: RESULT: PASS

# 5. Types and the full suite.
npm run check
npx vitest run
```

Note on step 5: `server/release-control-plane.test.ts` is a known machine-dependent
timeout under parallel load. If it times out, re-run it alone.

## Live smoke test after deploy

In password-gated mode, with a member bearer and no review-password cookie:

```bash
curl -i -H "Authorization: Bearer <member jwt>" https://<host>/api/research/partner/commissions
```

- `401 {"ok":false,"message":"Access required."}` means edit 2 did not land. The wall is
  still answering.
- `404 {"ok":false,"code":"partner_not_found"}` means both edits landed and the acting
  member simply owns no partner account. This is success.
- `200 {"ok":true,"entries":[...]}` means both edits landed and the member is a partner.
- `404` with an HTML body, or a Vite index page, means edit 1 did not land and the path
  matched nothing.

## Rollback

Each edit is independently revertable and neither writes data.

- Revert edit 1 and the sixteen routes disappear; the pages return to the pending state
  they render today. No stored state changes, because the only write path
  (`/compliance/submissions`) is refused with `capability_disabled` unless Supabase is
  configured.
- Revert edit 2 and partner requests are walled again, which is the current behaviour.

## Files in this candidate

- `server/research/partners/registration-readiness.test.ts` (new) - proves the seam edit
  before it is made.
- `server/research/partners/partner-gateway-wall.test.ts` (new) - proves the wall
  blocker, and carries the post-fix expectation as `it.fails`.
- `docs/qa/PARTNER_REGISTRATION_PACKET.md` (new) - this file.

No production source file is modified by this candidate.
