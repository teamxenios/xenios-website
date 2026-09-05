# Exact-SHA working checkpoint — Seth revenue launch

TASK: XENIOS-SETH-REVENUE-LAUNCH-TO-PRODUCTION-20260905
SESSION: codex-seth-revenue-launch-20260905
ROLE: continuing isolated engineering session; active lease retained
BRANCH: codex/xenios-seth-revenue-launch-20260905
PUSHED SOURCE SHA: 58feb6467d118fc38e8eaa84b2c18d3fe28607e7
SOURCE TREE: bc93c08c5119b99523452f6192e60fb86ac79797
BASE: ba3ea05bec38efe6eda94a9eb6b6f37f728baa1c

Not complete, not release-ready, no production GO. Source checkpoint and exact
file identities: docs/revenue-launch/20260905/SOURCE_CHECKPOINT.md. Actual
CSV/JSON crosschecks pass for 39/117 Phase A and 68 Phase B, four known Phase B
price exceptions retained. Seven source-integrity regression tests pass.
Only 14/44 package files are present. Exact workbook, original source manifest
and starter code are absent; no workbook verification or supplied-test claim.

Current production reverified read-only on Render:
db5a2d447114c1e8a14185a9865ded50ee3f1ac6, dep-dad08h740ujc73aprfcg,
srv-d8s9vej7uimc7384dfcg, automatic deployment off, cart configuration false.
34 historical exact product/variant/SKU bindings still join current rows;
their unit, shipping, commerce and documentation gaps remain. Six source
formulations require confirmation. Fresh supplier liveness remains unverified:
the intentional direct-table denial was respected; bulk read RPC returns 404.
Use the existing per-unit read interface as the application does if needed.

No app runtime changed. No source price approved, product published, migration
applied, flags changed, messages sent, payments or clinical actions performed.
Inherited named-PII release gate remains incomplete; full production-range
synthetic-pattern scan findings are not waived. All other dirty worktrees and
foreign leases remain intact.

System of record regenerated and checked against 58feb6467d118fc38e8eaa84b2c18d3fe28607e7:
219 routes, 15 capabilities, production baseline unchanged. Generated files are
in the immediate successor commit, per the canonical source-basis protocol.

Next: canonical price quantity tiers and cart/checkout recomputation, followed
by immutable Product Control intake/review/candidate authority and UI. Runtime
paths added to this session's lease explicitly. Node 20.19.0 is at
C:/Users/sboad/.codex/toolchains/node-v20.19.0-win-x64/node.exe. This worktree's
ignored node_modules junction points to the existing dependency installation;
do not mutate it with npm install. Run focused tests with four workers, full
release gates only at integration boundaries, and never concurrent SOR writers.

The parent task has requested the missing ZIP. Continue engineering without
asking Samuel to reconstruct repository history. Present a full-SHA production
GO only after the exact candidate, migration rehearsal and operational gates
are concrete and verified.
