# S9 handoff — mobile + end-to-end conversion QA

Session: `claude-fable-s9-conversion-qa`
Branch: `lane/e2e-conversion-qa-20260819`
Exact SHA: `c83679ddda91f798fc8c97c9e621971188b2c7f9`
Base: `5bb3fa9d364f0d6497cebcb1766417a9bbd0ccf8`
Worktree: `C:\xenios-wt\s9-conversion-qa`

Payment authority untouched. No production mutation. Production was read only
through read-only schema introspection to reconstruct a local stack.

Typecheck: `npx tsc --noEmit` exits 0 on this SHA.

## What this SHA contains

1. `server/index.ts` — the one fix this lane owns end to end.
2. `docs/research-launch/QA-S9-CONVERSION-BLOCKERS.md` — the full blocker table.

### The fix

`bindingFor` looked bindings up by offering variant id against an index keyed
`offeringId|offeringVariantId`, so **0 of 417** lookups resolved. Consequence
chain, all customer-visible:

- every assisted-order catalog line projected as `unbound:mo_…` / `unbound:mov_…`
- approved prices suppressed to "Price pending"
- the truthful action degraded from `direct_order_request` to `request_pricing`
- `POST /api/research/early-access/assisted-orders` failed **HTTP 500** at
  `resolveLine` — "Catalog item is unavailable or not authorized"

A variant-keyed forward map is now built beside the existing reverse map, in the
same loop. Offering variant ids are globally unique across the artifact (417 of
417 distinct), so the map is total and no ambiguity is possible.

Proven after the fix on a production-shaped local stack: real Product Control
UUIDs on each line, `$33.50` resolved on the seeded BPC-157 5 mg variant, action
reads `direct_order_request`, submit returns **201** with `XRR-20260820-C14F18CCF5`.

## Blockers this lane does NOT own — please route

**P0 — the wizard cannot satisfy its own submit contract.**
`client/src/research/assisted-order/**` (owner: `claude-fable-s3`).
The server publishes 4 `formAcknowledgments` (accuracy, contact_consent,
request_notice always; research_use_only conditional) and enforces all of them
in `AssistedOrderService.requireAgreements`. `parseAgreementRequirements`
(`wizard-state.ts:140`) reads only `requiredAgreements` / `agreements` and drops
`formAcknowledgments` entirely, so the checkboxes are never rendered, never
collected, never submitted. Every submission is refused with "The accuracy
acknowledgment must be confirmed on the current form". No user action can
satisfy it. This blocks Release A on its own, independently of the fix above.

**P0 — Early Access unlock rejects the correct password.**
`server/research/early-access/register.ts` never wires `deps.ownerId` from the
environment. The durable repository issues nonces under
`RESEARCH_EARLY_ACCESS_OWNER_ID`; the route exchanges them under
`PRIVATE_ACCESS_DEFAULT_OWNER_ID` (`00000000-0000-4000-8000-000000000001`). The
exchange RPC rejects the owner mismatch and the route maps that to the same
generic denial as a wrong password — no log, by design. Proven both ways: a
non-default canonical owner id gives 401 on the correct password; setting the
env to exactly the default gives 200. Note the trap: leaving the var unset makes
the persistence decision refuse and forces the gate closed, so the only working
value today is the hardcoded default.

**P0 — affiliate short links are dead and attribute nothing.**
`server/research/partners/referral-capture-routes.ts` exists (`/r/:code`,
`/api/research/referral/capture`) but is not mounted in the composition root.
`/r/ANYCODE` falls through to the SPA catch-all and renders the public
**404 "That page is not here"**, sets no cookie, and records no touch. `?ref=`
sets nothing either. Every order submitted during this session carried
`affiliate_attribution_ref = null`. LAUNCH_SCOPE lists this as P0 Release A.

**P1 — one rejected persistence call exits the server process.**
`register.ts` mounts 35 Early Access routes as `void handler(req, res)` with no
`.catch`; exactly one of the 35 is guarded. An unhandled rejection terminates
Node. Observed directly: a failing persistence call inside the agreements route
killed the process (`[exited with code 1]`). `POST .../orders` (placeOrder) and
`GET .../orders/:orderNumber` are registered the same way, so a database blip
while a customer places an order is a **site-wide outage**, not a failed request.
The assisted-order adapter already shows the correct shape
(`assisted-order/express.ts` `.catch`), so this is a mechanical fix.

**P2 — iOS auto-zoom on every order field.** All inputs compute to 14.4px;
below the 16px threshold Safari zooms on focus and shifts the layout on every
field of the order form.

**P2 — assisted-order client never sends the member JWT.** `api.ts` `request()`
sends cookies only, so a signed-in member sees "This request is not authorized."
at step 2 and on the status page, with no re-auth affordance. The EA-session
(cookie) customer is unaffected, which is why this hides in casual testing.

**P3 — owner-id validation is inconsistent.** The persistence shape check
accepts any `[0-9a-f]{4}` groups; the session repository enforces canonical
RFC-4122. An operator can configure a value that passes startup and silently
denies every unlock.

**P3 — raw enum group headers** (`CLINICAL_FORMULATIONS_503A`) in the picker.

## What passed

Idempotency (concurrent double submit collapses to one order, verified in the
database), no horizontal overflow at 320/360/375/390/430/1366/1440 on every
reachable conversion surface, no off-screen CTA on the wizard at any width,
genuine `disabled` fail-closed on Submit, back-navigation preserves step 1, and
no dead internal links other than `/r/:code`.

## Reproducing the local stack

Schema, RPCs and a catalog slice were reconstructed by read-only introspection;
the scripts are in this session's scratchpad. Prices need `approved_by` stamped
or the authoritative resolver correctly refuses them. The EA commerce
persistence layer needs many further RPCs that were not ported — the member
path was used for end-to-end proof instead.
