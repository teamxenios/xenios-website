# Integration ownership review

Reviewer: codex-adversarial-audit-20260924, explicitly assigned implementation and release-control lead by the user's pasted continuation request. This is a lead review, not independent second-agent approval and not deployment authority.

The trusted policy is read from live production commit 79414143d4355d5d3d14cd5fe6e5a536dc68d99d. Candidate policy rules were not rewritten. The schema-v2 workflow must bind the complete exact Git diff, trusted policy digest, all findings and review artifact bytes. The inventory helper only reports facts; it cannot grant acceptance.

Inventory at c40003d95d73655f23bf57efeed6f60c5b24af9a: 621 paths, 603 unowned under the older policy, 18 with older lane ownership, zero conflicting owners. These counts are historical to that SHA and must be regenerated for any newer candidate.

Reviewed groups: 64 application/test paths implement the inherited account chooser, canonical server-confirmed admin routing, truthful closed application/CTA states, partner status/outbox wiring, and bounded contact receipt repair. No migration, shared authority schema, build configuration or dependency change exists in this production-to-candidate diff. Existing auth/admin/commerce authority remains in the original guards and SQL. Protected paths are separately accepted and hash-locked in PROTECTED_CHANGE_REVIEW.md. Notification source/capture evidence establishes intent and acceptance only, never actual delivery.

The 18 older-lane paths comprise five continuity records, Apply/ApplyStatus/Gateway and their tests, the admin shell, five release controls, the commerce partner enqueue wiring and canonical outbox dispatch. Their intended changes were reviewed against production and existing implementation evidence. Historical leases are retained. This lead's active lease authorizes central controls; inherited runtime is preserved, not silently reauthored.

The remaining inventory comprises bounded UX/runtime tests, audit fixtures and captured evidence, generated records, and session/handoff records. Large audit artifacts are evidence, not additional executed controls. Claude's active clarity-spec worktree owns docs/ux/xenios-clarity-program/** and none of that path is in this candidate diff. Older dirty worktrees remain untouched.

Acceptance prerequisite still pending here: final full-suite result and exact candidate attestation. A passing manifest must not erase unverified managed Auth/Storage parity, desktop zoom, or external delivery.
