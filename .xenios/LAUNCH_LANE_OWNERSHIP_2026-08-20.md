# Fleet resume ownership — 2026-08-20 EARLY ACCESS TODAY (LEAD: claude-fable-desktop)

RESUME BASE every clean lane starts from: `xenios/launch-integration-20260819`
@ `6251a6ae8ad6f9e65d21233d53190d4410821ca6` (pushed). Dirty worktrees
checkpoint their existing work FIRST, then reconcile against this base.
Production LIVE at a66434d9 (Release A); rollback 458e7284 (flags off first).

Dispatch messages (full lane prompt + header, one per session):
`.xenios/messages/2026-08-20T00-05-NN-...-DISPATCH-SESSION-NN-...md`

| # | Lane | Window (existing session) | Worktree | Branch |
|---|---|---|---|---|
| 1 | Lead/integrator/release | claude-fable-desktop | C:/xenios-wt/general-platform | xenios/launch-integration-20260819 |
| 2 | EA one-code gate | s10-release-security (reassigned; clean) | C:/xenios-wt/s10-release-security | lane/s2-ea-one-code-gate (new) |
| 3 | 426 retail catalog / Product Control | lane5-partner-portal (reassigned; parks portal work first) | C:/xenios-wt/lane5-partner-portal | lane/s3-retail-catalog (new after checkpoint) |
| 4 | Storefront/detail/mobile | storefront (match) | C:/xenios-wt/storefront | lane/launch-public-storefront |
| 5 | EA order flow + qty 100 | s3 (match; 717-ins dirty work) | C:/xenios-wt/assisted-order-flow | fable/assisted-order-customer-flow-20260819 |
| 6 | Manual affiliate code | lane4-affiliate (match-ish; checkpoints bindings+SQL first) | C:/tmp/xenios-lane4-affiliate | lane/affiliate-attribution-core |
| 7 | Order emails / outbox | NEW WINDOW | C:/xenios-wt/s7-order-emails (create) | lane/s7-order-emails (new) |
| 8 | Payment/quote/canonical order | s7 (reassigned; scaffold matches) | C:/xenios-wt/canonical-order | fable/canonical-order-history-20260819 |
| 9 | Admin/fulfillment/tracking/status | s8-fulfillment (reassigned; checkpoints engine work) | C:/xenios-wt/lane-fulfillment-tracking | lane/fulfillment-tracking-min |
| 10 | Composed E2E/security | s9-conversion-qa (reassigned; discards lead-seam shim) | C:/xenios-wt/s9-conversion-qa | lane/e2e-conversion-qa-20260819 |

## Cross-lane seam rules (registered conflicts)

1. The affiliate-code FIELD in the order wizard: Session 6 owns the
   component/validation/states; Session 5 owns the wizard file and imports it.
2. Quantity-100 contracts: Session 5 owns shared/research/assisted-order
   quantity pieces; Session 4 consumes them in storefront UI.
3. EA gate wall/route changes: Session 2 delivers snippets; ONLY the lead
   edits server/research/index.ts / server/index.ts.
4. Catalog reconciliation artifacts: Session 3 builds; ONLY the lead executes
   the controlled production price/dataset release.
5. Notification templates (S7) vs order flow (S5) vs admin queue (S9): S7
   owns communications.ts/templates; S5/S9 never edit them.
6. Lane 4's earlier SQL candidates and lane 5's portal work: checkpointed and
   PARKED (future phases), not part of today's P0.

Lead-owned paths and all other standing rules: see
`.xenios/LAUNCH_LANE_OWNERSHIP_2026-08-19.md` (still in force where not
superseded by this table) and the shared fleet rules inside each dispatch.
