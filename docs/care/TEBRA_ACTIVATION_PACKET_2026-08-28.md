# Tebra activation and operations packet

Date: 2026-08-28

Scope: Xenios Care scheduling bridge and Patient Portal handoff

Authority: Tebra remains authoritative for appointment availability, appointment confirmation, telehealth eligibility, clinical information, patient communications, statements, and applicable clinical payments.

## Current status and authorization boundary

This packet is an activation checklist, not authorization to activate Tebra or deploy production.

| Action | Status |
| --- | --- |
| Production deployed | **NO** |
| Production or shared-staging configuration changed | **NO** |
| Tebra practice settings changed | **NO** |
| Tebra scheduler enabled or disabled | **NO** |
| Patient Portal activated | **NO** |
| Patient accounts created | **0** |
| Patient invitations sent | **0** |
| Appointments requested or confirmed | **0** |
| Patient data imported | **0** |
| Tebra contacted | **NO** |
| Production migration applied | **NO** |

All production deployment, Tebra account administration, Patient Portal activation, patient invitation, provider scheduling, clinical, payment, and external-communication actions require separately recorded owner approval for the exact release SHA and exact configuration.

## Source-aligned architecture

Xenios does not recreate Tebra scheduling or clinical functionality. The Care experience exposes one of four server-controlled scheduling modes:

| Mode | Xenios behavior | Official Tebra basis | Activation rule |
| --- | --- | --- | --- |
| `disabled` | Show an honest unavailable/configuration-pending state and a non-clinical support path. | A practice scheduler may be disabled and becomes inaccessible. | Default and rollback mode. No scheduling URL or script is loaded. |
| `direct_link` | Launch the exact practice scheduler URL supplied by the Tebra administrator. | Tebra permits its copied direct link to be used as a hyperlink. | Exact HTTPS URL and exact origin allowlist must pass validation. |
| `iframe` | Render the exact practice scheduler URL in a titled iframe with a visible direct-link fallback. | Tebra permits its copied direct link to be used as an iframe source. | Exact HTTPS URL, exact frame origin, CSP approval, accessibility checks, and staging browser validation are required. |
| `popup_widget` | Load the audited external script URL extracted from the exact Tebra-provided widget snippet and retain a direct-link fallback. | Tebra permits its copied embed script in the website `<body>`; the widget opens a scheduling pop-up. | Exact scheduling URL, exact external script URL, exact origin allowlist, CSP approval, and staging network inspection are required. Arbitrary inline HTML or script is not accepted. |

The Patient Portal is an independent external handoff. It is not a scheduling mode, is not embedded, and must not imply Xenios/Tebra single sign-on. Tebra's current patient documentation directs invited and activated patients to [https://portal.kareo.com/](https://portal.kareo.com/).

## Appointment-request truth

The public scheduler creates an appointment request. It does not, by itself, prove that an appointment is booked or confirmed.

Tebra documents that practice staff review tentative requests, check for conflicts, choose or confirm the visit reason and duration, and then confirm or decline the request. The patient receives Tebra's confirmation communication only after that workflow.

Required Xenios language:

- “Request an appointment in Tebra.”
- “Available times and visit types are shown in Tebra.”
- “Your request is pending until the practice confirms it.”

Prohibited Xenios behavior:

- Do not label a click, iframe load, pop-up open or close, redirect, or return navigation as “booked,” “scheduled,” “confirmed,” or “complete.”
- Do not create a synthetic Tebra appointment identifier.
- Do not persist an authoritative appointment or Care status from client-side activity.
- Do not implement or infer a callback, webhook, REST appointment endpoint, or `postMessage` success event. The official sources listed below do not document any such contract.
- Do not scrape Tebra or mirror its intake fields in Xenios.

## Conditional telehealth

Telehealth is available only when the practice/provider has the required Tebra online-scheduling entitlement and Telehealth subscription and Tebra presents that option in the configured scheduler.

- `TEBRA_TELEHEALTH_ENABLED` defaults to `false`.
- It may be set to `true` only after the Tebra account administrator and Care owner verify the applicable subscription and confirm that the option is visible for the intended provider and location in the production-generated scheduler.
- The flag controls truthful explanatory copy only. It does not create telehealth availability or alter Tebra.
- If eligibility is unverified, Xenios must say that Tebra will show the available visit types. It must not promise telehealth.
- The scheduling iframe must not receive camera or microphone permission. A later Tebra-confirmed telehealth visit and its join link are separate from the scheduling bridge.

## Separate Patient Portal handoff

The Patient Portal remains Tebra's secure system for invited and activated patients to access clinical information and applicable administrative functions.

Tebra documents portal access for:

- health records, including problems, allergies, medications, eLab results, vitals, and shared treatment plans;
- shared documents and secure provider messages;
- statements, itemized receipts when enabled, and payments only when Tebra Payments or Patient Collect is activated;
- authorized guest access and the portal activity log.

Activation and access expectations:

- The practice activates Patient Portal once and accepts Tebra's terms.
- The practice invites a patient; the patient activates from Tebra's email using a password and date of birth.
- Portal access is not implied by a Xenios account or Care status.
- Portal payment availability is not implied unless the Tebra payment configuration is independently verified.
- Xenios must not create or invite portal users, proxy credentials, collect portal passwords, display inferred invitation/registration status, or reproduce clinical records, messages, lab results, statements, or payments.
- Launch the validated external portal URL with opener isolation and a no-referrer policy. Do not iframe or deep-link to undocumented portal routes.

## Required Tebra account-administrator inputs

An authorized Tebra account administrator must provide the following through the approved secure operational channel. Do not place screenshots containing patient information, credentials, or access tokens in Git.

1. **Entitlement evidence**
   - Current Engage or Patient Experience online-scheduling eligibility for every provider intended to appear.
   - Current Telehealth subscription evidence if telehealth copy is requested.
2. **Practice scheduler state**
   - Evidence that Practice Settings → Calendar Settings → Online Scheduling is enabled.
   - Approval of the custom practice URL before it is created. Tebra documents that this URL cannot be edited after save.
   - The exact generated practice scheduling URL copied from Tebra.
3. **Provider readiness**
   - Online Appointment Booking enabled on each intended Provider Profile.
   - Intended appointment increments, minimum notice, same-day setting, and self-pay-only setting reviewed.
   - Office/custom online booking hours completed.
   - Intended service locations attached and visible.
   - Evidence captured after Tebra's documented 24–48 hour propagation window.
4. **Public visit-reason review**
   - System Administrator confirmation that online visit reasons are intentionally enabled or disabled.
   - Review and approval of every visible label. Tebra documents that enabled visit reasons are practice-scoped and publicly displayed for all providers with online booking.
   - Evidence captured after Tebra's documented one-hour propagation window.
5. **Mode-specific code**
   - For `direct_link` or `iframe`: the exact copied direct link.
   - For `popup_widget`: the exact copied Tebra embed snippet plus the exact external script URL extracted from that snippet. The original snippet is retained as restricted activation evidence, not accepted as arbitrary runtime HTML.
   - A sanitized record of every hostname contacted by the selected mode during staging.
6. **Patient Portal state**
   - Confirmation that Patient Portal is activated or intentionally not activated.
   - The approved external portal URL.
   - Confirmation whether Tebra Payments or Patient Collect is activated.
   - Named operational owner for invitations, access problems, and account-email changes.

## Adapter environment contract

These are the only Tebra scheduling/portal environment variables expected by the replacement adapter:

| Variable | Required | Accepted value and purpose |
| --- | --- | --- |
| `TEBRA_SCHEDULING_ENABLED` | Yes | Exact `true` or `false`. `false` is the required safe baseline/rollback value and prevents any scheduler iframe or script from loading. Omission yields `unconfigured`; any other value yields `configuration_invalid`. |
| `TEBRA_SCHEDULING_MODE` | Yes | `disabled`, `direct_link`, `iframe`, or `popup_widget`. Missing or invalid values fail closed to unavailable. |
| `TEBRA_SCHEDULING_URL` | Every non-disabled mode | Exact HTTPS practice scheduling URL copied from Tebra. No credentials, fragments, or user/PHI-derived parameters. |
| `TEBRA_SCHEDULING_EMBED_SCRIPT_URL` | `popup_widget` only | Exact HTTPS external script URL from the audited Tebra-provided widget snippet. It is rejected in other modes or when its origin is not allowed. |
| `TEBRA_PATIENT_PORTAL_URL` | No; independent of scheduler | Exact approved HTTPS external portal URL. The current official patient documentation uses `https://portal.kareo.com/`. If absent or invalid, portal status remains unavailable. |
| `TEBRA_ALLOWED_ORIGINS` | Every configured external URL | Comma-separated exact HTTPS origins covering every configured scheduling, popup-script, and portal URL. Each entry must be an origin only: no path, query, fragment, wildcard, or credentials. |
| `TEBRA_TELEHEALTH_ENABLED` | No | `true` only after entitlement and scheduler-display attestation; otherwise omitted or `false`. Defaults false. |
| `TEBRA_PRACTICE_NAME` | No | Approved public display label only. No internal identifiers or patient data. |
| `TEBRA_LOCATION_LABEL` | No | Approved public location label only. No patient-specific context. |
| `TEBRA_PROVIDER_LABEL` | No | Approved public provider label only. No hidden identifiers or clinical data. |
| `TEBRA_ENVIRONMENT` | Every enabled scheduler or configured portal | `review` or `production`, naming the reviewed configuration set. It is operational metadata, not permission to deploy or activate production. Missing or invalid values fail closed. |

The retired private REST-base and API-key variables are not part of this integration and must not be configured. This design contains no Xenios-to-Tebra appointment-creation API call.

Example activation template using placeholders:

```dotenv
TEBRA_SCHEDULING_ENABLED=false
TEBRA_SCHEDULING_MODE=disabled
TEBRA_SCHEDULING_URL=
TEBRA_SCHEDULING_EMBED_SCRIPT_URL=
TEBRA_PATIENT_PORTAL_URL=
TEBRA_ALLOWED_ORIGINS=
TEBRA_TELEHEALTH_ENABLED=false
TEBRA_PRACTICE_NAME=
TEBRA_LOCATION_LABEL=
TEBRA_PROVIDER_LABEL=
TEBRA_ENVIRONMENT=review
```

Do not replace placeholders in a committed file. Production values belong in the approved deployment secret/configuration system even though the generated public URLs are not credentials.

## Public runtime contract

The server may expose only the validated, credential-free public configuration:

```text
schemaVersion: 1
authority: "tebra"
careAvailable: boolean
scheduling:
  status
  mode
  url?
  popupScriptUrl?
  telehealthEnabled
  practiceName?
  locationLabel?
  providerLabel?
  requestSemantics: "appointment_request_pending_confirmation"
portal:
  status
  url?
```

The public contract must never contain credentials, API keys, account identifiers, patient data, a booking callback, an appointment ID, or an asserted appointment status. A ready scheduler also requires the authoritative Care capability to be available; configured Tebra values must not turn unavailable Care into an authoritative available state.

## Narrow CSP handoff to Lead

Global CSP and application bootstrap files are Lead-owned. Lane 05 provides the narrow frame-origin and script-path source requirements; the Lead applies and verifies the protected configuration.

1. Start with empty Tebra `frame-src` and `script-src` additions while scheduling is disabled.
2. For `direct_link`, do not add a script or frame origin merely because the destination is linked.
3. For `iframe`, add only the exact origin of the validated scheduling URL to the Care-specific `frame-src`.
4. For `popup_widget`, add only the exact validated script resource path to `script-src` and only the exact scheduler/frame origin actually used by the audited widget to `frame-src`. CSP source expressions cannot constrain a URL query component, so any reviewed query stays in the runtime URL while the policy pins its scheme, host, port, and path.
5. Inspect the selected production-generated widget in production-shaped staging. If it requires additional `connect-src`, `img-src`, `style-src`, or frame origins, record each exact origin and purpose for Security and Lead approval before enforcement.
6. Never solve a widget failure with `*`, a blanket `https:`, `*.tebra.com`, `*.kareo.com`, `unsafe-eval`, or an unreviewed inline-script exception.
7. If the copied widget requires unreviewed inline code, an undocumented origin, or an unsafe CSP relaxation, keep `TEBRA_SCHEDULING_MODE=disabled` or use the validated direct-link mode.
8. Do not grant camera, microphone, geolocation, payment, clipboard, or other iframe permissions unless a separately documented Tebra requirement and Security approval exist. Scheduling itself requires none of those permissions in the reviewed sources.
9. Do not add an unvalidated cross-origin `message` listener. The reviewed Tebra documentation provides no `postMessage` contract.
10. Portal navigation remains external; it does not justify a Patient Portal `frame-src` entry.

All Care routes and public configuration responses must remain free of customer analytics and use cache/referrer controls that prevent patient- or navigation-specific leakage. Never append a Xenios customer ID, Research product or interest, patient name, date of birth, email, phone, visit reason, insurance value, portal identifier, or token to a Tebra URL.

## Lead-owned analytics boundary — release blocker

The current shared tracker blocks Research and recovery surfaces but does not yet block Care. Lane 05 does not own that protected global file. Before any Care release or browser evidence collection, Lead must import `isCarePath` from `@shared/care/paths`, include it in the tracker's full-document and SPA-transition blocking predicate, and add regression tests proving direct `/care*` loads and transitions initialize or emit no customer analytics. Care activation remains blocked until that protected patch is integrated and verified.

## Staging validation gate

Activation remains blocked until all applicable checks pass in production-shaped staging against the exact release SHA and exact candidate configuration.

### Configuration and fail-closed behavior

- [ ] Missing, malformed, non-HTTPS, credential-bearing, fragmented, wildcard, or disallowed-origin values produce an unavailable state and load no external content.
- [ ] `TEBRA_SCHEDULING_ENABLED=false` or `disabled` loads no Tebra iframe or script and does not claim scheduling availability.
- [ ] A configured scheduler remains unavailable when the authoritative Care capability is unavailable or unknown.
- [ ] Deprecated API variables do not activate anything.
- [ ] Public runtime configuration contains only the documented credential-free shape and is served with no-store behavior.

### Direct-link mode

- [ ] The link opens the exact intended Tebra practice/provider scheduling surface.
- [ ] The external navigation uses opener isolation and no-referrer behavior.
- [ ] No Xenios identity, product-interest, Care intake detail, or token is appended.
- [ ] Returning to Xenios does not create a success or confirmed state.

### Iframe mode

- [ ] The iframe loads under an exact-origin `frame-src` policy at 1440, 1024, 768, 430, 390, 375, 360, and 320 pixels and at 200% zoom.
- [ ] It has a descriptive accessible title, keyboard-reachable controls, visible focus, and a visible direct-link fallback.
- [ ] It does not receive camera, microphone, payment, or unrelated permissions.
- [ ] Load, error, or unload events do not change appointment truth.
- [ ] Third-party-cookie or framing failure degrades to the direct-link fallback without a dead end.

### Pop-up-widget mode

- [ ] The exact copied script and extracted script URL match the administrator evidence.
- [ ] The script loads directly from the approved resource path without an HTTP redirect; CSP path matching is not preserved across redirects.
- [ ] The administrator-generated snippet requires no omitted data attributes or inline bootstrap; the deferred source-only loader is proven equivalent. Otherwise this mode remains disabled.
- [ ] The script is placed in the supported body context and loads only on the intended Care scheduling experience.
- [ ] It does not execute on Research, account, admin, Hino, error, or unrelated public routes.
- [ ] Navigating away leaves no injected widget DOM, global listeners, or other runtime residue. If Tebra supplies no verified cleanup behavior, use direct-link/iframe mode or a Lead-approved full-document boundary.
- [ ] Network inspection shows only reviewed exact origins; no wildcard CSP expansion is required.
- [ ] Script failure or pop-up blocking leaves a working direct-link fallback.
- [ ] Pop-up open/close does not create a success state.

### Tebra operational truth

- [ ] Intended providers, office hours, locations, appointment increments, and notice settings appear correctly after the propagation window.
- [ ] Every displayed visit reason has been approved for public practice-wide display.
- [ ] The scheduler labels the submission as a request and staff can see it as tentative before confirmation.
- [ ] Telehealth copy remains off unless the eligible option is visible for the intended provider/location.
- [ ] Any end-to-end request/confirmation test uses an explicitly authorized non-production Tebra test practice and synthetic data. If no such environment is available, do not submit a request; record the external validation blocker.

### Patient Portal

- [ ] The portal link opens the approved Tebra-hosted login in a separate protected browsing context.
- [ ] No SSO, embedded portal, account-existence claim, invitation-status claim, or payment-availability claim is shown.
- [ ] No portal account is created and no invitation is sent during automated or visual QA.
- [ ] Support copy identifies the practice-owned route for access problems without promising that Xenios can change Tebra account data.

### Privacy, security, accessibility, and evidence

- [ ] Browser analytics, server logs, referrers, error reporting, and screenshots contain no PHI/PII, credentials, access tokens, or Research-product identity pair.
- [ ] CSP is tested in report-only mode, reviewed, then enforced with the exact approved sources.
- [ ] No unvalidated `postMessage`, callback, webhook, or appointment API behavior exists.
- [ ] Loading, unavailable, invalid-configuration, blocked-pop-up, iframe-failure, and portal-unavailable states are keyboard and screen-reader usable.
- [ ] Screenshot/evidence artifacts are sanitized and stored in the approved evidence location.
- [ ] Independent adversarial review passes the exact candidate SHA and configuration.

## Rollback

Application rollback is configuration-first and does not require a database migration:

1. Set `TEBRA_SCHEDULING_ENABLED=false` and `TEBRA_SCHEDULING_MODE=disabled`.
2. Clear `TEBRA_SCHEDULING_URL`, `TEBRA_SCHEDULING_EMBED_SCRIPT_URL`, and scheduling origins after Security confirms they are unused.
3. If portal handoff is affected, clear `TEBRA_PATIENT_PORTAL_URL`; otherwise it may remain independently available after verification.
4. Remove only the exact Tebra CSP additions that are no longer used.
5. Deploy or roll back only under Samuel-approved exact-SHA release procedure.
6. Verify that no Tebra frame/script loads, the Care page presents an honest unavailable state, unrelated routes remain unchanged, and no synthetic success state persists.

Disabling the practice scheduler or Patient Portal inside Tebra is a separate account-admin action. Tebra documents that disabling the practice scheduler makes its URL inaccessible and that it may later be re-enabled with the same URL. No automated application rollback may change those Tebra settings. An authorized Tebra administrator decides and records any such action.

## Required owner signoffs

| Owner | Required decision/evidence | Name/date/result |
| --- | --- | --- |
| Founder/release authority | Exact production SHA, production GO, selected mode, and approval of the immutable practice URL | Pending |
| Tebra System Administrator | Entitlements, scheduler state, generated URL/snippet, provider hours/locations, public visit reasons, portal activation, and payment state | Pending |
| Care/clinical owner | Provider coverage, request-confirmation workflow, telehealth attestation, escalation route, and patient-facing copy | Pending |
| Privacy/security owner | Exact origins, popup-script review, CSP/Permissions/Referrer policies, no-PHI analytics/logging, and adversarial results | Pending |
| Lead engineer | Exact env values, protected CSP/bootstrap changes, build/tests, staging evidence, rollback rehearsal, and exact release SHA | Pending |
| Billing/operations owner | Whether portal payments/statements/receipts are enabled and what the Care page may truthfully say | Pending |
| Support owner | Patient Portal access support, invitation ownership, and scheduling-request escalation workflow | Pending |
| Independent reviewer | Exact-SHA security, truthfulness, responsive, and accessibility verdict | Pending |

No production activation is ready until every applicable signoff is complete and linked to sanitized evidence.

## Official Tebra sources

Facts in this packet are grounded in the following current official documentation reviewed on 2026-08-27:

- [Scheduling Widget](https://helpme.tebra.com/Platform/Practice_Settings/Scheduling_Widget/Scheduling_Widget) — direct link, iframe source, copied body script, pop-up widget, provider eligibility, and conditional telehealth.
- [Enable or Disable Practice Online Scheduling](https://helpme.tebra.com/Platform/Practice_Settings/Calendar_Settings/Enable_or_Disable_Practice_Online_Scheduling) — practice enablement, provider hours, propagation window, immutable custom URL, and disable/re-enable behavior.
- [Configure Online Appointment Booking](https://helpme.tebra.com/Platform/Provider_Profiles/Manage_Provider_Profile/Configure_Online_Appointment_Booking) — provider-level booking, increments, notice, hours, locations, eligibility, and propagation.
- [Add or Edit Service Locations](https://helpme.tebra.com/Platform/Practice_Settings/Service_Locations/Add_or_Edit_Service_Locations) — service-location administration and scheduler visibility.
- [Enable or Disable Online Scheduling Visit Reasons](https://helpme.tebra.com/Platform/Practice_Settings/Visit_Reasons/Enable_or_Disable_Online_Scheduling_Visit_Reasons) — System Administrator control, public practice-wide visibility, terminology review, and propagation.
- [Confirm Tentative Appointments](https://helpme.tebra.com/Platform/Dashboard/Confirm_Tentative_Appointments) — request, review, confirm/decline, telehealth preference, and confirmation-email semantics.
- [New Telehealth Appointment](https://helpme.tebra.com/Telehealth/Telehealth_Visits/New_Telehealth_Appointment) — Telehealth subscription and Tebra communication/reminder prerequisites.
- [Activate Patient Portal](https://helpme.tebra.com/Platform/Practice_Settings/Misc/Activate_Patient_Portal) — one-time practice activation, terms, secure clinical/statement access, and conditional payments.
- [Navigate Patient Portal](https://helpme.tebra.com/Platform/Practice_Settings/Misc/Navigate_Patient_Portal) — portal messages, payments, statements, and administrative status.
- [Patient Experience: Patient Portal](https://helpme.tebra.com/Clinical/Patient_Management/Patient_Portal/Patient_Experience%3A_Patient_Portal) — invitation-based activation, official login, patient-facing records/documents/messages/payments, guests, and activity log.
- [Invite or Reinvite Patient to Patient Portal](https://helpme.tebra.com/Clinical/Patient_Management/Patient_Portal/Invite_or_Reinvite_Patient_to_Patient_Portal) — invitation status, unique-email requirements, and account-email administration.

The reviewed pages do not publish a stable CSP origin list, iframe sandbox recipe, Permissions Policy, booking callback, `postMessage` protocol, webhook, appointment-creation API, Patient Portal iframe, or Patient Portal SSO/deep-link contract. Those mechanisms must not be invented. Exact-origin CSP requirements must be derived from the administrator-generated production code and verified in staging.

The script-path constraint and redirect caveat follow the current [W3C Content Security Policy Level 3 source-list grammar and path-matching rules](https://www.w3.org/TR/CSP/).

## Release disposition

Tebra scheduling: **CONFIGURATION BLOCKED — SAFE DISABLED MODE REQUIRED**

Tebra Patient Portal handoff: **CONFIGURATION BLOCKED — EXTERNAL LINK ONLY AFTER APPROVAL**

Production deployment authorized: **NO**
