# Handoff

TASK: ASSISTED-ORDER-MOUNT (Phase Zero, founder P0)

SESSION: claude-fable-main

BASE SHA: a872961

BRANCH: claude/assisted-order-bridge

COMMIT SHA: 2ed32263bc3cb472096f94ce3421aaf0e5fde108

WHAT WAS BUILT: the survey-style assisted order intake, end to end and dark by
default. Config surface + D-005 legal split + assisted_order_form_v1 with the
founder's exact copy and a conditional RUO fact (10a66b9, 2ed3226); canonical
catalog/Product Control mapping and fail-closed production composition
(982dba3); the one Early Access session resolver exposed through the existing
door-sources observer (3214099); Express adapter + literal 10-route mount with
requireSupabaseAdmin on the four admin doors, census measured 376/385
(56d8501); 17 wall probes proving method-exact anchored admissions (34957e5);
customer + admin client routes and the config-aware Early Access CTA
(700e742); source-auditability and catalog-boundary fixes (7d5ccdb).

WHAT WAS NOT BUILT: secure document upload is mounted but stays server-gated
behind the identity_requested status (fast follow); Google Sheets mirror
composed as null (optional fast follow).

FOCUSED TESTS: 43 assisted-order, 67 Early Access wall, 32 core-site, 1521
client research, full battery 9531 passed with ONE pre-existing failure.

TYPECHECK: clean. BUILD: clean (dist/index.cjs 1.4mb).

KNOWN PRE-EXISTING FAILURE, NOT MINE: the migration DAG rejects the M71 entry
(research_assisted_order_bridge cannot be read at its recorded sourceSha).
Reproduces at 3214099 before this mount; belongs to the M71 registration lane.

PRODUCTION MUTATED: no. No deploy, no migration apply, no Render change.

NEXT UNBLOCKED TASK: founder production approval, then M71 apply and the env
enablement; after that, secure upload + Google mirror, then the roadmap.
