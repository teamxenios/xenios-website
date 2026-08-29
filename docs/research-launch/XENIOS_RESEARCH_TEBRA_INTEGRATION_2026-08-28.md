# Xenios Research Tebra Integration — 2026-08-28

Classification for this release candidate: **HUMAN CONFIGURATION REQUIRED**.

The fail-closed architecture is implemented, tested, and integrated. No real
Tebra destination, mode, origin, portal URL, telehealth setting, or practice
approval exists in this candidate, and none may be invented. Until the practice
administrator supplies the exact values through the approved configuration
channel and staging evidence is captured, every scheduling and portal surface
renders a truthful "not yet available" state.

## Supported boundary

Tebra remains the authoritative system for scheduling and the patient portal.
The candidate integrates it only through the four supported, configurable
mechanisms:

| Mode | What it is | Candidate state |
| --- | --- | --- |
| `disabled` | No scheduler is loaded; the Care surfaces show the configured-pending state. | Default and rollback baseline. |
| `direct_link` | An outbound link to the exact Tebra scheduling URL the practice copied from its widget settings. | Implemented; dark until configured and release-bound. |
| `iframe` | The official Tebra scheduling page embedded, only after origin allowlisting and a separately attested CSP composition. | Implemented as a mode; unavailable until an attested CSP composition exists. |
| `popup_widget` | The official Tebra embed script opened as a pop-up, only from an allowlisted script origin. | Implemented as a mode; unavailable pending script-integrity, cleanup, and CSP evidence. |

Nothing in the candidate calls a Tebra API, mints an appointment, or reads a
clinical record. `TEBRA_ENVIRONMENT=review` can never produce an actionable
handoff: `server/care/tebra-scheduling.ts` resolves every non-`production`
environment to `unconfigured`, and `production` additionally requires a
release-bound durable scheduling authority before a direct link becomes
actionable (`evaluateTebraPublicAuthority`).

## Scheduling truth contract

- A scheduling surface is `ready` only when mode, URL, allowlisted origins,
  environment, and durable authority all validate. Any missing or invalid value
  fails closed to `unconfigured` or `configuration_invalid`; dependency failure
  is `unavailable`, never a fabricated "disabled" or "coming soon" claim.
- The Patient Portal is a separate handoff with its own durable authority
  (`authorities.portal`, scope `patient_portal_public_handoff`); a retained
  portal URL cannot become actionable through general Care enablement.
- Telehealth is presented only when `TEBRA_TELEHEALTH_ENABLED=true` is supplied
  after practice attestation; the default is false.
- Care documents receive a strict self-only baseline CSP
  (`server/care-document-csp.ts`: no provider, no third-party font, no
  frame-src) until a mode-specific policy is attested. Third-party pixels,
  marketing attribution, and analytics are suppressed on Care paths.
- Clinical writes (appointments, intake, prescriptions, pharmacy actions,
  review) pass a canonical capability gate before any repository or RPC is
  reached (`server/care/clinical-write-gate.ts`, 20 routes; scheduling requires
  both `provider_actions` and `external_communications`); refusal logs carry no
  actor, patient, record, request-body, or clinical content.
- The account Care view shows only the authorized current stage; it never
  infers earlier stages, provider approval, prescription, or pharmacy processing.

## Runtime configuration contract

Exact adapter variables (canonical source:
`docs/care/TEBRA_ACTIVATION_PACKET_2026-08-28.md`, "Adapter environment
contract"):

| Variable | Required | Value |
| --- | --- | --- |
| `TEBRA_SCHEDULING_ENABLED` | Yes | `true` or `false`; `false` is the safe baseline and rollback value. |
| `TEBRA_SCHEDULING_MODE` | Yes | `disabled`, `direct_link`, `iframe`, or `popup_widget`. |
| `TEBRA_SCHEDULING_URL` | Every non-disabled mode | Exact HTTPS practice scheduling URL copied from Tebra; no credentials, fragments, or patient parameters. |
| `TEBRA_SCHEDULING_EMBED_SCRIPT_URL` | `popup_widget` only | Exact official embed script URL from the audited Tebra snippet. |
| `TEBRA_PATIENT_PORTAL_URL` | No; independent of the scheduler | Exact approved HTTPS portal URL. |
| `TEBRA_ALLOWED_ORIGINS` | Every configured external URL | Comma-separated exact HTTPS origins covering scheduling, script, and portal URLs. |
| `TEBRA_TELEHEALTH_ENABLED` | No | `true` only after entitlement and display attestation. |
| `TEBRA_PRACTICE_NAME`, `TEBRA_LOCATION_LABEL`, `TEBRA_PROVIDER_LABEL` | No | Approved public labels only. |
| `TEBRA_ENVIRONMENT` | Every enabled scheduler or configured portal | `review` or `production`. |

Do not commit real values. The retired private REST-base and API-key
variables are not part of this integration and must not be configured.

## Human activation packet (exact inputs still required)

| Input | Owner | Status |
| --- | --- | --- |
| Approved production scheduling mode | Samuel / practice admin | REQUIRED |
| Exact Direct Link from Tebra scheduling-widget settings | Practice admin | REQUIRED |
| iframe eligibility confirmation and exact origin (if iframe) | Practice admin + security owner | CONDITIONAL |
| Exact official Embed Link/script and its origins (if popup) | Practice admin + security owner | CONDITIONAL |
| Exact official Patient Portal URL | Practice admin | REQUIRED FOR PORTAL |
| Practice / provider / visit-reason / hours / location enablement | Practice admin | REQUIRED FOR LIVE SCHEDULING |
| Telehealth enablement confirmation | Practice admin | CONDITIONAL |
| Exact CSP / origin approval for the chosen mode | Security / release owner | REQUIRED FOR EMBED |
| Configuration version and owner sign-off | Release owner | REQUIRED |
| Staging evidence with the real configuration (routes, CSP, postMessage, browser) | Lead + security owner | REQUIRED BEFORE ACTIVATION |

No one executing this candidate may perform the account-side actions above.

## Implementation evidence in this candidate

- Fail-closed handoff architecture, truthful Care/Tebra pages, privacy and
  tracking boundaries, and the activation packet: Lead lineage through
  `b41de5af1cd769778be501020df10336b348720f`.
- Canonical clinical write gate at every write route:
  `aefac85` (replay of `codex/xr-root-care-clinical-gate-20260828` @
  `84635084`), covered by `server/care/clinical-write-gate.test.ts`,
  `clinical-write-gate.adversarial.test.ts`, and `clinical-route-coverage.test.ts`.
- Request and error log redaction on Care routes: `40bae71`.
- Care CSP baseline self-only (no third-party fonts): verified at the candidate
  in `server/care-document-csp.ts`.
- Scoped Care tests in the pinned runtime during integration: 56 files / 963
  tests across the seven root corrections including `server/care`; the
  complete sequential suite result is recorded in the RC document.

Not closed by this candidate (Lead-owned, recorded as open): a durable bounded
guard for the public Tebra configuration endpoint (root-queue item 5 was
applied and reverted because its no-guard default would return 503 in
production); popup-mode script-integrity and cleanup evidence; iframe/popup
CSP attestation with real origins.

## Activation decision

The candidate ships Tebra as **HUMAN CONFIGURATION REQUIRED**. Activation is a
later, separately approved change: supply the exact values through the
deployment configuration system, capture staging evidence for the chosen mode,
obtain practice-admin and founder approval, and only then enable. Rollback is
`TEBRA_SCHEDULING_ENABLED=false` (and `TEBRA_SCHEDULING_MODE=disabled`), which
returns every scheduling and portal surface to the truthful pending state
without a code change.

## Official operator references

- Tebra scheduling widget settings (Direct Link / Embed Link) — practice
  account, copied by the practice administrator.
- Tebra Patient Portal URL — practice account.
- `docs/care/TEBRA_ACTIVATION_PACKET_2026-08-28.md` — canonical packet,
  staging validation gate, and rollback.
