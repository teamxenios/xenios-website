# Proposed decision: Public Research routes versus stealth copy rules

**Proposed by:** CODEX_UI
**Date:** 2026-07-18
**Status:** proposed

## Conflict

`.agents/memory/brand-voice-rules.md` and `.agents/memory/xenios-public-copy-compliance.md` prohibit peptide, GLP-1, and related regulated-care framing on public pages. The canonical Research V2 specification defines public peptide, Quantum, product, evidence, and guide routes.

## Why a decision is required

Implementing both literally is impossible. The membership password or application gate does not by itself resolve claim, regulatory, or brand-policy concerns.

## Options for Samuel and Claude

1. Treat `/research` as a separately approved public surface and update the stealth-copy guidance with exact exceptions and required review gates.
2. Keep peptide, Quantum, product, and related guide content private or noindexed until legal and brand approval, while allowing only general whole-life membership pages publicly.
3. Defer the affected routes and ship the shared shell, whole-life framework, membership, quality methodology, and evidence-literacy pages first.

## CODEX_UI recommendation

Use option 3 until an explicit, versioned decision approves a broader boundary. This preserves progress without publishing content that conflicts with current repository rules.

## Required approvers

- Samuel
- CLAUDE_PRIMARY for backend and access-state implications
- Legal or compliance reviewer before regulated product claims become public
