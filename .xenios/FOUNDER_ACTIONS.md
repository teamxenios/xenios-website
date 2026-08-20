# Founder actions

Use this file only for irreducible founder decisions or actions. Engineering should continue around each item.

## Open

- **DIRECTIVE CONFLICT, decide before the public storefront ships.** The
  2026-08-19 launch directive says "MAKE THE LANDING PAGE COMMERCIAL. Primary
  CTA: Browse Research Catalog." The standing policy in
  `docs/research/RESEARCH_HOME_CATALOG_POLICY.md` said the exact opposite, and
  recorded it as a *repeated nonnegotiable*: no catalog button, tile, or CTA
  of any kind on `/research`, with no way to see catalog contents or pricing
  without applying or signing in. Both claim founder authority; the newer one
  wins on date alone, which is not good enough for a nonnegotiable, so it is
  flagged here rather than assumed.
  - Implemented on `lane/launch-public-storefront` as ONE isolated commit
    (Gateway CTA + policy rewrite + guard rescope) so it can be reverted whole
    without losing the storefront itself, which is a separate commit.
  - What the reversal grants: a signed-out visitor can browse a fail-closed
    public projection (no SKUs, no member pricing, no cart, no checkout,
    noindex, off unless `RESEARCH_PUBLIC_STOREFRONT_ENABLED` is exactly
    "true"). Member, partner, supplier, and admin catalogs stay forbidden on
    the Gateway and the guard still enforces that.
  - What it costs: the guard's phrase denylist is retired, because the
    directed CTA text ("Browse Research Catalog") is itself a denylisted
    phrase and the old policy forbade renaming around it. Href and allowlist
    layers are unchanged and still catch a disguised member-catalog link.
  - **Confirm or revert.** If the nonnegotiable still stands, revert that one
    commit; the storefront then remains reachable only by direct link and the
    Gateway is untouched.
- After Phase Zero completes and the seat is released, and BEFORE launching the cashflow/demo lane sessions: delete `SUPABASE_ACCESS_TOKEN` from the Claude Desktop Local environment, REVOKE the temporary PAT in the Supabase dashboard, remove or disable the local `.mcp.json` production connection, and fully restart Claude Desktop. Lane sessions must never inherit a production database credential (see SESSION_LAUNCH_RUNBOOK_2026-08-17.md).
- Unblock the Phase Zero DB preflight: add `SUPABASE_ACCESS_TOKEN` to the Claude Desktop Local environment (environment selector → Local → gear), fully quit and reopen Claude Desktop, then launch the successor Local Code session at the worktree with the recovery prompt. The scoped `supabase-xenios-prod` MCP cannot authenticate in any session started without that variable; every other Phase Zero preflight item is already green (see PHASE_ZERO_PRODUCTION_PACKET.md, baseline reconciled 2026-08-17). Identify or confirm the actor of manual Render deploy dep-da1lmgu417fc73elr8f0 while doing so.
- Approve the exact legal versions required for the public membership application once counsel/version authority is ready.
- Approve production application of the renamed and certified Pack 02 account schema.
- Supply base prices for BAM15 500 mcg and Syringes and Alcohol Swabs when available.
- Approve external supplier onboarding, Care/provider relationships, payment credentials, and Google Workspace scopes as they become ready.

## Never store here

Passwords, tokens, API keys, payment credentials, service-role keys, patient data, or recovery links.
