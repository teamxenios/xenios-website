# Account/partner UI and Resource Hub installation — production result

**Installed and deployed; Resource Hub disabled. Activation and full platform completion remain pending.**

| Receipt | Observed result |
| --- | --- |
| Application SHA | `3814c687ef9293f84f939c372fdbc01b278a9193` |
| Application tree | `62915f1f23e16610c74622723391e9692fe7c84e` |
| Reviewed execution evidence head | `3f51ed4af75e47ef5c94ab18a46a9f2d4fc27b9e` — separate from application |
| Render deploy | `dep-dag1reu7bikc73e16ie0`, LIVE at `2026-09-08T14:38:44.68489Z` |
| Service / project | `srv-d8s9vej7uimc7384dfcg` / Supabase `yvzeduaxbwgcwllhywff` |
| Exact migration | LF SHA-256 `e55f965fbc942b4de6ec7b74b2bc28b8d7eff8dd6530f50c9876d3137e8dd722`, applied once |
| Actual history | `20260908143724` / `20260906120000_research_resource_library` |
| Precheck / postcheck | Both full exact reviewed SQL files passed on managed PostgreSQL 17.6 |
| Configuration | Direct `RESEARCH_RESOURCE_HUB_ENABLED=false`; membership billing absent; zero inherited groups; new process logged `NODE_ENV=production` |
| Public comparison | 30 SAME; 0 intentional changes, regressions or human-review differences; explicit empty allowances |
| Observation | `14:39:32.233Z`–`14:44:32.465Z`, 300,232 ms; 13 rounds / 26 HTTP 200 health responses |
| Logs | Full observation interval: 0 error/fatal logs, 0 error/exception/failed/fatal text matches, 0 HTTP 5xx entries; no unreturned pages |
| Rollback | Not used; exact compatible application target remains `ff3c496245739233b71e46f9e5d6e26af9d57017` |

The migration postcheck verified exact schema/constraints/indexes/function bodies/trigger, FORCE RLS, service-only permissions, private bucket and zero initial rows/objects. A later read at `14:45:55.787734Z` still showed zero resources, versions, deliveries and bucket objects. The two previously completed account/partner migrations were preserved and not replayed. No migration history was repaired. These counts do not establish unrelated customer, product, pricing or order aggregates.

The serving identity was read from Render after deployment and after observation. The former ff3 deployment is deactivated. Auto-deploy remains off and the configured branch is unchanged. Hub disabled composition is established by the direct false value, absence of environment groups, exact source, production start command and actual new-process production log. This is not an authenticated Hub list or delivery test.

[Full installation receipt](resource-hub-installation-production-receipt-3814.json), [migration receipt](resource-hub-production-migration-3814.json), [endpoint comparison](critical-endpoints-installation-comparison-3814.json), and [health observations](resource-hub-installation-health-observation-3814.json) retain the actual results. [Installation packet](RESOURCE_HUB_INSTALLATION_PACKET_3814.md) and [standing conditional authority](standing-conditional-authorization-20260908.json) define the executed scope.

| Workflow | Implemented | Deployed | Enabled | Live journey verified |
| --- | --- | --- | --- | --- |
| Universal account/partner access and current UI | Current slice implemented | Yes | Access behavior deployed; real grants not performed | Public/unauthenticated checks only; real-user acceptance pending |
| Resource Hub | Installation implemented; two admin corrections still required | Yes, schema and current application | No | No |
| Dashboard share/link/QR card, PNG, mobile corrections | B's separate follow-on work | Not established for this slice | Not claimed | No |
| Broader CRM, recruiter, support and ordering scope | Partial; requires task-level qualification | Historical pieces only; no complete-workflow claim | Depends on verified prerequisites | Not established |

No real account was approved/claimed, no partner activated, no resource uploaded/published/downloaded, and no notification job was triggered for smoke. No email, charge, refund, shipment or clinical action was initiated. Existing unchanged background jobs may perform ordinary due work; restarting the application is not claimed to have zero effects on those jobs.

The separate builder pushed the two defensive corrections at `d974d2612ff914045761340d06243a3ef40976d2` / tree `fbb70b4a623bfd7b93010ac7844c5f9e2ea8b809`: recheck SHA and filename after an upload-key conflict, and condition review writes on expected state and review provenance. Its 131 affected tests and full application typecheck passed. B's independent exact-source acceptance and final integration/release checks remain pending; this fix is not integrated, deployed or enabled. Managed Auth/PostgREST/Storage, real role/logout switching, and an exact content/audience/identity/expected-write/recovery plan remain activation gates. The prepared private source-review PDFs are not publication-approved resources.

Managed activation qualification is estimated at 3–5 hours of active work after the hardening candidate and required identities/content/environment are available; that estimate excludes missing-input delays and broader platform work. The disabled installation is an intermediate result. A remains the sole production executor; no replay or redeploy of this completed stage is required.
