# Phase Zero production execution packet (founder-approved 2026-08-16)

Samuel approved production steps 1 to 4 for the EXACT frozen candidate below.
The approval is narrow: it authorizes ONLY M71, the admin notification email,
the frozen release SHA, and the survey feature flag. It does NOT authorize
M69, M70, any other migration, any other release SHA, any unrelated Render
change, account-claim email activation, commerce, payments, or supplier
automation. If the exact target changes, return to Samuel for approval.

## Approved targets

- RELEASE SHA: 32bbd7998e806d881590c9e9a32123c2b8ba8168
  (tag RESEARCH_PLATFORM_0_5_ASSISTED_ORDER_RC)
- M71: supabase/migrations/20260815150000_research_assisted_order_bridge.sql
- M71 SHA256: da60e8b0f0d66625ff72f687f3386c45edaf27f5fc5f020e9137f7e6d486091a
- ADMIN EMAIL: RESEARCH_ASSISTED_ORDER_ADMIN_EMAIL=research@xeniostechnology.com
- FLAG: RESEARCH_ASSISTED_ORDER_BRIDGE_ENABLED=true
- Supabase project: yvzeduaxbwgcwllhywff
- Render service: srv-d8s9vej7uimc7384dfcg (workspace tea-d8nhh6a8qa3s73f4ocj0)

## Pre-flight, VERIFIED 2026-08-16 by claude-fable-main (re-verify before each mutation)

1. Production currently runs b0fe396 (deploy dep-da07gcdbedkc73a3mka0, live
   2026-08-15T14:32:06Z). Service updatedAt unchanged since.
2. Release SHA resolves and equals the approved SHA.
3. M71 bytes AT the approved release SHA hash to exactly the approved SHA256.
4. Production database has ZERO research_assisted_order tables and ZERO
   research_assisted_order routines, so M71 is a clean first apply.
5. Render autoDeploy is "no" and autoDeployTrigger is "off": an env write does
   NOT auto-deploy this service.
6. No other production writer. The only active lease is claude-opus5-main on
   F7-PACK02-RENAME, which touches Pack 02 files, not production.

## Why this packet exists

The executing session must emit the 47,876-byte migration as a tool parameter.
The session that prepared this packet reached its context limit and refused to
risk sending a TRUNCATED migration to a production database. That is the only
reason execution is deferred. Nothing about the candidate is unresolved.

## Execution order (fail-safe: no intermediate step shows a working-but-broken form)

1. Apply M71 via the repository's approved process (Supabase MCP
   apply_migration), capturing the real result. Then run the M71 production
   postcheck (supabase/verification/, see the DAG entry's evidence field).
   Verify: five tables exist, RLS enabled AND forced, zero direct table grants
   to public/anon/authenticated/service_role, RPC-only boundary intact,
   routines present, no unrelated object changed, no business row written.
   If apply or postcheck fails: STOP, contain per
   supabase/production/research-assisted-order-bridge-rollback-notes.md.
2. Set RESEARCH_ASSISTED_ORDER_ADMIN_EMAIL=research@xeniostechnology.com.
   Leave the bridge flag unset. Confirm the running release is unchanged.
3. Deploy EXACTLY 32bbd799... (not branch HEAD unless proven identical).
   Verify the deploy object's commit, health, core site, Early Access, and
   that assisted-order doors REFUSE because the flag is unset, and the CTA
   advertises nothing.
4. Set RESEARCH_ASSISTED_ORDER_BRIDGE_ENABLED=true and redeploy the SAME SHA
   so production reads it. No code change during enablement.
5. Run the founder's 27-point live smoke with a controlled test request.

## Test-order rule

Do not create fake commercial facts. The test request may stay marked as a
test. Never mark it paid, supplier assigned, shipped, delivered, agreements
complete, or identity verified unless that actually happened. Close it through
the truthful supported path afterwards.

## Fail-safe

First containment on any release-blocking issue:
RESEARCH_ASSISTED_ORDER_BRIDGE_ENABLED=false, verify the doors refuse again,
and only then debug. Preserve every committed request row. If needed, redeploy
b0fe3963722665dcd7e8853f05f637bc09960a56.
