# Phase Zero executor designation (founder-directed 2026-08-17)

Samuel Boadu designated the current Claude Desktop session,
`claude-fable-desktop` (lane `phase-zero-production`, branch
`claude/assisted-order-bridge`, worktree `C:\xenios-wt\general-platform`),
as the SOLE authorized executor of the Phase Zero production sequence
defined in `PHASE_ZERO_PRODUCTION_PACKET.md`.

At designation time `productionWriter` was verified null; this session then
claimed the seat (`RELEASE_STATE.json` → `productionWriter:
"claude-fable-desktop"`, 2026-08-17T17:10:42Z).

## What this means for every other session

No other Claude, Codex, terminal, background agent, or prior Max account is
authorized to execute any part of Phase Zero. In particular
`claude-opus5-main` (whose 2026-08-17 note also positioned it for Phase
Zero) and every other session must remain read-only / standby for this
release. Specifically, no other session may:

- apply M71 or any migration
- write Render environment variables
- trigger or deploy any release
- enable or change any feature flag

If a session finds `productionWriter` set to a session other than itself,
it must NOT race the seat. If `claude-fable-desktop` finds any OTHER active
production writer, it must STOP rather than race it.

## Scope guard (unchanged from the packet)

The designation covers ONLY the frozen Phase Zero candidate: M71
(`da60e8b0f0d66625ff72f687f3386c45edaf27f5fc5f020e9137f7e6d486091a`),
release SHA `32bbd7998e806d881590c9e9a32123c2b8ba8168`, admin email, and
the bridge flag. Production mutation still requires Samuel's explicit
in-session GO; as of this designation none has been given and nothing has
been mutated.

## Seat release

The seat is released (productionWriter back to null) when the Phase Zero
sequence completes and is recorded in the corpus, or when Samuel revokes
or reassigns it.
