# Xenios Research Human-Only Blockers — 2026-08-28

> Status: **RECONCILED to the frozen candidate** (see
> `XENIOS_RESEARCH_FULL_WEBSITE_RC_2026-08-28.md` for the exact SHA and gate
> results). Engineering work that could be finished without a human input was
> finished or truthfully disabled; nothing below is used as an excuse to stop.

## Qualification

A dependency belongs here only when continuing requires a credential, contract,
legal decision, external account configuration, exact product approval, or
production GO, or would require an irreversible or unauthorized external action.
For every item the candidate already provides a truthful disabled, unavailable,
or pending state.

## Exact external inputs still required

| Input | Why human-only | Owner | Candidate behaviour until supplied | Status |
| --- | --- | --- | --- | --- |
| Tebra scheduling mode (disabled / direct_link / iframe / popup_widget) | Practice-account decision | Samuel / practice admin | `disabled`; Care pages show the pending state | REQUIRED |
| Exact Tebra Direct Link | Must be copied from the authorized Tebra account | Practice admin | No guessed link; configuration-pending state | REQUIRED |
| iframe eligibility and exact origin (if iframe) | External capability + security approval | Practice admin + security owner | direct link or disabled | CONDITIONAL |
| Official popup embed script and origins (if popup) | External configuration + security approval | Practice admin + security owner | direct link or disabled | CONDITIONAL |
| Exact Tebra Patient Portal URL | Authorized practice account | Practice admin | Portal handoff unavailable (separate durable authority) | REQUIRED FOR PORTAL |
| Practice / provider / visit-reason / hours / location enablement | Tebra account-side configuration | Practice admin | No availability or confirmation claim | REQUIRED FOR LIVE SCHEDULING |
| Telehealth enablement confirmation | Practice / provider eligibility | Practice admin | Telehealth not advertised | CONDITIONAL |
| Tebra CSP / origin approval and staging evidence for the chosen mode | Security decision tied to the copied values | Security / release owner | Self-only Care CSP; no iframe or popup load | REQUIRED FOR EMBED |
| Effective approved public quality, fulfillment, storage and COA copy and disclaimers | Counsel / claims authority (policies are drafts) | Designated approver | Public pages carry narrowed, non-clinical wording; PoliciesIndex marks documents as drafts | REQUIRED BEFORE AFFIRMATIVE CLAIMS |
| Accessibility Statement counsel review and external audit decision | Legal | Counsel / Samuel | Served as an explicit operational draft at `/research/policies/accessibility` | REQUIRED BEFORE "EFFECTIVE" |
| Production GO for the exact frozen RC SHA | Irreversible external release decision | Samuel | No deploy | REQUIRED FOR ANY DEPLOY |
| Production migration GO and migration-DAG registration for any candidate under `supabase/candidates/` | Irreversible database decision after independent review | Samuel / data owner | Candidates unapplied; client-import lifecycle FUTURE MIGRATION REQUIRED | REQUIRED FOR FUTURE MIGRATION |
| Exact product and variant activation approval (per offering), with durable current/live evidence | Product governance | Founder / catalog owner | Fail closed; no add-to-cart; catalog is request/informational | REQUIRED PER PRODUCT |
| Designated authority for the two conflicting prices (Oxytocin 10 mg $59 vs $107.50; Hexarelin 5 mg $49 vs $62.50) and the four canonical variants absent from the 420-row runtime artifact | Pricing / catalog authority | Founder / catalog owner | Ledger documented; no silent selection; artifact not regenerated | REQUIRED |
| Regeneration of the runtime catalog artifact from the current workbook (private intake outside Git) | Requires the private workbook inputs | Founder / catalog owner | Committed artifact retained; unbound explanations corrected and pinned | REQUIRED FOR 424-VARIANT RUNTIME |
| Approved out-of-repository PII names corpus for the release scan | Privacy-approved input | Samuel | Consumed by the frozen-SHA scan from its recorded path; never printed or committed | PROVIDED (hash-verified) |
| Git-history purge of the partner principal's full name (present in earlier commits of already-pushed branches; scrubbed from the candidate tree at `bfc1eeae`) and the seven remaining first-name-only mentions (test descriptions, two internal reports, a session-registry line, one report file name) | Rewriting shared history and renaming a referenced report are irreversible, cross-branch actions | Samuel / partner | Candidate tree passes the approved-name scan with zero findings; history untouched | REQUIRED DECISION |

Do not commit credentials, copied secret values, patient-specific URLs, PHI,
PII, or production embed code to this file.

## Founder decisions required

| Decision | Options presented by the implementation | Decision |
| --- | --- | --- |
| Tebra initial production mode | disabled / direct_link / iframe / popup_widget | PENDING |
| Tebra Patient Portal handoff | enable only with the exact official URL / keep disabled | PENDING |
| Client-account / invitation migration candidate | remain unapplied / separately authorize after a corrected harness and clean-checkout rehearsal | PENDING |
| Deploy the exact frozen RC SHA | approve exact SHA / do not approve | PENDING |
| Exact product + variant activation | approve only with durable current/live evidence / remain unavailable | PENDING per offering |
| Research indexing (`RESEARCH_INDEXABLE`) and sitemap publication of Research editorial pages | enable after raw-HTTP evidence review / keep noindex | PENDING |
| Public storefront mount (`RESEARCH_PUBLIC_STOREFRONT_ENABLED`) | keep off until publication authority and approved copy exist / enable later | PENDING (engineering gates also open) |
| Global marketing-shell touch-target fixes (Navbar/Footer/TopRibbon, hard-tripwire protected) | accept a reviewed global-shell change / defer | PENDING |
| Partner-name history purge and first-name mention cleanup | rewrite history + rename report / leave history, scrub only the candidate tree (done) | PENDING |
| FILE_OWNERSHIP re-baseline for integration candidates (the release-manifest verifier reads exact-file, single-lane ownership rules from the 3daa production base; 483 of the candidate's 583 changed files have no base owner and 20 belong to other lanes, so the verifier's ownership check fails for any integration RC while every other manifest check passes) | accept the disclosed ownership exceptions for this RC and re-baseline the policy at the next production base / require per-lane manifests before acceptance | PENDING |

This packet does not recommend or execute a production choice.

## Not human-only — engineering residuals the candidate ships as PRODUCTION DISABLED

These are not reasons to stop; they are recorded so nobody mistakes a disabled
surface for a finished one:

- refund execution and admin refund/replacement (root item 1: atomic provider
  effect + persistence; `durableRefundExecutionAvailable` is hard-wired false);
- exact product/variant activation and cart/checkout mutation authority (root
  item 2: transaction/CAS/lease coupling; production repositories unavailable);
- production webhook application (no atomic inbox+order adapter;
  `capability_disabled` before verification);
- member-catalog bounded read and media signing (root item 16, rejected TTL and
  forgeable-signer findings; production 503);
- Lane 08 inventory aggregate (root item 17, rejected completeness/parity
  findings; production 503);
- public lot verification API (`registerPublicQualityApi` absent; route
  unmounted, noindex);
- durable bounded guard for the public Tebra configuration endpoint (root item
  5 reverted; endpoint unthrottled as at the Codex checkpoint);
- client-account migration harness (rejected for trust/TOCTOU/EOL/manifest
  gaps; no disposable rehearsal claimed in this candidate).

## Closing record

| Field | Value |
| --- | --- |
| External inputs still required | 16 listed above (1 provided) |
| Founder decisions still required | 10 listed above |
| All non-human engineering work complete | YES for everything not classified PRODUCTION DISABLED above; the disabled items carry exact residual work in `CONTROL/CLAUDE_INTEGRATION_LEDGER.json` |
| Ready for Samuel deploy review | See the RC document's final verdict |
