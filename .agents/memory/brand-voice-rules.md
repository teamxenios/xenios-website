---
name: xenios brand voice & spelling rules
description: Non-obvious brand/copy constraints for the xenios site that override the stale replit.md
---

# xenios brand voice & spelling rules

These rules come from the homepage-rebuild brief and OVERRIDE earlier site copy and `replit.md`.

- Brand name is always lowercase: `xenios`. Never capitalize, even sentence-start.
- NEVER place a period directly after the brand name. Rewrite sentences that would end on "xenios".
- NO em dashes anywhere in rendered copy. Use commas, periods, colons, or parentheses.
- Voice: plain, direct, calm, premium. No hype.
- Above the fold: no jargon ("agentic", "data plane", "substrate", "AI-native"), and NOT "operating system". The phrase "operating system" may appear lower on the page only.
- Recurring motif (v3 locked): "The AI drafts. The coach decides." Never imply AI replaces the coach.
- Preferred one-line descriptor: "An AI workspace for health and performance professionals." (umbrella/footer line; replaces old "AI-adjunct operations system" / "pocket coach").
- Customer term is "client" everywhere. Do NOT use "athlete" or "patient" in body copy (v3 locked).
- The two agents have names: "Xen" (the coach/professional agent) and "Athena" (the client agent). Use these, not generic "professional agent / client agent".
- Locked hero: lead-in "The AI drafts. The coach decides." + headline "Two AI agents for every coach." + trust line "Built for coaches. Not to replace them."
- Page titles: the brief suggests em-dash titles, but the no-em-dash rule wins. Use a colon instead, e.g. "xenios: two AI agents for every coach".
- Waitlist count is driven from the database (one number sitewide), locked at 556 for now (use real DB count if higher). Never hardcode a different number on individual pages.
- Public site is coach-only and stealth: never mention peptides, GLP-1s, clinical prescribing, medical practice operations, or regulated care flows.

**Why:** `replit.md` still describes a v3 brand with an orange period after the wordmark and uses "AI-adjunct operations system" / "pocket coach". The current direction explicitly reverses these. Trust this file over replit.md for copy decisions.

**How to apply:** When writing or editing any user-facing copy, meta tags, or JSON-LD on this site, enforce these. The `Wordmark` component already renders "xenios" with no period; keep it that way.
