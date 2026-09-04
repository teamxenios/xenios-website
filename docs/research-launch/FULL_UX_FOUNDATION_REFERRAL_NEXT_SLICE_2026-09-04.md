# Full UX foundation: next referral slice

Date: 2026-09-04

Classification: source-inspected implementation handoff; not a production attestation

Scope: canonical Gen 2 partner links, capture and identity binding only

## Decision

Local engineering is unblocked. Continue on the existing Gen 2 partner authority; do not open a second affiliate registry, enable general commerce, or alter commission economics.

The next bounded slice should be **canonical link validity and member-owned link management, with truthful copy/share UX**. Public capture remains deliberately unavailable until its composed security requirements pass. Link management alone is not the complete Referral V1 requested by the founder.

A working production referral journey is not currently assembled. Source code has an existing revocation column, but no link-expiry field in its Gen 2 schema or durable account-binding migration. Do not label the full flow “no migration required” based on these files.

No founder input is needed to implement and test the local slice, author any justified migration candidate, or rehearse it against a disposable database. Production activation, real partner data writes and migration application require separate current authorization.

## Verified existing seams

Paths and symbols below were checked in the continuation worktree. Line numbers from the saved truth-map digest were not treated as current evidence.

| Seam | Existing implementation | Consequence |
| --- | --- | --- |
| Public DTO | `shared/research/commerce-api.ts`, `PartnerLinkDto`: code, URL, channel, campaign, nullable QR path | No validity, expiry, revocation or readiness field is available to the UI. |
| Canonical member mapping | `server/research/commerce/persistence/partners-store.ts`, `AsyncPartnerMemberStore.findByMemberId` | Reuse this member-to-partner authority; never accept an authoritative partner id from the browser. |
| Issuance service | `server/research/partners/member-linkage.ts`, `issueLinkForMember` | Resolves the member's partner and saves a minted code. No non-test caller found; issuance checks existence, not active/certified eligibility. |
| Link persistence | `server/research/commerce/persistence/partners-store.ts`, `AsyncPartnerLinkStore` | Insert/read/list only. Its row projection and SELECT omit id and revoked_at. Duplicate code is rejected, not overwritten. |
| Source schema | `supabase/production/research-full-production.sql`, `research_partner_links` | Existing columns include UUID id, partner_id, unique text code, channel, campaign, created_at and revoked_at. No expires_at. This source artifact does not establish live schema or grants. |
| Existing GET | `server/research/commerce/routes.ts`, GET `/api/research/partner/links` | Resolves partner from the injected member guard. No issuance/revocation HTTP endpoint exists. |
| Commerce coupling | `server/research/commerce/production-deps.ts`, `partnersFailClosed` and state-3 partner composition | Real partner/link reads exist only in commerce state 3; other states expose no partner. Do not activate commerce merely to make links work. |
| Independent portal | `server/research/partners/portal-routes.ts`; `server/index.ts` | Separate member-guarded partner portal is mounted behind system AND portal flags. It already resolves the same canonical member-to-partner relationship. |
| Existing page | `client/src/research/pages/partners/Links.tsx` | Fetches own links and supports clipboard copy. No creation, revocation/expiry display, native sharing, actual QR rendering or explicit copy-failure feedback. |
| Client gate | `client/src/research/section.tsx`; `client/src/research/layout.tsx` | Partner descendants still encounter the shared review gate. A server endpoint alone does not make the end-user journey accessible. |
| Declared code | `server/research/partners/declared-affiliate-code.ts` | Customer-entered code is deliberately a claim, distinct from verified attribution. Preserve that distinction. |

## Capture hazards that must be closed before mounting

The module `server/research/partners/referral-capture-routes.ts` defines GET `/r/:code` and GET `/api/research/referral/capture`. Neither capture descriptor has a production caller. `server/index.ts` explicitly records this deliberate containment.

1. **Signature OR row is accepted.** Capture accepts a verified signature without a stored link, or a stored unsigned code without a verified signature. Only disagreement between the two is rejected. An existing test explicitly permits unsigned stored codes. Change the authority contract and its tests together.
2. **Link validity is not checked.** The capture input cannot see revoked_at or link expiry, and does not require the partner to remain eligible.
3. **No first-valid capture preservation.** Capture ignores the incoming attribution cookie, generates a new visitor key for each attempt and replaces the cookie. Repeated clicks can overwrite attribution and add touches.
4. **No capture-level self-referral decision.** Anonymous visitors cannot be identified solely from a link. When identity becomes available, self-referral must be checked against canonical identity; do not accept a browser-declared identity.
5. **No durable replay/throttle contract.** The durable touch is appended before a cookie is minted, which is good fail-closed behavior, but retries are not deduplicated and no durable abuse limit is composed.
6. **Client path and format mismatch.** `client/src/research/referral-capture.ts` targets `/api/referral/capture`, whereas the descriptor is `/api/research/referral/capture`. Its plausibility regex also rejects dotted legacy signed codes. No production call to the helper was found.
7. **A valid cookie can outlive a revoked link.** `server/research/partners/attribution-cookie.ts` verifies HMAC and cookie expiry only. It does not reread current link or partner state. Fixing capture alone would leave already-issued cookies authoritative to consumers.
8. **Destination policy requires one composed contract.** The descriptor has its own same-site Research landing filter. Align the actual registered recipient routes, auth return policy and selected destination before exposing product-specific or Care recommendations. Do not broaden Care attribution through a generic Research link.

Existing signed codes in `partners/attribution.ts` embed a base64url partner identifier. They are authenticated, not opaque. Signature verification alone proves neither registration nor present eligibility.

## Durable identity binding: what exists and what does not

`server/research/partners/customer-attribution-binding.ts` already supplies:

- a cookie-derived binding record with no economics;
- insert-if-absent first-bind-wins storage keyed to an opaque customer identity;
- a Supabase adapter and a reference in-memory store;
- a non-blocking identity-source decorator, `withCustomerAttributionBinding`;
- an optional canonical self-partner check that fails closed if that lookup throws.

It does **not** establish an active production binding journey:

- `research_affiliate_customer_bindings` was found in `supabase/candidates/20260819_research_affiliate_customer_bindings.sql`, not in the migration directory;
- no non-test caller of `withCustomerAttributionBinding` was found;
- the optional self-check can be omitted, and link revocation is not revalidated;
- the source schema and dormant adapter do not prove the live table exists.

The binder's first-bind-wins guarantee is not the capture module's behavior. Keep those two facts separate.

`server/research/partners/early-access-grant-adapter.ts` is also uncomposed. It translates a binding into an Early Access grant carrying hold economics, and refuses an inactive program or unmapped/self affiliate. Do not wire that money-bearing adapter into the link-management slice.

## Recommended implementation sequence

### Slice R1: one canonical link-validity service and own-link UX

1. Extend the existing async link-store projection to include the existing id and revoked_at. Refuse malformed validity facts. Add store tests and a member-scoped revoke operation; preserve immutable code ownership.
2. Define a single current-link verifier over stored registration, current partner eligibility, revocation, issuance time and the chosen expiry policy. Every issuance/read/capture/cookie-consumer seam must eventually use this authority.
3. Preserve legacy links as explicit legacy/unavailable records unless their validity can actually be proven. Never present a link pointing to an unmounted recipient route as ready to share.
4. Decouple own-link endpoints from the general-commerce capability. Move, rather than duplicate, the existing GET registration into the independently gated Gen 2 partner controller, or inject an equivalently isolated canonical link dependency. Keep unrelated partner/commerce behavior unchanged.
5. Add strictly projected member-owned create/revoke actions only when durable idempotency and audit are composed. Reuse existing infrastructure where its actual schema and guarantees meet the need; no process-memory production substitute.
6. Extend existing `Links.tsx`: truthful readiness/expired/revoked states, create action only when permitted, copy success and manual fallback, native share only on user action, no raw partner identity or invented QR availability.
7. Replace the partner page's shared-review UX only with verified canonical member/partner authorization. Preserve all other private boundaries.

A narrow R1 can be completed and proven locally while its production doors remain off. If recipient capture is still unavailable, the UI must state that the recommendation service is not ready instead of offering a broken “Share” journey.

### Slice R2: capture, recipient return and account continuity

1. Finish store-backed capture, first-valid preservation, revocation/expiry rechecks, durable abuse/retry handling and identity-based self-referral denial.
2. Align one shared capture path and one allowed destination policy with actual routes and auth continuation.
3. Compose the existing durable customer binder after its schema has been governed and rehearsed. Keep customer-entered declared code distinct from verified attribution.
4. Prove link creation -> copy/share -> recipient landing -> safe sign-in return -> durable binding, plus negative controls.
5. Produce exact-source release evidence and request only the production actions actually needed. Do not couple this to commission activation.

## Can it use the existing schema?

| Requirement | Source-grounded answer |
| --- | --- |
| Read and enforce revocation | Existing Gen 2 schema artifact has revoked_at; local adapter/validity hardening is unblocked. Live column/grants still need verification before release. |
| Fixed expiry | Could be derived from server-owned created_at under an explicit fixed-lifetime policy; no new column inherently required. This policy is not implemented today. |
| Per-link configurable expiry | No expires_at exists in the inspected Gen 2 definition; requires a persisted design and potentially a migration. |
| Opaque, hash-only links that remain copyable later | Not supported by the existing DTO/service as written. A versioned server-reconstructible token/digest design may reuse id/code columns, but is a design option requiring review, not established readiness. Do not disguise tokens in campaign metadata. |
| Durable first-valid binding across accounts/devices | Existing candidate supplies the intended authority. No migration or production composition was found. Do not replace it with localStorage or an opportunistic touch-table convention. |
| Durable issuance idempotency | Generic infrastructure exists at `server/research/commerce/persistence/idempotency-store.ts` and `supabase/research-idempotency-keys.sql`; prove exact live availability and crash/retry semantics before relying on it. |
| A complete production link journey today | Not proven. Current capture is deliberately unmounted; account binding and several security contracts remain incomplete. |

## Proof targets

These are existing test files to extend, not results from this read-only inspection:

- `server/research/partners/member-linkage.test.ts`
- `server/research/commerce/persistence/partners-store.test.ts`
- `server/research/partners/portal-routes.test.ts`
- `server/research/partners/portal-production.test.ts`
- `server/research/partners/referral-capture-routes.test.ts`
- `server/research/partners/attribution.test.ts`
- `server/research/partners/attribution-cookie.test.ts`
- `server/research/partners/customer-attribution-binding.test.ts`
- `server/research/partners/attribution-spine.test.ts`
- `client/src/research/b2b/protected-composition.behavior.test.tsx`

Add focused tests for the existing Links page. Required negatives include foreign partner, inactive/uncertified partner, missing secret, store failure, malformed dates, unsigned legacy/unregistered code, revoked/expired link, existing-cookie replay, self-referral, cross-customer binding, unsafe destination and no economics/clinical leakage. Verify route uniqueness after relocating GET; do not register two authorities for one URL.

## Authorization and handoff boundary

**Unblocked locally:** source changes, tests, disposable-database rehearsal, candidate schema work, route composition under disabled capabilities, and exact-SHA release preparation.

**Needs current production authorization:** deploying the candidate, changing live configuration, creating/revoking actual partner links, changing real partner activation data, applying migrations, sending invitations/messages, or enabling consequential capabilities.

**Not a prerequisite for ordinary coding:** a new founder confirmation of the product direction. The founder already requested the referral experience. Only an irreducible business or production-action choice should be escalated.

This inspection did not query production schema, issue links, change flags, run product tests, send communications, or mutate any data. Referral V1 remains incomplete.
