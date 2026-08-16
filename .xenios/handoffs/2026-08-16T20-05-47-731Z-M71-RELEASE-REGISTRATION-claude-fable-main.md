# Handoff

TASK: M71-RELEASE-REGISTRATION

SESSION: claude-fable-main

BRANCH: claude/assisted-order-bridge

COMMIT SHA: 32bbd7998e806d881590c9e9a32123c2b8ba8168 (tag RESEARCH_PLATFORM_0_5_ASSISTED_ORDER_RC)

WHAT WAS BUILT: the M71 release-registration defect is corrected. Diagnosis:
the DAG entry was never wrong. The bytes at its recorded sourceSha
35b0fbe hash to exactly the recorded checksum da60e8b0 and are byte-identical
at HEAD. The gate's provenance stub is a CLOSED allowlist; a migration
without its own branch falls to a fallback demanding the release baseline
SHA, which a migration created after that baseline can never satisfy. M71 was
registered without adding its branch. Added the pin exactly as every other
pending migration carries one. The certified migration body and the DAG entry
are both untouched.

EVIDENCE: migration DAG + checksum gates 35 passed. M71 harness re-run
independently on postgres:16 AND postgres:17, exit code captured directly
(HARNESS_EXIT=0), REHEARSAL PASS on both engines. Full battery 9535 passed,
0 failed, first fully green battery of this lane. Build clean.

M69/M70/M71 CONVERGENCE PRESERVED: no MIGRATIONS.md row was taken wholesale,
no M69 or M70 evidence was touched. Only M71's own provenance pin was added.

PRODUCTION MUTATED: no. Production still runs b0fe396; zero assisted-order
tables exist in the production database; the feature flag is unset.

NEXT UNBLOCKED TASK: founder production approval for the Phase Zero enable
sequence (M71 apply, deploy, then flag), then the fast-follows.
