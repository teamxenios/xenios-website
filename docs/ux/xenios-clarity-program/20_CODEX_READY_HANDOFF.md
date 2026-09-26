# 20 — Codex-ready handoff (owner-approved)

**Codex may now start `CODEX_06_IMPLEMENT_OWNER_APPROVED_CLARITY.md`** under the conditions below. This file supersedes `20_PREAPPROVAL_CODEX_HANDOFF.md`, which is kept for history.

## Identities

| Item | Value |
| --- | --- |
| Owner approval | `19_FINAL_OWNER_APPROVAL_RECORD.md`: Samuel Boadu (SB), September 26, 2026, "APPROVE THE REVIEWED XENIOS CLARITY DECISION SET"; 13/13 approved |
| **Final strategy content SHA** | `{{FINAL_CONTENT_SHA}}` (tree `{{FINAL_CONTENT_TREE}}`). Codex records this as STRATEGY SHA/TREE. Later commits on the strategy branch change only identity or handoff records. |
| Strategy branch | `claude/xenios-clarity-spec-20260926` |
| **Implementation base** | `3298f279ad760a861e26e3e08514bb49694fae38`, tree `ac69ecf87e3c622738908bb4fa7a1779aad493fb` (confirmed by disposition addendum @ `0b351a1`). If the bounded release is deployed first, the Git base stays `3298f279` unless source diverges. |
| Implementation branch | `codex/xenios-clarity-implementation-20260926`, in a new isolated worktree. Never the audit, strategy, checkout or any production-triggering branch. |
| Production | `79414143…` unless CODEX_05 has deployed `3298f279`. Either way the redesign is **not** deployed by CODEX_06. |

## Mode: FULL MODE (B-1 approved)

Samuel amended the 2026-07-29 core-site directive **solely for the clarity program**.

- Codex may modify the protected root homepage, shared header and footer, global navigation, App routing and related protected files, **only** to implement the approved IA and copy.
- Every protected-file change must pass the canonical protected-change review **and independent review** (CLAUDE_04).
- Re-baseline the protection manifest only through that review. Never hand-edit hashes.
- `Admin.tsx` and the six contact seams are not expected to change; the new inquiry endpoint lives under `server/research/`.

## Approved content Codex implements (sources of truth)

| Area | Implement exactly | Source |
| --- | --- | --- |
| Brand | Public "Xenios"; legal/contracting/policy/footer/receipt/sender "Xenios Technologies, Inc."; one centralized brand config; zero "Eon", "Eon Health", "Infinity", "Infinity Health" in public UI (U-115) | `17` A-1 |
| Root/chrome | Health front door at `/`; coach workspace to `/workspace` (old coach URLs keep working); one shared header/footer; redirects per IA | `04`, `SITEMAP`, `17` B-1 |
| Hero | H1 "Care and research products, clearly separated." / sub "Start a Care request, or explore products for research use. Two different paths, with clear next steps." | `17` B-2, `05` §3 |
| Products | Pathway tiles only: Start Care · Explore Research Products · For Practices. No product cards, counts, prices, Care products, unavailable products or direct-buy (U-025) | `17` C-1/C-2 |
| Care copy | "Care availability depends on your state. We confirm it after your request." · "Submitting a Care request is free." Remove every timing, consult-price, $30-plan and state-coverage claim | `17` D-1 |
| Claims | Remove clinician, pharmacy, testing, COA and shipping-time claims (72 hours ×22, one business day ×8, state-licensed ×6, $30/month ×3, third-party testing ×1). Remove "Research Rep" (×15). Keep existing live clinician wording on Care pages only per the copy-deck clinician-statement rule; add no new clinician statements | `17` D-2, `CLAIM_LEDGER` |
| Practices | No ordering for clients; E-2 visibility text; F-1 public commission text (no numbers); **G-1 conservative text** (C-048); H-1 inventory line | `17` E-1/E-2/F-1/G-1/H-1, `05` §8 |
| Careers | General-interest application only; remove the three hard-coded roles from public display; truthful email vs record labelling | `17` I-1, `05` §11 |
| Durable inquiries | `server/research/` endpoint over the existing `loi_submissions` store (no migration); founder owner in the command-center layer; **STOP** if owner or due-date columns are required | `18` §6, `10` N-09 |
| Everything else | IA, CTA vocabulary, states, statuses, responsive/zoom, accessibility | `04`, `05`, `07`, `PAGE_SPECIFICATIONS`, `11` |

Claim-dependent brackets still in the copy deck (⟦C-004⟧, ⟦C-009⟧, ⟦C-018⟧, ⟦C-021⟧, ⟦C-042⟧, ⟦Q-04⟧, ⟦Q-13⟧, ⟦ops⟧) are **not** owner decisions. **Omit the bracketed sentence** unless the claim ledger shows VERIFIED FOR PUBLIC USE. The one exception is C-018, the research-use note: use the existing approved Research Use Policy wording already served by the site.

## Before the first runtime edit

1. Register and claim through `node scripts/agentic/xenios-os.mjs`.
2. Resolve the four stale leases (`18` §5) with recorded takeovers or releases.
3. Read `16`, `17`, `18`, `19_FINAL_OWNER_APPROVAL_RECORD.md` and this file.

## Must not

- Deploy.
- Change flags, credentials, the database, commerce, payments or clinical authority.
- Publish any unverified claim or any Eon/Infinity public string.
- List products, prices or named roles.
- Build ordering for clients or commission on Care.
- Merge into the audit branch.
- Implement from any strategy SHA other than the final content SHA above.

## Return

The `CODEX_06` report format, including STRATEGY SHA/TREE equal to the values above. Then `CLAUDE_04` independent review of the exact runtime candidate.
