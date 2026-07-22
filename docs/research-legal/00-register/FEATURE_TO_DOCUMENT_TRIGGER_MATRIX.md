# Feature to Document Trigger Matrix

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-REG-004 |
| Title | Feature to Document Trigger Matrix |
| Audience | internal |
| Required member state | n/a (internal) |
| Trigger | updated when a product feature or document trigger changes |
| Route | internal |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | Permanent while the program operates; superseded versions archived per Document Control SOP (XR-REG-008) |
| Acceptance event | n/a (internal control document) |
| Withdrawal supported | No (internal control document) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-REG-002 |
| Sources | See 00-register/SOURCE_REGISTRY.md |
| Review date | 2026-07-19 |

## Purpose and use

This matrix maps every product feature and lifecycle moment in Xenios Research to the documents
that moment must surface. Engineers wire the agreements UI, the consent registry, and the
server-side acceptance log against this file. Each moment lists three things:

1. **Must accept** or **Must present**: documents that block the moment until they are shown
   (present) or affirmatively accepted (accept). "Accept" means a recorded acceptance event.
   "Present" means the document is displayed or linked and its version is logged, with no
   checkbox.
2. **Applies**: documents already in force, linked, or governing the moment without a new
   acceptance, including internal SOPs that run behind the scenes.
3. **Recorded**: the acceptance or audit events the system writes server-side at that moment.

Every entry is derived from the machine-readable register (XR-REG-002,
`document-register.json`). The register is authoritative. If this matrix and the register
disagree, the register wins and this file must be corrected. Keys resolve to titles and paths
through XR-REG-001 and XR-REG-002.

## The activation ordering rule (hard constraint)

The canonical activation order is: approval, then identity and age verification, then
agreements, then the $50 activation payment, then the $25 recurring authorization, then
password creation, then mandatory MFA enrollment, then active membership.

Engineering must enforce, in code, that:

1. Agreements always precede the $50 activation charge. No payment control is reachable until
   every document in the agreements step (section 2.2 below) has a recorded acceptance.
2. XR-PUB-007 (Electronic Communications Consent) is the first screen of the agreements step
   and is accepted before any other agreement is presented electronically.
3. XR-MEM-002 ($50 Activation Terms) is the last acceptance before the activation checkout.
4. XR-MEM-003 ($25 Recurring Membership Authorization) is a separate affirmative checkbox,
   distinct from every other agreement, captured after the $50 payment and before password and
   MFA setup. It is never bundled into the agreements-step acceptance.
5. Per-SKU product acknowledgments (XR-COM-014, XR-COM-015, XR-COM-016 instantiations) and
   XR-COM-018 are accepted before payment at the checkout that first contains the triggering
   item.
6. Unbundled consents stay unbundled: XR-MEM-003, XR-COM-002 (per product subscription), and
   XR-TRK-003 each require their own separate checkbox and their own acceptance record.

## Matrix

### 1. Public entrance and application

#### 1.1 First visit to /research

- Must present: XR-PUB-001 (entrance screen terms), XR-PUB-005 (cookie and tracking notice,
  before any non-essential cookie is set), XR-PUB-002 (linked at the entrance and site-wide
  footer), XR-PUB-004 (Privacy link).
- Applies: XR-PUB-006 (footer link), XR-PUB-013 (Support link from the entrance).
- Recorded: XR-PUB-001 acceptance (entering the entrance password and continuing, logged with
  timestamp and document version; [COUNSEL: whether an explicit checkbox is required at the
  entrance]); non-essential cookie preference selections with timestamp and notice version.
  The shared entrance password unlocks only the entrance and application layer, nothing
  member-facing.

#### 1.2 Application submission (/research/apply)

- Must accept: XR-PUB-008 (age 21+ attestation), XR-PUB-009 (application accuracy
  certification), XR-PUB-010 (application status terms), XR-PUB-002 (website terms, applicant
  acceptance).
- Must present: XR-PUB-003 (applicant privacy notice, with the form; notice only).
- Optional at this moment, never required: XR-PUB-011 (marketing email consent,
  unchecked-by-default checkbox), XR-PUB-012 (SMS opt-in, unchecked-by-default checkbox).
- Applies: XR-PUB-001, XR-PUB-004, XR-PUB-005, XR-PUB-013.
- Recorded: one checkbox event per accepted document (timestamp + document version + applicant
  reference); XR-PUB-008 additionally written as an age_attestation event in the consent
  registry; optional consents recorded only if affirmatively checked.

#### 1.3 Approval notice (email)

- Must accept: none. No register document is accepted by email, and the approval email must
  not embed any agreement. The email states the approval and links into the activation flow.
- Applies: XR-PUB-010 (governs the period between submission and activation or denial);
  XR-POL-003 (internal, the verification SOP begins for every approved applicant).
- Recorded: application status transition (approved) with timestamp; email dispatch logged.
  The first document of the post-approval flow is XR-MEM-011 at the verification step (1.4).

### 2. Activation

#### 2.1 Identity and age verification

- Must accept: XR-MEM-011 (identity and age verification consent), captured before hand-off to
  the verification provider.
- Applies: XR-POL-003 (internal SOP runs the step), XR-POL-004 (data classification of
  verification data), XR-PUB-004.
- Recorded: XR-MEM-011 checkbox (timestamp + document version + applicant reference) before
  provider hand-off; verification outcome recorded without retaining raw government ID images
  unless counsel and the identity design require it.

#### 2.2 Agreements step (after verification, before payment)

- Must accept, in this order: XR-PUB-007 first (electronic communications consent, before any
  other agreement is presented electronically), then the agreements bundle, each with its own
  checkbox: XR-MEM-001, XR-MEM-005, XR-MEM-006, XR-MEM-007, XR-MEM-008, XR-MEM-009,
  XR-MEM-004 (immediate cancellation and access-termination acknowledgment), XR-MEM-013,
  XR-MEM-017, XR-MEM-018, XR-MEM-021, XR-MEM-022, XR-PUB-002 (re-accepted at this step), and
  XR-MEM-002 last, immediately before the activation checkout.
- Must present: XR-MEM-010 (summarized; the summary is accepted as part of the bundle, the
  full policy is a notice at first catalog entry), XR-PUB-004 (linked).
- Applies: XR-PUB-005, XR-PUB-013.
- Recorded: one acceptance event per document (checkbox + timestamp + document version +
  member reference), with XR-PUB-007 timestamped before all others and XR-MEM-002 timestamped
  last. No payment control is enabled until every acceptance in this step exists.

#### 2.3 $50 activation payment and $25 recurring authorization

- Precondition: every acceptance in 2.2 recorded. The $50 charge runs only after the
  agreements step is complete.
- Must accept, immediately after the $50 payment succeeds: XR-MEM-003 (the $25 recurring
  membership authorization), as a separate affirmative checkbox distinct from every other
  agreement, before password creation and MFA setup.
- Applies: XR-MEM-001, XR-MEM-002 (both just accepted, now in force), XR-MEM-004.
- Recorded: the activation charge (transaction record); the XR-MEM-003 authorization event
  (separate checkbox + timestamp + document version + member reference). Both prices are
  launch prices, admin-configurable, changed prospectively with notice.

#### 2.4 MFA enrollment (after password, before active)

- Must present: the recovery-code custody duties from XR-MEM-022, re-displayed on the MFA
  enrollment screen (acceptance already recorded at 2.2; this is a re-display, not a new
  acceptance).
- Applies: XR-POL-002 (internal; MFA is mandatory for every member, recovery codes issued at
  enrollment, passkeys may be offered), XR-POL-001.
- Recorded: MFA enrollment event (timestamp + method); recovery code issuance event. Only
  after MFA completes does the account become active.

### 3. Assessment and plans

#### 3.1 Mandatory assessment (within 3 days of activation)

- Must accept, before the assessment begins: XR-MEM-012 (sensitive health data consent,
  assessment category), XR-MEM-014 (Whole-Life Blueprint Terms, before submission and before
  any Blueprint is displayed).
- Applies: XR-MEM-009, XR-MEM-013 (both linked), XR-POL-004.
- Recorded: XR-MEM-012 consent event (assessment category) in the consent registry;
  XR-MEM-014 checkbox; assessment submission with timestamp. The tracker stays locked until
  the assessment is complete.

#### 3.2 First plan delivery (Xenios 30 and Xenios 90)

- Must accept, before the first plan is displayed: XR-MEM-015 (at first Xenios 30
  publication), XR-MEM-016 (at first Xenios 90 publication). XR-MEM-017 and XR-MEM-018 are
  re-presented here only if not already accepted at 2.2; no fitness or nutrition plan is
  delivered without them in force.
- Applies: XR-MEM-009, XR-MEM-013 (linked from every published plan), XR-MEM-021 (governs
  delivery).
- Recorded: acceptance events for XR-MEM-015 and XR-MEM-016; plan publication events. Samuel
  personally reviews every initial and monthly plan during the founding phase (48 elapsed
  hours including weekends).

#### 3.3 Review Week and plan changes

- Must accept: XR-MEM-019 (before the member's first Review Week is scheduled), XR-MEM-020
  (at first use of the plan-change request flow).
- Applies: XR-MEM-015, XR-MEM-016.
- Recorded: acceptance events at first trigger; each published monthly document carries its
  own acknowledgment record; each plan-change request logged (one free early plan-change
  request per month).

#### 3.4 First question and Guide Library

- Must accept: XR-MEM-024 (before the first question is submitted, on any channel, member
  site or Telegram), XR-MEM-025 (at first visit to the Guide Library).
- Applies: XR-PUB-013 (support and emergency boundary), XR-MEM-009.
- Recorded: acceptance events at first trigger; question intake logged with timestamp.

### 4. Tracker and health data

#### 4.1 Tracker unlock (only after the mandatory assessment)

- Must accept: XR-TRK-013 (non-diagnostic and emergency notice, checkbox at unlock).
- Must present: XR-TRK-001 (tracker privacy notice, with a persistent link inside every
  tracker screen), XR-TRK-002 (presented at unlock; its acceptance is captured at or before
  the first manual log).
- Applies: XR-MEM-012, XR-TRK-008 (linked in tracker settings), XR-POL-033 (internal).
- Recorded: XR-TRK-013 checkbox; XR-TRK-001 presentation log (timestamp + document version).
  The unlock event itself is logged. The tracker must be unreachable before assessment
  completion.

#### 4.2 First tracker media upload (photo, voice, video)

- Must accept, per media type, before the first upload of that type is stored: XR-TRK-004
  (first progress photo), XR-TRK-005 (first voice note), XR-TRK-006 (first exercise video).
  On the first media upload of any kind, also: XR-TRK-009 (raw media retention and deletion
  election) and the tracker-media category of XR-MEM-012 (re-presented before first media
  upload). XR-TRK-007 (face blur consent) at first use of the face blur option. XR-TRK-003
  (sexual-wellness consent) only if the member enables that logging, always as its own
  unbundled checkbox.
- Must present: XR-TRK-008 (linked from the exercise video flow; the future pose capability
  requires its own separate opt-in later).
- Applies: XR-TRK-001, XR-POL-033 (private storage, signed URLs, malware scanning, access
  audit; face blur is image processing, not facial recognition; no biometric templates).
- Recorded: one consent event per consent, written to the consent registry, never combined;
  the XR-TRK-009 election (delete-after-processing or retain) and every later change; each
  upload logged with timestamp and member reference.

#### 4.3 Wearable connection (future feature, disabled at launch)

- Must accept: XR-TRK-010, one consent per connection (scope selection + checkbox), in
  addition to the platform's own permission screen.
- Applies: XR-TRK-001; XR-POL-008 (internal, re-run before any health-data feature launch);
  XR-POL-010 (vendor review of the platform integration).
- Recorded: a per-connection consent event in the consent registry (scope + timestamp +
  document version + member reference); disconnection recorded as a new event.

#### 4.4 Professional sharing (future feature, disabled at launch)

- Must accept: XR-TRK-011, one authorization per named professional (professional + scope +
  duration + checkbox).
- Applies: XR-TRK-012 (revocation path, also available post-cancellation); XR-POL-009
  (internal, re-run before any professional-sharing integration); XR-POL-006.
- Recorded: the authorization event in the consent registry; each revocation under XR-TRK-012
  recorded with confirmation and written confirmation to the member.

### 5. Commerce

#### 5.1 Catalog browse (first entry into the member catalog)

- Must present: XR-MEM-010 (full product access policy at first catalog entry), XR-COM-013
  (in the catalog and linked from every product page), XR-COM-017 (wherever a COA or quality
  document is shown).
- Applies: XR-COM-019, XR-MEM-009 (linked from product pages); XR-POL-016 (internal, no
  product is visible until it passes the publishing gate).
- Recorded: presentation logging only; no acceptance (the XR-MEM-010 summary was accepted in
  the 2.2 bundle).

#### 5.2 Checkout (first product checkout, and every checkout after)

- Must accept, before payment: XR-COM-001 (first checkout only; re-acceptance on material
  change), XR-COM-018 (first checkout containing any physical product), and the instantiated
  per-SKU acknowledgments at the first checkout containing that SKU: XR-COM-015 (first
  supplement), XR-COM-016 instantiations (each research-product SKU), XR-COM-014
  instantiations (each SKU with a product-specific acknowledgment). All of these precede the
  charge.
- Must present (notice, version logged with each order): XR-COM-004, XR-COM-007; XR-COM-005
  when the order will or may split; XR-COM-006 when an expedited, same-day, or
  temperature-controlled service is selected.
- Conditional: XR-COM-010 and XR-COM-011 when a large-order trigger fires (see 5.5).
- Applies: XR-COM-008, XR-COM-009, XR-COM-013, XR-COM-017, XR-COM-019, XR-MEM-010.
- Recorded: acceptance events for XR-COM-001, XR-COM-018, and each per-SKU acknowledgment
  (checkbox + timestamp + document version + SKU + member reference); the displayed versions
  of XR-COM-004/005/006/007 stored with the order; the order and transaction records.

#### 5.3 Subscription creation (per-product subscription enrollment)

- Must accept: XR-COM-002, as a separate, unbundled checkbox per product subscription, with
  the exact disclosures displayed captured in the record.
- Must present: XR-COM-003 (linked from every enrollment screen; incorporated by reference
  into the XR-COM-002 record).
- Applies: XR-COM-001; XR-COM-004 through XR-COM-009 for each shipment; XR-COM-018.
- Recorded: the enrollment record (separate checkbox + timestamp + document version + exact
  disclosures displayed + member reference); each subsequent charge recorded against that
  authorization. Candidate frequencies are 30, 60, and 90 days; discounts are
  admin-configurable.

#### 5.4 Subscription change (pause, skip, reschedule, quantity, frequency, payment method, cancel)

- Must present: XR-COM-003 (the management page terms).
- Applies: XR-COM-002 (the authorization on file). Cancellation of a product subscription
  must be at least as easy as enrollment and is always available self-service.
- Recorded: every control action logged with timestamp; a completed cancellation ends future
  charges and is followed only by a fresh enrollment, never a reactivation of the old record.

#### 5.5 Large or unusual order (over $1,000, quantity inconsistent with ordinary individual use, or risk rules)

- Must present: XR-COM-010 (at checkout when a trigger fires; incorporated into the
  XR-COM-001 acceptance record).
- Must accept: XR-COM-011 (delayed capture consent), whenever the order will be held for
  review and delayed capture applies (recommended flow: authorize, Samuel reviews within
  approximately 2 hours, capture after approval; processor support to be confirmed).
- Applies: XR-POL-027, XR-POL-028 (internal).
- Recorded: the XR-COM-011 checkbox (timestamp + document version + order reference + member
  reference); authorization, review decision, reviewer identity, capture or void events.

#### 5.6 Waitlist join

- Must accept: XR-COM-012 (the join action is the acceptance).
- Applies: XR-COM-013. The member sees anonymous position or status only, never a promised
  restock date.
- Recorded: join action + notification preference + timestamp + document version + member
  reference; leaving the list recorded and notifications stopped.

### 6. Safety and product events

#### 6.1 Recall event

- Must accept: none at the moment of recall. XR-COM-018 was accepted at the first product
  checkout and its obligations survive cancellation for products already purchased.
- Applies: XR-COM-018 (governs member notification and response duties); XR-POL-024 (internal,
  invoked), XR-POL-036 (a recall is a legal hold trigger), XR-FUL-008 (partner traceability
  duties), XR-POL-025 (preparedness).
- Recorded: recall notice dispatch and delivery evidence per member; member responses;
  lot-level traceability records; the hold record under XR-POL-036.

#### 6.2 Adverse event report

- Must present: XR-COM-019 (surfaced in any support flow that mentions a product problem;
  available to former members for products already purchased).
- Applies: XR-POL-021 (triage), XR-POL-022, XR-POL-023 (internal; a serious event also
  triggers XR-POL-036), XR-PUB-013 (emergencies go to emergency services, 911 in the US).
- Recorded: each report logged server-side with timestamp and member reference; triage
  outcome; no acceptance is collected from the member.

### 7. Membership lifecycle end

#### 7.1 Cancellation flow (self-service)

- Must accept, before confirmation: XR-MEM-004, re-presented in full as the pre-confirmation
  disclosure and re-accepted at each cancellation confirmation. Before the member confirms,
  the flow must clearly disclose: access ends immediately, remaining paid time is forfeited
  (no prorated refund unless applicable law requires one), product subscriptions are handled
  according to their own state, and the member should download desired plans and data first.
- Must present: XR-MEM-027 (shown in the cancellation flow).
- Applies: XR-MEM-001, XR-COM-003 (product subscriptions keep their own state), XR-MEM-006
  and XR-COM-018 (obligations that survive), XR-POL-005 (cancellation does not erase
  transaction, payment, agreement, safety, security, or audit records).
- Recorded: the XR-MEM-004 re-acceptance at confirmation (checkbox + timestamp + document
  version + member reference); the cancellation event; immediate access termination.

#### 7.2 Post-cancellation receipt and privacy access (limited non-member workflow)

- Must accept: none. Identity of the requester is verified per XR-POL-006 before anything is
  released.
- Applies: XR-MEM-027 (rights survive cancellation; former members reach the workflow by
  email to research@xeniostechnology.com), XR-PUB-004, XR-POL-005, XR-POL-006 (internal),
  XR-TRK-012 (sharing revocation remains available).
- Recorded: each request, its verification, and its outcome, server-side.

#### 7.3 Privacy rights request (any stage)

- Must present: XR-MEM-027 (first visit to the privacy area; also linked from the Privacy
  Notice).
- Applies: XR-PUB-003 (applicants), XR-PUB-004, XR-POL-005, XR-POL-006 (internal, runs on
  receipt through any channel).
- Recorded: request intake, verification, decision, and fulfillment events; no acceptance.

### 8. Growth and partners

#### 8.1 Member referral

- Must accept: XR-MEM-026 (at first visit to the referrals area, before any referral code or
  link is issued).
- Applies: XR-AFF-001 (the program-level terms XR-MEM-026 references), XR-POL-028 (fraud
  monitoring). No applicant information is exposed to the referrer.
- Recorded: the XR-MEM-026 acceptance before first code issuance; referral attribution;
  store-credit ledger events ($15 to the existing member, $10 to the new member, after a
  14-day hold; store credit only, never cash).

#### 8.2 Affiliate signup

- Must accept (signature): XR-AFF-002, executed before any link is issued or any promotion
  begins, with the completed XR-AFF-007 schedule attached at signature; XR-AFF-011 before any
  lead activity; XR-AFF-012 whenever the affiliate will handle personal data for Xenios;
  XR-AFF-016 satisfied before the first payout.
- Must accept (certification checkboxes): XR-AFF-008, XR-AFF-009, XR-AFF-010, XR-AFF-013,
  XR-AFF-014, XR-AFF-015, each acknowledged at onboarding and certification, before the first
  promotional activity.
- Applies: XR-POL-029 (internal monitoring), XR-POL-028. Peptide and Quantum commissions are
  disabled until their lanes are approved; membership commissions require separate approval.
- Recorded: executed signatures with document versions; per-policy certification checkboxes
  (timestamp + document version + partner reference); tax form receipt logged separately.

#### 8.3 Research Rep certification

- Must accept (signature): XR-AFF-003, executed before training begins. No program activity is
  permitted until certification is complete.
- Must accept (certification checkboxes): XR-AFF-004 (acknowledged during certification and
  re-acknowledged at each recertification), plus XR-AFF-008, XR-AFF-009, XR-AFF-010,
  XR-AFF-013, XR-AFF-014, XR-AFF-015. XR-AFF-011, XR-AFF-012, and XR-AFF-016 as in 8.2.
- Applies: XR-POL-030 (internal, governs training, certification, recertification, and
  retraining).
- Recorded: the signed agreement; module completions and assessment results per rep with
  timestamp and content version; certification completion recorded separately from the
  signature.

#### 8.4 Organization partner onboarding

- Must accept (signature): XR-AFF-005, executed with the negotiated economics schedule
  (XR-AFF-007) attached and versioned, before any link, campaign, cohort, event, or rep
  activity under the organization; XR-AFF-006 for a private community (with, or as a variant
  of, XR-AFF-005); XR-AFF-011, XR-AFF-012, and XR-AFF-016 as applicable.
- Must accept (certification checkboxes): XR-AFF-008, XR-AFF-009, XR-AFF-010, XR-AFF-013,
  XR-AFF-014, XR-AFF-015 for the organization's participating people.
- Applies: XR-POL-029, XR-POL-028 (internal). Anti-MLM hard rules govern every economics
  schedule: no pay merely for recruiting, no unlimited downlines, no forced inventory
  purchases, rank never primarily recruitment-based.
- Recorded: authorized-signer signature and Xenios countersignature with the versioned
  schedule; per-event approvals under XR-AFF-013 recorded separately.

#### 8.5 Fulfillment partner (Mitch) onboarding

- Must accept (signature), in dependency order, all before the first fulfillment order:
  1. XR-FUL-001 (master agreement), with XR-FUL-009 and XR-FUL-010 executed alongside it
     before Mitch receives any member data, product master data, or confidential information.
  2. XR-FUL-004 before Mitch receives or holds any Xenios inventory; XR-FUL-008 duties apply
     from the first unit received.
  3. XR-FUL-002, XR-FUL-003 (with all [CONFIG] times filled), XR-FUL-005, XR-FUL-006,
     XR-FUL-012, XR-FUL-013, and XR-FUL-014 before the first fulfillment order.
  4. XR-FUL-007 before any temperature-sensitive SKU ships and before any
     temperature-controlled service is offered to members.
  5. XR-FUL-011 certificates of insurance delivered and verified before launch.
- Must accept (signed attestation): XR-FUL-015, returned before Mitch receives member
  shipping data or systems access.
- Applies: XR-POL-010 (internal vendor risk), XR-POL-018, XR-POL-019, XR-POL-020 (operational
  SOPs the schedules reference). Split fulfillment: for approximately the first 60 days Mitch
  holds and fulfills peptide and Quantum inventory, Xenios fulfills supplements; one member
  order may become multiple fulfillment orders while the member sees one order history.
- Recorded: executed signatures by authorized representatives of each party, copies retained
  by both; the signed security questionnaire and evidence in the vendor file; insurance
  verification.

### 9. Quantum

#### 9.1 Quantum interest (Coming Soon only)

- Must present: XR-QTM-001 (at first visit to the Quantum product page; notice only).
- Must accept: XR-QTM-002 (checkbox on joining the interest list).
- Applies: XR-QTM-008 (internal; the activation checklist is the gate, and no Quantum
  commerce, checkout, or sales agreement exists until it passes), XR-QTM-003 through
  XR-QTM-007 (internal and counsel working documents; XR-QTM-006 is never surfaced to a
  member).
- Recorded: the XR-QTM-002 checkbox (timestamp + document version + member reference).
  Engineering must hard-block any cart, checkout, or payment path for Quantum SKUs.

### 10. Communications preferences

#### 10.1 Marketing email opt-in

- Must accept: XR-PUB-011, always an unchecked-by-default checkbox, offered at application and
  again in the member account, never required for membership.
- Applies: XR-PUB-004.
- Recorded: the opt-in event (timestamp + document version + subject reference); withdrawal
  recorded the same way as a new event, never an edit to the original.

#### 10.2 SMS and Telegram opt-in

- Must accept: XR-PUB-012 for SMS (unchecked-by-default checkbox at application or in the
  member account) and for Telegram linking (member-initiated one-time code redeemed in the
  member account); XR-MEM-023 at first Telegram linking (checkbox; the link completes only
  with the one-time code, and the bot re-sends a summary as its first message); XR-MEM-024
  before the first question on any channel, including Telegram (see 3.4).
- Must present: XR-PUB-013 (linked at Telegram connection).
- Applies: XR-POL-031 (internal). Telegram is never the system of record: no passwords, reset
  tokens, ID documents, plan PDFs, raw health media, or payment data over Telegram. Normal
  response target is approximately 12 hours; emergency language routes to emergency services.
- Recorded: SMS opt-in checkbox event; Telegram linking (one-time code redemption with
  timestamp and account reference); XR-MEM-023 acceptance at linking; revocations recorded as
  new events.

## Engineering hard rules distilled from this matrix

1. Agreements before money, always: the 2.2 acceptance set gates the $50 charge; the per-SKU
   acknowledgment set gates every product charge; XR-COM-011 gates any delayed-capture hold.
2. XR-PUB-007 first, XR-MEM-002 last within the agreements step; XR-MEM-003 alone after the
   charge and before password and MFA.
3. One checkbox, one document, one record. Never bundle XR-MEM-003, XR-COM-002, or XR-TRK-003
   with anything else.
4. Every acceptance record carries: document key, document version, timestamp, and the
   applicant, member, partner, or order reference the register row specifies. Notice-only
   documents log the displayed version at the moment of display.
5. State gates are server-enforced: tracker locked until the assessment completes; catalog and
   commerce reachable only by active members; Quantum has no commerce path; wearables and
   professional sharing are disabled at launch behind XR-TRK-010 and XR-TRK-011.
6. Withdrawal and revocation are recorded as new events, never edits, and consent revocation
   (media, sexual wellness, wearables, sharing, marketing, SMS) must be as easy as the grant.

## Open items for counsel

- XR-PUB-001: confirm whether the entrance requires an explicit checkbox or whether
  password-entry-plus-continue is a sufficient acceptance record (flagged in the register).
- Confirm the exact composition and display order of the agreements-step bundle in 2.2, and
  whether each document requires its own checkbox or a grouped acceptance is permissible for
  any subset (this draft assumes one checkbox per document).
- Confirm that capturing XR-MEM-003 after the $50 charge and before MFA satisfies federal and
  state negative-option and preauthorization requirements in every state.
- Confirm whether any state requires affirmative acceptance (not notice plus logged version)
  for XR-COM-004, XR-COM-005, XR-COM-006, or XR-COM-007 at checkout.
- XR-COM-011: confirm processor support for authorize-then-capture on large-order review, and
  the maximum lawful authorization hold period.
- XR-TRK-007: confirm whether face blur consent may remain triggered at first use or should be
  presented together with XR-TRK-004 at the first photo upload.
- Confirm re-acceptance requirements on material version change for each accepted document
  (several register rows call for re-presentation; this matrix inherits them).
- Reconcile this matrix with the earlier drafts in the same worktree, in particular
  docs/compliance/CONSENT_REGISTRY.md, docs/security/IDENTITY_PROOFING_STANDARD.md, and
  docs/privacy/RETENTION_POLICY.md; counsel to decide which controls supersede.
- Confirm the retention floor for acceptance and audit records referenced throughout
  ([COUNSEL: confirm period] in XR-POL-005).
- Confirm whether the approval email may contain any summary of upcoming agreements, or must
  remain a bare status notice with a link (this draft assumes the latter).

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
