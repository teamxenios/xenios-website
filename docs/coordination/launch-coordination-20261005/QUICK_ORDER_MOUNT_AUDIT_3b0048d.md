# Quick Order mount proposal verification — source 3b0048d

Coordinator subagent /root/f1_audit performed read-only immutable Git-object checks. No files, tests, database or running processes changed.

Source3b0048de641415523caa44f91cb06002465e1773/tree8a080557f2cf7155ca83f17c30eeae767c9d86c1 and LF patch SHA2566481c2ad2d4d2828e789cb2f2e24964705562cb782d70728b4152d78dc40a672 verified. All six before/after hashes match in-memory reconstruction. Actual targets remain identical to accepted756a906, applied:false:
client/src/App.tsx; shared/care/paths.ts; client/src/lib/tracking.ts; client/src/lib/attribution.ts; server/research/seo/raw-http-document-policy.ts; server/index.ts.

The proposed mount preserves /health and GATE01, supplies sessionKey:null, and mounts no enabled production adapter. This is a disabled source proposal, not an intake or deploy permission.

Concrete finding QO-C1 — OPEN at this source:
server/health/quick-order/containment.ts prefers originalUrl. Existing server/index.ts collapses duplicate leading slashes in req.url before guards, while Express preserves originalUrl. POST //api/health/quick-order/requests becomes canonical req.url but bypasses this containment and reaches the global JSON parser, whose verifier sets req.rawBody. No capability activation follows, but the promised pre-parser/no-retention boundary is violated.

Correction was routed to the sole existing builder before any approval question. Use the established normalized effective path and qualify the composed alias case before parser/raw-body retention, preserving normal exact-route refusal and unrelated pass-through. This requires only already leased new modules/tests, not protected target changes.

Original evidence03a104497004f950bc68e040667350f0e5f75c8f records184focusedpasses but does not close this later-discovered finding. Preserve those original receipts. A successor source/test/evidence/handoff must identify the correction before mount source permission is requested.

## Successor closure

Source4abd2c5cd4bd039309b32b97b117a67fc6a4d292/tree3fb70d98dc354e6a6049744b5bb15b741d5ba50b replaces originalUrl parsing with Express req.path after the existing normalizer. Only containment.ts and its test differ among the22 module files. Evidence/handoffb353092ad9e49f28a65451d188c636079e1df091 is pushed. Coordinator verified raw log SHA25628dc7c1c6d3d7f1b13e47de5e8a48a2d208364c2816905e521028d20dbf596f0, exact source before/after, all22 source hashes and10passing real-loopback tests at exit0. The tests compose the same upstream normalization and downstream2MiB JSON/rawBody verifier; alias paths terminate503 without reaching either parser or verifier, while the unrelated normalized POST reaches both as a positive control. Absolute-form and raw-fragment pathname cases are also covered. QO-C1 is CLOSED within this composed boundary; protected mount/fullApp has not been applied or qualified. Original184 results remain separate, not194 pooled or184at successor. The patchLFhash and six proposed pairs remain unchanged.
