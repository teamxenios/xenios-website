# ASTRA-A / ASTRA-B Branch Delta Reconciliation

Observed on 2026-09-05 from the two pushed branch tips:

```text
ASTRA-A: origin/codex/xenios-seth-revenue-launch-20260905
         8f444fe8796f0b1275d5504f03b6a22c653d46ce
ASTRA-B: origin/codex/xenios-seth-astra-b-20260905
         5a6373f94b3243fd6a8458586d2dd5c652f3250d
merge-base: 1bd9431b0eac6d12a255832fe2f676f07e2a5027
```

The tip-to-tip diff contains 123 changed paths. It includes runtime, server,
shared, migration-candidate, generated-record, and coordination files—not only
ASTRA-B evidence. This is expected from the paired workflow: ASTRA-A continued
integrating backend/release work after the B worktree forked.

## Integration rule

Do **not** merge the ASTRA-B branch wholesale into ASTRA-A. The B handoff is a
selective evidence/documentation slice. ASTRA-A should cherry-pick or manually
integrate only the B-owned evidence and handoff commits needed for the release
record, preserving the newer A runtime, migration, and system-of-record state.

The B-owned commits in this evidence series are:

```text
325f013  focused UX/Product Control verification
d817cd6  focused UX handoff
e57678f  corrected partner lifecycle source audit
bb9f5c1  partner application contract regression evidence
a1186d6  refreshed focused UX handoff
92f0e60  ASTRA-B static gates
e73ec4a  static-gate handoff refresh
bee5cc3  ASTRA-B production build
170c571  build handoff refresh
7d299d0  stale site-record gate evidence
6feec02  stale-record handoff refresh
f7ca54e  authoritative A/B site-record distinction
295f847  reconciled site-record handoff
a7a395f  catalog/Product Control regression evidence
29154f7  catalog-control handoff refresh
48a4b16  release-state boundary audit
5a6373f  release-control-plane evidence
```

The exact current evidence tip is maintained separately from the A runtime tip.
No production configuration, migration, price, account, communication,
payment, or deployment action was taken in this reconciliation.
