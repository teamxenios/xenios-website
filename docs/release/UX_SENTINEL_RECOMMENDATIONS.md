# UX Sentinel recommendations

Improvements ranked separately from defects. None of these blocks launch by itself.

## R-001: reword care boundary copy that names the hidden Research program (P3)

- User and role: any visitor who reaches a /care route directly.
- Current behavior: care pages name "Research" as an access program in boundary disclaimers.
  Verified locations at 517c219: care/section.tsx:118 ("Research does not unlock Care."),
  CareAppointmentsPage.tsx:65 and :165, CareConsentPendingPage.tsx:68,
  EligibilityPendingPage.tsx:143. These are plain text, no hyperlink, and /care is
  noindex/nofollow (carePageGate), so they do not violate the no-hyperlinks directive.
- Friction: the copy tells a reader that a program called Research exists, which soft-leaks the
  hidden area's existence to anyone who finds /care.
- Proposed behavior: reword to generic phrasing ("membership does not unlock Care", "Care is a
  separate program") during workstream 6's Care build.
- Effort: five one-line copy edits. Risk: none. Owner: workstream 6. Blocks launch: no.

## R-002: give partners their own credentialed identity (design decision, workstream 3)

- Current behavior (verified at 517c219): partners have no dedicated login anywhere. The
  "Partner sign-in" button on the gate-locked partners landing (partners/Landing.tsx:58-60)
  navigates to the dashboard, and every partner page authenticates with the MEMBER session
  token (partners/Dashboard.tsx:59-63; adapters/partner.ts uses the member bearer).
- Friction: the founder-required "Partner / Affiliate Login" entry on /research has no real
  destination distinct from member sign-in, and partner-only authorization boundaries are
  harder to audit when partners ride member identity.
- Proposed behavior: workstream 3 decides between a dedicated partner credential or an explicit
  role-scoped member session with its own sign-in surface; then SEN-0008 can link a true
  Partner/Affiliate entry.
- Effort: structural (auth). Risk: medium (touches authorization). Blocks launch: it gates the
  four-entries directive only for the partner entry.

## R-003: expose the deployed git SHA in /api/health (P3, reliability)

- Current behavior: health reports uptime and config booleans but no build identity, so
  production-vs-main verification relies on Render evidence.
- Proposed behavior: include the git SHA (already standard in the repo's release tooling) in the
  health payload so any session can bind production evidence to a commit.
- Effort: small. Risk: none (a public SHA is not a secret once deploys are public). Owner:
  workstream 7. Blocks launch: no.
