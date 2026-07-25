# Care foundation privacy review

Status: foundation review complete; partner/security approval still required.

## Findings

- Care is disabled by default and requires two explicit server settings to
  report enabled.
- Care roles are allowlisted. Affiliate, Mitch, fulfillment, trainer, and
  Research-admin roles receive no Care authority.
- Patient ownership is checked independently from role permission. Assigned
  clinician rules are enforced before review decisions.
- Eligibility consumes server-verified location, coverage, identity, consent,
  and service signals. Browser assertions are not authoritative.
- Intake is versioned and consent-bound, with no final medical questions.
- Prescription instructions require exact patient, prescription, pharmacy,
  formulation, concentration, and current-version binding.
- Lab sharing is consent-bound and revocable. Trainers cannot receive reports.
- Clinical messages are portal-only. Email and Telegram are notification-only.
- Request logging classifies every `/api/care` response as sensitive and omits
  its response body.
- Database message bodies are ciphertext-only. Audit records carry identifiers
  and actions, not clinical payloads.
- Every Care table enables and forces RLS; no anonymous/public policy exists.
- Research records have no foreign key or unlock path into Care.

## Required before any activation

Partner-approved intake/content, contracted medical group, state coverage,
credentialed clinicians, pharmacy integration, verified identity and consent
providers, encryption/key management, retention policy, incident response,
security review, accessibility review, clinical QA, and production RLS tests.
