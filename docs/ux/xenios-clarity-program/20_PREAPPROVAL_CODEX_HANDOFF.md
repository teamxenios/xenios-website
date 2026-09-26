# 20 — Pre-approval Codex handoff (SUPERSEDED)

> Superseded on 2026-09-26 by `20_CODEX_READY_HANDOFF.md` after Samuel's recorded approval (`19_FINAL_OWNER_APPROVAL_RECORD.md`). Kept for history.

**Codex must not start implementation from this file.** It exists so Codex can prepare while approval is pending: read, plan, check leases. The start signal is the CLAUDE_06 output (`19_FINAL_OWNER_APPROVAL_RECORD.md` + `20_CODEX_READY_HANDOFF.md`), created only after Samuel states "APPROVE THE REVIEWED XENIOS CLARITY DECISION SET". Naming note: when CLAUDE_06 runs, it writes `19_FINAL_OWNER_APPROVAL_RECORD.md` and `20_CODEX_READY_HANDOFF.md` alongside these pre-approval files; it does not overwrite them.

## Identities

| Item | Value |
| --- | --- |
| Implementation base | `3298f279ad760a861e26e3e08514bb49694fae38`, tree `ac69ecf87e3c622738908bb4fa7a1779aad493fb` (confirmed by disposition addendum @ `0b351a1`) |
| Current production | `79414143d4355d5d3d14cd5fe6e5a536dc68d99d`; the bounded release `3298f279` may be deployed separately via CODEX_05 |
| Strategy branch | `claude/xenios-clarity-spec-20260926` |
| Pre-approval strategy SHA | recorded in the CLAUDE_05 handoff (`.xenios/handoffs/`) |
| Final strategy SHA | produced by CLAUDE_06 after approval; **this is the SHA Codex implements** |

## What Codex may do now (no runtime edits)

1. Read `16`, `17`, `18`, `19` and every artifact they reference.
2. Run `node scripts/agentic/xenios-os.mjs stale` and prepare the lease resolutions in `18` §5. Record the takeover or release only when implementation actually starts.
3. Prepare the protected-change review plan for full mode: the file list in `18` §4, and the hard-locked seams noted in `18` §2.
4. Confirm the `loi_submissions` store supports the fields in `18` §6 **without edits to protected files**. If it does not, prepare the migration request; do not write it.

## What Codex implements after approval (full mode, if B-1 is approved as recommended)

Follow `18_CODEX_IMPLEMENTATION_BRIEF.md` steps 1–12. With the reviewed recommendations:

- **Brand:** Xenios everywhere public; "Xenios Technologies, Inc." legal; zero Eon or Infinity strings in public copy or code-visible UI.
- **Hero:** "Care and research products, clearly separated." and the sub-line from `17` B-2. No clinician statements beyond those already live (copy deck clinician-statement rule).
- **Products:** tiles only; no cards, counts or prices.
- **Claims:** remove every DO NOT PUBLISH and unverified item (72 hours, one business day, state-licensed pharmacy, $30 plan, third-party testing, "Research Rep").
- **Practices:** pages per the copy deck §8. No ordering for clients; E-2 visibility wording; F-1 wording; G-1 wording (as approved); H-1 line.
- **Careers:** confirmed roles plus general interest (or general interest only).
- **Durable inquiries:** existing store, no migration; STOP if owner or due-date columns are needed.
- **No deployment.**

## If Samuel approves with revisions or declines B-1

- **Revisions:** CLAUDE_06 applies them to `17` and the affected artifacts before the ready handoff.
- **B-1 declined:** fallback mode (`04` §Fallback; `07` `fallback_if_B1_declined`).

## Return format

Use `CODEX_06_IMPLEMENT_OWNER_APPROVED_CLARITY.md`, then Claude's independent review (`CLAUDE_04`).
