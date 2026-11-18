# Confirmed review readback survives conflict and remount

Exact source **741eb3eca2371689bc15d703d6e6e0f94fe5dbdf**, successor to4c541ac9167db019bb61b8d15bb2a7b5486e0866, on `codex/ea2-start-review-control-20261118`, draft https://github.com/teamxenios/xenios-website/pull/486 .

Exactly2owned paths; +18/-2. Independent review accepted the earlier parent-revocation and external-journal structure but found one last ordering defect: a409 attempt was cleared before processing a strict reviewing GET, so a real child remount with an older queued parent could offer a new command ID.

The journal now marks an existing attempt confirmed on every strict reviewing readback before considering clearance. It clears a conflicted attempt only after a strict queued readback. The regression executes POST409, authorized reviewing GET, actual child unmount/remount and prior queued parent snapshot, asserting confirmed journal command retained, no Start/Confirm/Retry, exactly one POST and one UUID.

Exported contract/lifetime obligations are unchanged from JOURNAL-HANDOFF.md: required external journal and opaque canonical session-lifetime key owned above Auth-event child remounts; exact API/request-tagged current wrapper; strict ready-envelope/error translation; no Auth authority granted by local coordination. Root/Claude-1 retain exclusive transport/Care lifetime/mount work.

**Successor47-test local run NOT_STARTED**: fresh bounded native-memory guard returned RESOURCE_HOLD75, no child and no relaunch. Receipt `monotonic-memory-preflight.json`. Do not borrow predecessor35/44 passes or4c hosted typecheck/build/protection. Exact successor typecheck/build/tests remain unqualified until their own hosted/integration execution.

Prior4c exact hosted run44240634081 failed an inherited staff-recovery PG prerequisite before this control suite. Root is moving early UI qualification ahead of unrelated PG gates on full integration; no tests/validators are weakened here. Public release487 excludes this standalone control. No route wiring, actual browser, real staff session, provider, notification, admission, database or deployment action occurred.

Private synthetic component fixture source remains prepared only; it is not compiled/served and makes no actual-route claim. Homepage previews remain unchanged. All shared metadata remains uncommitted in the isolated author worktree.
