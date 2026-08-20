# HANDOFF — ASSISTED-ORDER-CUSTOMER-FLOW (round 2, S9 QA defects) — claude-fable-s3

EXACT SHA: 0b9c24eb070045844ae52094b91430a92c298f3b
BRANCH:    fable/assisted-order-s9-defects-20260820 (pushed)
BASE:      cf649c10f8a9129b9d425430f4dcbc5f37367917 (current integration head)
WORKTREE:  C:/xenios-wt/assisted-order-flow
SCOPE:     client/src/research/assisted-order/** only
PRODUCTION MUTATION: none. No server seam, no route registration, no migration,
                     no email, no flag, no deploy.

Fast-forward relative to the integration head; my previous SHA 33af738e is
already merged at 2472158, so nothing here re-applies old work.

## What this closes

All three findings from docs/research-launch/QA-S9-CONVERSION-BLOCKERS.md that
the report assigns to claude-fable-s3. The fourth finding it assigns to me (the
P0 unsatisfiable formAcknowledgments) was already fixed at 33af738e and is live
in the integration branch; S9 measured it at base 5bb3fa9, before that merge.

### 1. (report P2, actually member-fatal) Member JWT never sent

`api.ts request()` sent `credentials: "include"` and nothing else. The
assisted-order customer resolver calls `wiring.resolveMember(req)` FIRST
(server/research/assisted-order/express.ts:79), wired to
`resolveActiveMemberSilently` (server/index.ts:445, defined :367), which
authenticates from the Authorization bearer. A signed-in member was therefore
anonymous to these routes: "This request is not authorized." at step 2 and on
the status page, with no recovery the customer could act on. EA-cookie
customers were unaffected, which is exactly why it hid.

Fix: `memberAuthHeaders()` attaches `authorization: Bearer <access_token>` when
`getSupabaseBrowser()` yields a session, using the same pattern as
client/src/research/account/api.ts. Verified NOT inert before writing it.

Deliberate properties, each covered by a test:
- cookies still ride on every call, so the EA path is untouched
- no session -> no header (not an empty/blank one)
- Supabase unconfigured (null client) or throwing -> degrades to the cookie
  path, never rejects the request
- an explicit admin token in init.headers still wins, so the five admin doors
  are byte-identical in behavior

SIDE EFFECT WORTH NAMING: only a resolved member carries `pricingViewer`, so
this also repairs member pricing. Approved member prices were rendering as
"Price on request" for signed-in members. That is the same class of defect the
c318ec90 pricing-viewer repair fixed server-side; this is the client half.

### 2. (P2) iOS Safari zoomed on every field

Controls computed to 14.4px: `font: inherit` pulled 0.9rem down from
`.xenios-order-page label`. iOS auto-zooms any focused control under 16px,
shifting the layout on every field of the order form. The control is now
pinned to `font-size: 16px`; the label keeps 0.9rem. CSS-only.

### 3. (P3) Raw family enum shown to the customer

The card header printed `clinical_formulations_503a` while the filter dropdown
showed proper labels. Both now read through `familyLabel()`, which delegates to
the canonical `MASTER_OFFERING_FAMILY_LABELS` taxonomy rather than starting a
second map (import only; shared/research/master-offerings/** is not modified
and stays available to CATALOG-ACTION-UNIFICATION). An unrecognized slug is
humanized rather than printed raw, so a newly added family degrades to readable
text instead of leaking an enum key.

## Tests

npx vitest run client/src/research/assisted-order shared/research/assisted-order --pool=threads
Result at this SHA: 6 files, 45 tests, all passing (was 5 files / 37).

New: client/src/research/assisted-order/api.test.ts (5 tests) covering the
authorization matrix above. Extended: wizard-state.test.ts with familyLabel
cases including the unknown-slug and empty-string paths.

NOTE ON A FLAKE, NOT A FAILURE: with the default forks pool under heavy
machine load (several fleet sessions building at once) the AssistedOrderPage
worker can time out during startup — "Failed to start forks worker",
transform 57s. It is a pool startup timeout, not a test failure; the same file
passes 6/6 alone and 45/45 with --pool=threads. Recommend --pool=threads for
this suite on a loaded machine.

## Wiring instructions for the lead

Nothing to mount. Merge the branch; the three routes and the CTA are unchanged.

## Still open, still NOT taken (unchanged from my first handoff)

`clearAssistedOrderStorage` (client/src/research/assisted-order/storage.ts) is
still dead code with zero call sites. `EarlyAccessRoute.tsx` signOut already
calls clearBrowserCart / clearCartRecovery / clearPendingAttempt and should
call this too, or a shared machine leaves the previous customer's status token
and draft for whoever unlocks next. That file is a lead-owned seam; one import
plus one call.

## Findings in the S9 report that are NOT mine and remain open for the lead

- P0 `/api/research/early-access/unlock` never wires `deps.ownerId` from env
- P0 `/r/:code` affiliate short link is not mounted; SPA catch-all 404s it, so
  every order carried affiliate_attribution_ref = null
- P1 `register.ts` mounts 35 handlers as `void handler(req,res)` with no
  `.catch`, so a rejected persistence call exits the Node process — a database
  blip mid-order is a total outage, not a failed request
- P3 EA owner id shape check accepts a non-RFC-4122 UUID at startup and then
  denies every unlock at runtime
