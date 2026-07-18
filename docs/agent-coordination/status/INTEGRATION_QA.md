# INTEGRATION_QA Status

**Updated:** 2026-07-18T16:43:59-05:00
**Owner:** INTEGRATION_QA
**Codex task:** Xenios integration and QA
**Role:** explicit third participant alongside CLAUDE_PRIMARY and CODEX_UI
**State:** active review and routing lane

## Scope

INTEGRATION_QA owns cross-PR review, production verification, shared-contract and merge-risk detection, test-evidence review, and routing findings to the correct implementation owner.

It does not own:

- Claude backend, authentication, admin, payments, Supabase, or other server implementation.
- CODEX_UI presentation implementation.
- Merging a PR on behalf of either implementation lane.

## Required coordination loop

- CLAUDE_PRIMARY and CODEX_UI must read this status and the latest versioned INTEGRATION_QA handoff before merging or starting an overlapping lane.
- Findings are advisory while they exist only in a hidden task or transient message.
- Once a finding is versioned in the repository, it is part of the coordination record.
- A versioned P1 finding blocks merge until the owning lane addresses it and INTEGRATION_QA re-reviews the revised commit.
- Implementation owners must route final commit IDs and test evidence back through their status and handoff files.

## Current review register

| PR | Reviewed head/state | Integration disposition |
|---|---|---|
| #11 | 9cf711ee718e5f0719419cf9b2ba3a060cc110b9 | P1/P2 blockers versioned in the latest to-Claude handoff; do not merge until addressed and re-reviewed. |
| #12 | 3adfadea78531c2cc606e54282ed308840407bd9 | P1 reward, identity, feature, and program-window blockers versioned; do not merge until addressed and re-reviewed. |
| #13 | final correction head edc7d7a349e279d11d7f4e68c225ce83542da9f8 re-reviewed | Cleared by INTEGRATION_QA at this exact head; may proceed through normal draft review and merge approval. |
| #14 | 718f005b293a8e1030f26f53fafee4076676f4d0 | Environment-diagnostic lane reviewed in the production-gate context. It does not prove the live gate is fixed. |
| #15 | 0d0814c | P1/P2 token, account-creation, expiry, authorization, and referral-identity blockers versioned; do not merge until addressed and re-reviewed. |

## Production verification

At 2026-07-18 15:42 CDT, https://xeniostechnology.com/research returned HTTP 503 with body "The research section is not configured." The live gate remains unresolved. No participant should claim production Research is fixed until a new deployment and independent verification demonstrate it.

## Latest routed handoffs

- Backend/admin/auth findings: docs/agent-coordination/handoffs/to-claude/20260718-1555--pr11-pr12-integration-blockers--from-INTEGRATION_QA.md
- PR #13 correction evidence: docs/agent-coordination/handoffs/to-claude/20260718-1623--pr13-referral-contract-corrections--from-CODEX_UI.md
- PR #13 review disposition: docs/agent-coordination/handoffs/to-codex/20260718-1636--pr13-correction-review--from-INTEGRATION_QA.md
- PR #13 final clearance: docs/agent-coordination/handoffs/to-codex/20260718-1644--pr13-final-clearance--from-INTEGRATION_QA.md
