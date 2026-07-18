# Xenios Research Project State

**Updated:** 2026-07-18T14:53:00-05:00
**Repository:** `teamxenios/xenios-website`
**Primary deployment:** existing Xenios website and Render service
**Research route family:** `/research`

## Git state

- PR #8 is merged into `origin/main` at `138e3238f0cda784a76b0b29f8082ffe87a3f813`.
- PR #9 is open and mergeable. Its head is `feat/research-membership-premium-rebuild` at `f9c44807fa3aa70021f27654a31c8dd8aa32a725`.
- Claude's local checkout is `C:\Users\sboad\Downloads\xenios-website` and was clean when Codex verified it.
- Codex works in `C:\Users\sboad\Downloads\xenios-website-codex-ui` on `codex/research-ui-content`.
- The Codex worktree was created from PR #9's exact head SHA.
- PR #10 is an open draft from `codex/research-ui-content` into `feat/research-membership-premium-rebuild`.
- The Stage 1 audit is published at commit `e2d493a`.

## Current milestone

Stage 1 audit complete and ready for review. No public route or shared component implementation has started.

## Sources reviewed

- `XENIOS_CODEX_LOCAL_GITHUB_UI_CONTENT_COLLAB_PROMPT.md`
- `XENIOS_RESEARCH_MEMBERSHIP_MEGA_BUILD_PROMPT_V2.md`, currently located outside the repository in Downloads
- PR #9 metadata and complete changed-file patch
- Repository guidance in `.agents/memory/`

## Known constraints

- The main Xenios site is the design-system source of truth.
- The existing public-copy guidance forbids peptide and GLP-1 language on public pages, while the canonical Research specification defines public peptide routes. This conflict is recorded as a proposed decision and must not be resolved implicitly.
- The canonical V2 specification is not yet versioned in the repository, so Claude and Codex cannot rely on GitHub alone to read it.
- No production asset is approved until ownership, license, allowed use, and alt text are recorded.
- Research membership backend, authentication, payments, onboarding, private member data, and the Whole-Life Blueprint remain Claude-owned by default.
- Responsive Tailwind variants do not apply in the browser, so the intended desktop navigation and multi-column layouts do not render.
- `.rule-all` and `.btn-ghost-on-dark` are undefined despite being used on public pages.
- The main header overflows at 320 px, and the current Research shell overflows at 390 px.

## Next major cycle gate

1. Claude reviews the audit and updates `CLAUDE_PRIMARY.md`.
2. Samuel and Claude decide the public Research stealth-copy boundary.
3. The team assigns ownership for the shared responsive-CSS repair and shell strategy.
4. Codex fetches both branches, reads new status and handoffs, then opens a new explicit implementation claim.
5. Only then may Research redesign begin.
