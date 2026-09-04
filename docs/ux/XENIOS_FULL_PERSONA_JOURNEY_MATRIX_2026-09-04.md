# Xenios full persona journey matrix

Audit date: 2026-09-04. Covers all 15 requested personas. This is a source-grounded baseline and implementation checklist, not a claim that every journey is live or complete. The companion JSON is the field-complete structured version.

## Evidence and scope

Current route registrations, guards and relevant components were inspected. The saved UX digest was used only as a lead: its old line numbers and several conclusions did not match current code. No customer examples, patient data, credentials, deployment identifiers or production account identifiers are included.

- **Local present:** route/module exists in the inspected source; no success or activation implied.
- **Reported live:** dated release records report a deployment; this matrix did not repeat a live authenticated journey.
- **Dark/gated:** deliberately unavailable unless its server authority and capability permit it.
- **Parked:** component or named route exists but is not mounted in the current client route manifest.
- **In progress:** the auth/account continuation is underway; its exact-SHA handoff must supply final tests and deployment status.

The global mobile proof target is 1440, 1366, 1024, 768, 430, 390, 375, 360 and 320px, with keyboard focus, 44px actions, 16px input text and no overflow. This worker did not run browser journeys or the listed product tests. Existing test filenames below are proof targets, not passing-result claims.

## Top five friction points

| ID | Priority | Finding | Disposition |
| --- | --- | --- | --- |
| F1 | P0 | Authentication loses the intended destination: Baseline reset/claim and narrow return allowlist | Auth/account continuation in progress; require exact tests before claiming fixed |
| F2 | P1 | Account overview lacks actionable request states: Baseline nextAdministrativeAction and generic support action | Account continuation in progress; a destination must be usable under the real identity boundary |
| F3 | P0 | Referral recommendations do not form a safe complete journey: Public capture unmounted; helper/descriptor mismatch; remaining revocation/binding/expiry controls | Preserve deliberate denial; finish canonical Gen 2 V1 in its own owned slice |
| F4 | P1 | Post-submission recovery and Care continuation are weak: Tab-scoped Research status credential; sparse error recovery; Care request receipt is not account history | Add honest recovery/help paths after proving ownership; never fabricate a Care account timeline |
| F5 | P0 | Organization-only identities cannot complete their intended workspace entry: Parked org client routes and member-only Research account gate; password evidence unavailable | Separate canonical account-context/invitation slice; not solved by making every invite a recovery session |

## Corrections to the saved digest

- The saved digest claimed no main-site Health link. Current client/src/lib/nav.ts already defines Health /health in both navigation collections; do not add a duplicate.
- Saved digest line numbers came from another worktree and are not citations for this baseline. Paths and current code were rechecked.
- Do not copy the digest's suggested localStorage status-token recovery. A status token is a credential; require a designed ownership/recovery flow.
- The existing overview already refuses a green all-clear when history/Care sources are incomplete. Its gap is missing request-specific next actions, not a blanket false up-to-date message.
- The account-identity server mount exists even though organization client routes are parked. Do not describe the entire account system as absent.

## Persona journeys

### 1. Anonymous first-time visitor

| Field | Baseline and target |
| --- | --- |
| Entry routes | /; /health; /research |
| Top jobs / primary questions | Choose Research or Care; Understand eligibility and how to get help / Which path is for me?; Do I need an account? |
| Trust concerns | Research is not treatment; A visible product is not permission to purchase |
| Required / never-visible information | No personal information to browse public orientation / NEVER: Private account records; Patient data; Supplier cost and margin |
| Authentication / authority | Anonymous for public orientation / Public route allowlist; protected APIs enforce their own guards |
| Navigation / primary / secondary action | Health; Care; Research access; How it works; Support / PRIMARY: Choose the appropriate Research or Care path / SECONDARY: Read how it works |
| Completion / status and history | Visitor reaches the appropriate access route with its boundary explained / No account or application should be implied by browsing |
| Support / referral | /research/support or /care/support according to the chosen path / May arrive with a referral parameter; verified attribution is not currently promised |
| Current route / API / component | /health; /research; /care / No additional mounted API asserted / Gateway; CareHomePage |
| Defects | The same gateway component serves /health and /research with Care-first hero copy; journey-specific emphasis still needs review |
| Recommended change | Keep the existing Health navigation; distinguish umbrella orientation from the Research-specific entry. |
| Mobile risk | Recheck keyboard focus, 44px actions, 16px form text, long labels and no overflow at 1440, 1366, 1024, 768, 430, 390, 375, 360 and 320px. |
| Test proof | Source inspected; product tests NOT RUN by this worker. Existing targets: client/src/App.routes.test.ts; client/src/research/routes-parity.test.ts. Required: Navigate from the actual header and footer to both paths; verify role-safe content and responsive orientation. |
| Owner / status | Unassigned public-navigation slice / LOCAL_PUBLIC_ROUTES_PRESENT; journey QA pending |
| Source groups | routes; public; carePublic |

### 2. Referral recipient

| Field | Baseline and target |
| --- | --- |
| Entry routes | /research?ref=:code; /r/:code (unmounted capture descriptor; not a usable route) |
| Top jobs / primary questions | Understand the recommended destination; Continue without losing intent; Know whether a referral is valid / What was shared?; Does it affect eligibility, price or care? |
| Trust concerns | No forged endorsement; No recipient data shared with a referrer |
| Required / never-visible information | Only the proposed code and an allowlisted destination before authentication / NEVER: Referrer internal identifier; Other recipients; Clinical information; Private economics |
| Authentication / authority | Anonymous landing; own canonical sign-in if the destination requires it / Planned extension of Gen 2 partner authority; current public capture intentionally unmounted |
| Navigation / primary / secondary action | Destination overview; Relevant Research or Care path; Support / PRIMARY: Continue to the legitimate destination without implying attribution / SECONDARY: Dismiss optional referral context |
| Completion / status and history | Valid link is server-verified or explicitly rejected; ordinary browsing still works / Persist only verified first-valid attribution; no false credit or conversion |
| Support / referral | /research/support / NOT OPEN as a verified capture journey; descriptor exists but is not mounted |
| Current route / API / component | /research / /api/research/referral/capture (descriptor only; unmounted) / captureReferralFromLocation |
| Defects | Public capture is deliberately unmounted for unresolved security contracts; Client helper names /api/referral/capture, different from the descriptor |
| Recommended change | Finish store-backed revocation/expiry, canonical destination, replay/throttle and binding controls on Gen 2 before mounting or advertising capture. |
| Mobile risk | Recheck keyboard focus, 44px actions, 16px form text, long labels and no overflow at 1440, 1366, 1024, 768, 430, 390, 375, 360 and 320px. |
| Test proof | Source inspected; product tests NOT RUN by this worker. Existing targets: server/research/partners/referral-capture-routes.test.ts. Required: Composed recipient landing, login return, revoked/expired/tampered link, cross-partner denial and no clinical leakage. |
| Owner / status | Unassigned referral V1 slice; release owner owns mount / DARK_UNMOUNTED; not fixed in the auth/account slice |
| Source groups | routes; referral |

### 3. Research prospect

| Field | Baseline and target |
| --- | --- |
| Entry routes | /research/access-hub; /research/apply; /research/early-access |
| Top jobs / primary questions | Understand Research eligibility; Request legitimate access; Choose a supported alternative when applications are closed / Are applications open?; What was saved?; How do I get assistance? |
| Trust concerns | No fake application submission; Current legal documents govern acceptance |
| Required / never-visible information | None on the pending application page; access credentials only in the dedicated Early Access gate / NEVER: Other applications; Review notes; Patient information; Access secrets in public content |
| Authentication / authority | Public explanation; separate Early Access or member authorization / Apply page is intentionally read-only; server legal/application boundary remains authoritative |
| Navigation / primary / secondary action | Access hub; Applications; Early Access; Support; Terms status / PRIMARY: Use the available access path or contact support / SECONDARY: Review application-document status |
| Completion / status and history | Clear pending state, or the separately authorized Early Access journey; no invented application receipt / Future application status must be linked to a durable submission and verified identity |
| Support / referral | /research/support / Do not treat a supplied code as approval or entitlement |
| Current route / API / component | /research/apply; /research/application-status; /research/access-hub / No additional mounted API asserted / Apply; ApplyStatus; AccessHub |
| Defects | Public membership applications are deliberately closed pending approved recordable legal versions; Claim path historically dropped the requested destination |
| Recommended change | Preserve the truthful application hold; repair claim-to-sign-in continuity without opening application writes. |
| Mobile risk | Recheck keyboard focus, 44px actions, 16px form text, long labels and no overflow at 1440, 1366, 1024, 768, 430, 390, 375, 360 and 320px. |
| Test proof | Source inspected; product tests NOT RUN by this worker. Existing targets: client/src/research/pages/apply-status.test.tsx; server/research/membership.test.ts. Required: Closed page performs no write; approved claim preserves a safe destination; invalid claims reveal no account existence. |
| Owner / status | Auth continuation for claim; legal authority required for opening applications / APPLICATIONS_PENDING_LEGAL; claim continuity local work |
| Source groups | routes; apply; auth |

### 4. Early Access Research customer

| Field | Baseline and target |
| --- | --- |
| Entry routes | /research/early-access; /research/early-access/order-request |
| Top jobs / primary questions | Choose exact variants and quantities; Submit a request; Recover its receipt and next action / Is this available?; Is this a request or an order?; How do I return later? |
| Trust concerns | Canonical price and supply checks; No payment or fulfillment claim from a request receipt |
| Required / never-visible information | Exact permitted variants and quantities; Required contact/shipping details; Current agreements and acknowledgments / NEVER: Other requests; Status credentials in URLs or logs; Supplier cost/margin; Clinical guidance |
| Authentication / authority | Dedicated Early Access access plus request status credential or server-verified ownership as applicable / Early Access and assisted-order composition; server price/pathway/legal/ownership checks |
| Navigation / primary / secondary action | Catalog; Request review; Confirmation; Request status; Support / PRIMARY: Submit a permitted request / SECONDARY: Return to catalog or get help |
| Completion / status and history | One durable request and non-secret reference; notification result distinguished from persistence / Current status, timeline, customer action and secure document requirements; refresh and tab-close recovery |
| Support / referral | /research/support; /support is not a registered main-app route / Existing server attribution only; browser code cannot grant credit |
| Current route / API / component | /research/early-access/order-request/confirmation/:publicReference; /research/early-access/order-request/:publicReference / /api/research/early-access/assisted-orders/config; /api/research/early-access/assisted-orders/catalog / AssistedOrderPage; AssistedOrderStatusPage; EarlyAccessCheckoutJourney |
| Defects | Status credential is tab-scoped; error view has no actionable support/sign-in recovery; Checkout recovery CTA points to unregistered /support; Live supplier readiness must be re-attested; recorded expiry is not permission to bypass holds |
| Recommended change | Add safe recovery guidance and prove authenticated ownership before deep-linking to private status; keep credentials out of localStorage and URLs; correct the support target in its own lease. |
| Mobile risk | Recheck keyboard focus, 44px actions, 16px form text, long labels and no overflow at 1440, 1366, 1024, 768, 430, 390, 375, 360 and 320px. |
| Test proof | Source inspected; product tests NOT RUN by this worker. Existing targets: server/research/assisted-order/http-e2e.test.ts; client/src/research/early-access-open-route.test.tsx. Required: Synthetic submit/duplicate/receipt; tab closed or credential absent; cross-customer denial; held/Care item rejection; never mark a request paid. |
| Owner / status | Assisted-order/EA owner; auth slice only repairs safe return primitives / LOCAL_MOUNT_PRESENT; supported live intake and readiness not re-attested here |
| Source groups | routes; request |

### 5. Returning Research customer or member

| Field | Baseline and target |
| --- | --- |
| Entry routes | /research/sign-in; /research/account; /research/member/catalog |
| Top jobs / primary questions | Sign in or recover access; See one meaningful next action; Find own requests, orders and documents / What needs my attention?; Did recovery preserve my place?; Is missing history empty or unavailable? |
| Trust concerns | No cross-customer records; No false all-clear from incomplete sources |
| Required / never-visible information | Own credentials or recovery email; Only necessary account/support details / NEVER: Other customers; Staff attribution detail; Private supplier economics; Clinical record content on Research account pages |
| Authentication / authority | Canonical Supabase member; client active-member gate and server per-member/active-member checks differ by surface / requireMember / requireActiveMember; account reads use only the guard-attached member key |
| Navigation / primary / secondary action | Overview; Orders; Membership; Care status; Documents; Support; Security / PRIMARY: Complete the server-derived account action / SECONDARY: View own history |
| Completion / status and history | Safe post-auth destination and honest actionable overview; unknown sources remain unavailable / Request versus order distinction; payment/fulfillment states; complete versus partial history |
| Support / referral | /research/account/support / Member referral capability is distinct from the Gen 2 partner program |
| Current route / API / component | /research/account; /research/account/orders/:reference; /research/account/security / /api/research/customer-account/overview; /api/research/customer-account/orders / SignIn; ResetPassword; OverviewView |
| Defects | Baseline reset/claim flows lose destination; Baseline overview omits assisted-request action states and uses a generic support CTA; Client active-member gate can block account screens whose server supports own-state reads for billing problems |
| Recommended change | Complete auth/account continuity slice; preserve unavailable-source semantics; separately reconcile client versus server billing-state access. |
| Mobile risk | Recheck keyboard focus, 44px actions, 16px form text, long labels and no overflow at 1440, 1366, 1024, 768, 430, 390, 375, 360 and 320px. |
| Test proof | Source inspected; product tests NOT RUN by this worker. Existing targets: client/src/research/lib/member-routing.test.ts; server/research/customer-account/routes.test.ts; client/src/research/account-portal/views/account-portal.test.tsx. Required: Recovery and claim round trip, allowlist attacks, next-action precedence, incomplete-source state, cross-customer isolation and billing-blocked entry. |
| Owner / status | codex-ux-continuation-20260904 (auth/account only) / LOCAL_SLICE_IN_PROGRESS; not a live completion claim |
| Source groups | routes; auth; account |

### 6. Care prospect

| Field | Baseline and target |
| --- | --- |
| Entry routes | /health; /care; /care/schedule |
| Top jobs / primary questions | Understand the nonclinical access workflow; Send contact/routing request; Know who follows up / What am I submitting?; When will I hear back?; What happens if the email fails? |
| Trust concerns | No public medical intake; Request is not a provider relationship or prescription |
| Required / never-visible information | Contact information; Current U.S. state; Broad routing/contact preference; Adult/U.S. and communication acknowledgments / NEVER: Symptoms or diagnoses in public forms; Medical history; Patient records; Referrer/marketing attribution in Care operations |
| Authentication / authority | Public nonclinical request; secure clinical handoff is separate / Manual-access closed schema, availability and abuse controls; no clinical authority gained |
| Navigation / primary / secondary action | Care overview; Start Care request; How Care works; Clinical review; Support / PRIMARY: Start Care request / SECONDARY: Read how Care works |
| Completion / status and history | Durable nonclinical reference with truthful notification status and human follow-up expectation / Requester recovery/help path; do not confuse availability status endpoint with a per-request tracker |
| Support / referral | /care/support / No Care referral commissions or disclosure of clinical outcome |
| Current route / API / component | /care/schedule; /care/portal / /api/care/access-request; /api/care/access-request/status (availability only) / CareAccessRequestForm; CarePortalPage |
| Defects | Success view lacks a direct status/support continuation; Care portal explains secure instructions but primarily routes back to a new request |
| Recommended change | Add explicit support/next-step guidance without claiming the public reference is an authenticated patient portal. |
| Mobile risk | Recheck keyboard focus, 44px actions, 16px form text, long labels and no overflow at 1440, 1366, 1024, 768, 430, 390, 375, 360 and 320px. |
| Test proof | Source inspected; product tests NOT RUN by this worker. Existing targets: client/src/care/CareAccessRequestForm.test.tsx; server/care/manual-access.test.ts. Required: Synthetic save, duplicate, notification failure, unsafe fields, nonclinical receipt and usable support path. |
| Owner / status | Unassigned Care continuity slice / MANUAL_REQUEST_REPORTED_LIVE_IN_RELEASE_RECORDS; fresh journey proof pending |
| Source groups | routes; carePublic |

### 7. Care patient

| Field | Baseline and target |
| --- | --- |
| Entry routes | /care/portal; /research/account/care; /care/eligibility; /care/appointments |
| Top jobs / primary questions | Follow an authorized secure handoff; Understand own operational status; Find secure support / Which system has my current status?; Is an appointment actually scheduled? |
| Trust concerns | Clinical privacy; No fabricated enrollment, appointment, prescription or pharmacy fact |
| Required / never-visible information | Verified identity and clinical consent only in an authorized secure workflow / NEVER: Other patients; Clinical facts in Research/partner analytics; Guessed portal/recovery links |
| Authentication / authority | Canonical identity plus Care-specific permission/capability; Research membership is not clinical permission / requireCarePermission and clinical capability gates; customer-account Care adapter currently returns unavailable |
| Navigation / primary / secondary action | Care access information; Authorized secure instructions; Support / PRIMARY: Use the authorized secure instructions already provided / SECONDARY: Contact Care support |
| Completion / status and history | True next secure step; unconnected states explicitly unavailable / Care enrollment and request, intake, visit, pharmacy and delivery remain separate facts |
| Support / referral | /care/support; nonclinical account assistance at /research/account/support / No clinical disclosure to a referrer; no reward implied |
| Current route / API / component | /care/consent; /care/appointments; /care/prescriptions; /care/pharmacy; /research/account/care / /api/research/customer-account/care / CarePortalPage; CareView |
| Defects | Account production Care source is explicitly unavailable, not a public-request timeline; Clinical pages are registered but not proven as an open complete journey |
| Recommended change | Connect only authorized member-safe operational facts; distinguish manual request, patient enrollment and clinical system. Do not expose disabled clinical actions for visual completeness. |
| Mobile risk | Recheck keyboard focus, 44px actions, 16px form text, long labels and no overflow at 1440, 1366, 1024, 768, 430, 390, 375, 360 and 320px. |
| Test proof | Source inspected; product tests NOT RUN by this worker. Existing targets: server/care/clinical-route-coverage.test.ts; client/src/research/account-portal/views/care-route-contract.test.tsx. Required: Unauthorized/other-patient denial, unavailable adapter, no fabricated timeline and secure handoff only. |
| Owner / status | Unassigned Care continuity; clinical authority separately gated / MANUAL_HANDOFF; CLINICAL_CAPABILITY_GATED; account source unavailable |
| Source groups | routes; careClinical; account; carePublic |

### 8. Individual referrer

| Field | Baseline and target |
| --- | --- |
| Entry routes | /research/member/referrals |
| Top jobs / primary questions | Share an allowed invitation; Understand program availability; See only allowed aggregate results / Can I share now?; Is this credit or a partner commission? |
| Trust concerns | No applicant identity leakage; No unearned rewards |
| Required / never-visible information | Own canonical member session; no recipient medical information / NEVER: Applicant identity; Recipient purchase/clinical details; Other referrers |
| Authentication / authority | Member plus referrals capability / Member referral summary and capability boundary; not the Gen 2 partner registry |
| Navigation / primary / secondary action | Member navigation; Referrals; Support / PRIMARY: Use an invitation only when the authoritative capability enables it / SECONDARY: Get program support |
| Completion / status and history | Unavailable state or own server-issued invitation with aggregate status / Pending/approved/reversed credits distinguished; never infer qualified status from a click |
| Support / referral | /research/member/support / Separate existing member-invitation program; not a general recommendation V1 |
| Current route / API / component | /research/member/referrals / /api/research/member/referrals / ReferralsUpgrade |
| Defects | Member and partner referral programs use different authorities; full recommendation V1 is not composed; Capability-dependent page does not prove program activation |
| Recommended change | Make program boundaries explicit and reuse canonical partner spine for new partner recommendations, without silently changing member reward economics. |
| Mobile risk | Recheck keyboard focus, 44px actions, 16px form text, long labels and no overflow at 1440, 1366, 1024, 768, 430, 390, 375, 360 and 320px. |
| Test proof | Source inspected; product tests NOT RUN by this worker. Existing targets: server/research/referrals.test.ts. Required: Disabled/eligible/ineligible states; aggregate-only response; no browser-set reward or collision with partner codes. |
| Owner / status | Unassigned referral V1 and member-program owners / LOCAL_CAPABILITY_GATED; live activation not re-attested |
| Source groups | routes; individual |

### 9. Affiliate or strategic partner

| Field | Baseline and target |
| --- | --- |
| Entry routes | /research/partners; /research/partners/dashboard; /research/partners/links |
| Top jobs / primary questions | Understand approval/onboarding; Use approved links; See own permitted results / Am I active?; Does this code work?; What remains pending? |
| Trust concerns | No fabricated conversion/commission; No access to unrelated customers |
| Required / never-visible information | Reviewed business relationship; Canonical member-bound partner identity; Approved agreements/compliance / NEVER: Other partner records; Patient information; Supplier cost and margin; Unrelated customer history |
| Authentication / authority | Public root; descendants also face shared review gate; APIs require canonical member/partner mapping / Gen 2 research_partners and server member-to-partner resolution; feature flags remain separate |
| Navigation / primary / secondary action | Onboarding; Dashboard; Links; Compliance; Support / PRIMARY: Complete the real pending onboarding step / SECONDARY: Contact partner support |
| Completion / status and history | Authorized own workspace; no promise of link issuance/capture until V1 controls pass / Application/approval/agreement/active state, valid link state, verified attribution and actual payout state |
| Support / referral | /research/partners/support (gated); /research/support as public fallback / Canonical Gen 2 foundation present; public capture and full issue/revoke lifecycle incomplete |
| Current route / API / component | /research/partners/dashboard; /research/partners/links / /api/research/partner/onboarding; /api/research/partner/leads; /api/research/partner/commissions / PartnerDashboard; PartnerLinks |
| Defects | Partner descendants still use shared review gate; Full link issue/revoke/expiry and login binding are not complete; Some portal request endpoints deliberately return capability_disabled |
| Recommended change | Finish a narrow member-bound partner workflow on Gen 2; replace review-gate UX only with proven canonical authorization. |
| Mobile risk | Recheck keyboard focus, 44px actions, 16px form text, long labels and no overflow at 1440, 1366, 1024, 768, 430, 390, 375, 360 and 320px. |
| Test proof | Source inspected; product tests NOT RUN by this worker. Existing targets: server/research/partners/portal-routes.test.ts; server/research/partners/portal-production.test.ts. Required: Own versus other partner, disabled capability, revoked links, accurate pending states and no fake money. |
| Owner / status | Unassigned strategic-partner/referral slice / PARTIAL_GATED; referral V1 not shipped |
| Source groups | routes; partner; referral |

### 10. Organization or clinic owner

| Field | Baseline and target |
| --- | --- |
| Entry routes | /research/organizations |
| Top jobs / primary questions | Prepare a business inquiry; Understand review; Eventually manage authorized users and procurement / Was the inquiry sent?; Who may buy?; Does clinic status permit Research use? |
| Trust concerns | No patient list in business inquiry; Research access is not clinical authorization |
| Required / never-visible information | Business contact/entity/role/region and nonclinical commercial context / NEVER: Patient lists; Other organizations; Unapproved wholesale economics; Supplier internal information |
| Authentication / authority | Public inquiry preparation; future workspace requires canonical account organization membership / Account-identity server service and organization role checks; named organization UI routes currently parked |
| Navigation / primary / secondary action | Organization overview; Review steps; Inquiry preparation; Support / PRIMARY: Prepare an organization inquiry / SECONDARY: Compare partnership paths |
| Completion / status and history | Prepared summary ready for user-controlled email, not a saved application or approved account / Future durable inquiry/reference/reviewer/decision and invitation status |
| Support / referral | /research/support; existing inquiry email handoff / No organization inquiry grants a referral relationship |
| Current route / API / component | /research/organizations / /api/research/account/context; /api/research/account/organizations/:organizationId/dashboard / OrganizationAccessPage; PartnershipInquiryForm; OrganizationDashboard (parked) |
| Defects | Inquiry is prepare/copy/email, not a durable submitted record; Organization workspace components exist but are not mounted |
| Recommended change | Keep the manual preparation label truthful; implement a complete authorized organization entry only after its identity and schema prerequisites are verified. |
| Mobile risk | Recheck keyboard focus, 44px actions, 16px form text, long labels and no overflow at 1440, 1366, 1024, 768, 430, 390, 375, 360 and 320px. |
| Test proof | Source inspected; product tests NOT RUN by this worker. Existing targets: server/research/account-identity/routes.test.ts; client/src/research/account/OrganizationDashboard.test.tsx. Required: No false sent receipt, user role resolution, organization isolation and denied patient-list input. |
| Owner / status | Unassigned organization slice; schema/release authority separate / PUBLIC_MANUAL_PREPARATION; organization workspace parked |
| Source groups | routes; organization |

### 11. Organization admin, buyer, or billing viewer

| Field | Baseline and target |
| --- | --- |
| Entry routes | /research/sign-in; /research/account/organization-invitations/accept (parked) |
| Top jobs / primary questions | Accept authorized invitation; Reach correct organization; Perform only role-allowed actions / Which organization am I using?; Can I order or only view billing? |
| Trust concerns | No role escalation; No cross-organization records |
| Required / never-visible information | Verified invitation identity; Explicit organization/role binding; Canonical password-change evidence if required / NEVER: Other organizations; Clinical data; Buyer actions for billing-only viewers; Unrelated commercial terms |
| Authentication / authority | Supabase identity may exist without a Research member row / Account-identity auth verifier and server organization membership; browser role is never authority |
| Navigation / primary / secondary action | Future organization workspace; Role-appropriate orders/billing; Support / PRIMARY: Reach the authorized workspace after invitation checks / SECONDARY: Get account access help |
| Completion / status and history | Verified organization and role with no forced duplicate identity / Invitation accepted/expired/revoked; password-change requirement; own organization orders/billing |
| Support / referral | /research/support until authorized organization entry is composed / Only separately assigned permissions; invitation is not a referral link |
| Current route / API / component | /research/sign-in / /api/research/account/organization-invitations/accept; /api/research/account/context / AccountSignIn (parked); OrganizationInvitation (parked) |
| Defects | Organization-only identity can be stranded by member-only client gate; Organization sign-in/invitation routes are parked; Production password-change evidence adapter deliberately refuses unverifiable completion |
| Recommended change | Compose canonical account context with role-safe routing; implement genuine password-change evidence before clearing initial-password requirements. Do not treat invite as generic recovery without proof. |
| Mobile risk | Recheck keyboard focus, 44px actions, 16px form text, long labels and no overflow at 1440, 1366, 1024, 768, 430, 390, 375, 360 and 320px. |
| Test proof | Source inspected; product tests NOT RUN by this worker. Existing targets: server/research/account-identity/routes.test.ts; server/research/account-identity/production-mount.test.ts. Required: Invite accept/replay/expiry, identity mismatch, buyer versus billing-only permissions, organization isolation and no synthetic password evidence. |
| Owner / status | Unassigned organization identity slice / PARKED_CLIENT_JOURNEY; server foundation not end-to-end proof |
| Source groups | routes; organization; auth |

### 12. Supplier, laboratory, or fulfillment user

| Field | Baseline and target |
| --- | --- |
| Entry routes | /research/supplier-access |
| Top jobs / primary questions | Prepare a supplier inquiry; Understand documentation requirements; Eventually fulfill only assigned work / What evidence is required?; What customer data is necessary?; Where is the assigned packet? |
| Trust concerns | Minimum-data handoff; No false stock, COA, lot or shipment |
| Required / never-visible information | Business identity/contact/region; Supply/documentation capability; For fulfillment only: assigned lines and minimum destination / NEVER: Affiliate attribution; Customer retail economics or margin; Unrelated customer history; Other supplier records; Patient data |
| Authentication / authority | Anonymous public preparation; operational access must use reviewed server assignment/role / Existing supplier/fulfillment authority; no independent supplier password or public capability |
| Navigation / primary / secondary action | Supplier information; Review requirements; Inquiry preparation; Support / PRIMARY: Prepare a supplier inquiry / SECONDARY: Review quality requirements |
| Completion / status and history | Truthful manual inquiry preparation; assigned operations only after real onboarding / Verification, agreements, evidence expiry, assignments and actual tracking/exception events |
| Support / referral | /research/support and approved Xenios relay for assigned operations / None implied by supplier status |
| Current route / API / component | /research/supplier-access / No additional mounted API asserted / SupplierPartnershipPage; PartnershipInquiryForm |
| Defects | No dedicated supplier workspace mounted in the main/research route manifest; Public inquiry is not durable onboarding or inventory proof |
| Recommended change | Extend the canonical assigned-work projection when ready; preserve manual intake and strict field minimization. |
| Mobile risk | Recheck keyboard focus, 44px actions, 16px form text, long labels and no overflow at 1440, 1366, 1024, 768, 430, 390, 375, 360 and 320px. |
| Test proof | Source inspected; product tests NOT RUN by this worker. Existing targets: server/research/operations/suppliers.test.ts; client/src/research/routes-parity.test.ts. Required: Own assignment only, unpaid release denied, no economics/clinical fields, expired evidence held and no false inquiry receipt. |
| Owner / status | Unassigned supplier workspace slice / PUBLIC_MANUAL_PREPARATION; dedicated workspace not mounted |
| Source groups | routes; supplier |

### 13. Provider

| Field | Baseline and target |
| --- | --- |
| Entry routes | No dedicated provider workspace in the current App/Research route manifests; /care/provider-review (public explanation only) |
| Top jobs / primary questions | Review assigned clinical work; Record independent authorized decisions; Communicate through the clinical rail / Which reviews are assigned to me?; What clinical capability is actually enabled? |
| Trust concerns | Assignment isolation; Independent medical judgment; No clinical facts invented by business staff |
| Required / never-visible information | Verified clinician identity, authority and assigned case facts in a secure system / NEVER: Unassigned patients; Partner economics; General CRM marketing fields |
| Authentication / authority | Care principal with care:review_assigned and enabled clinical capability / requireCarePermission plus assignment repositories and clinical write gates |
| Navigation / primary / secondary action | Future assigned-review workspace; Secure clinical support / PRIMARY: Review an assigned case in the authorized secure workflow / SECONDARY: Resolve access with clinical operations |
| Completion / status and history | Audited independent decision on an assigned case only; unavailable if prerequisites fail / Assigned/reviewed/follow-up and decision lineage; no prescription inferred from request |
| Support / referral | Authorized clinical operations; /care/support for nonclinical access assistance / No paid clinical referral or patient-outcome disclosure |
| Current route / API / component | /care/provider-review / No additional mounted API asserted / CareProviderReviewPage (public explanation) |
| Defects | Clinical API code is not a provider dashboard; Review queue module existence is not proof of production mount or activation |
| Recommended change | Inventory and compose the authorized clinical workspace separately; never relabel the public review explanation as a provider portal. |
| Mobile risk | Recheck keyboard focus, 44px actions, 16px form text, long labels and no overflow at 1440, 1366, 1024, 768, 430, 390, 375, 360 and 320px. |
| Test proof | Source inspected; product tests NOT RUN by this worker. Existing targets: server/care/review-routes.test.ts; server/care/clinical-route-coverage.test.ts. Required: Assigned versus unassigned access, capability-off denial, audited writes and no general-CRM leakage. |
| Owner / status | Unassigned clinical workspace; provider authority required / CLINICAL_GATED_FOUNDATION; provider journey unproven |
| Source groups | routes; careClinical |

### 14. Clinical operations, support, quality, finance, or reviewer

| Field | Baseline and target |
| --- | --- |
| Entry routes | /admin/research; /admin/research/care-requests; /admin/research/assisted-orders |
| Top jobs / primary questions | Find the correct queue; Take role-appropriate action; See durable status and failed notifications / Was this saved?; Who owns the next action?; Which boundary applies? |
| Trust concerns | Least privilege; No accidental clinical/financial assertion; Email failure must not hide a saved request |
| Required / never-visible information | Authenticated approved operator role; Minimum operational projection and audited reason when needed / NEVER: Clinical records in general support or finance; Raw public payloads/attribution in Care queue; Unrelated role data |
| Authentication / authority | Current named admin boundary for Research operations; clinical roles additionally require Care permission / requireSupabaseAdmin for manual Care admin; requireCarePermission for clinical operations; domain services enforce mutations |
| Navigation / primary / secondary action | Applications; Care requests; Assisted orders; Quality; Payment/fulfillment queues / PRIMARY: Open the domain-specific actionable queue / SECONDARY: Inspect truthful detail/history |
| Completion / status and history | Authorized operational transition and audit, with no hidden saved record or email-only source of truth / Current state, timestamp, owner/action needed, notification failures and malformed-row visibility |
| Support / referral | Protected operational escalation; public /care/support is not a staff console / Only authorized declared-versus-verified attribution views; no customer/clinical data to partners |
| Current route / API / component | /admin/research/care-requests; /admin/research/assisted-orders / /api/admin/care/access-requests; /api/admin/care/access-requests/:requestId/status / CareAccessRequests |
| Defects | Role-specific workspaces are not proven merely by a broad admin navigation; Care generic-LOI exclusion is a local successor change, not assumed deployed |
| Recommended change | Keep dedicated Care projection as its sole operational writer; separately prove least-privilege staff roles and domain-safe queue navigation. |
| Mobile risk | Recheck keyboard focus, 44px actions, 16px form text, long labels and no overflow at 1440, 1366, 1024, 768, 430, 390, 375, 360 and 320px. |
| Test proof | Source inspected; product tests NOT RUN by this worker. Existing targets: server/care/manual-access-admin.test.ts; server/care/loi-boundary-parity.test.ts; client/src/research/pages/adminx/CareAccessRequests.test.tsx. Required: 401/403 boundaries, other-domain isolation, failed-email discoverability, only dedicated Care writer and no raw/clinical leakage. |
| Owner / status | Care integrity predecessor plus future operations UX owner / DEDICATED_CARE_QUEUE_REPORTED_LIVE; generic-LOI boundary local successor |
| Source groups | routes; admin; careClinical |

### 15. Samuel super-admin

| Field | Baseline and target |
| --- | --- |
| Entry routes | /admin; /admin/research |
| Top jobs / primary questions | See truthful operational bottlenecks; Review exceptions; Approve exact changes without bypassing domain controls / What is live versus local or blocked?; What requires my decision?; Can this change be reversed? |
| Trust concerns | Exact release authority; No stale completion claims; No privileged shortcut to payment, supply or clinical facts |
| Required / never-visible information | Own authenticated admin session; Bounded queue evidence and exact change/rollback context / NEVER: Secrets in UI/logs; Unnecessary patient details; Raw recovery/payment credentials |
| Authentication / authority | Named Supabase admin; no public shared code grants administrative access / requireSupabaseAdmin plus each domain's immutable financial/clinical/release controls |
| Navigation / primary / secondary action | Operations queues; Care requests; Applications; Orders; Product control; Audit / PRIMARY: Resolve the highest-priority real queue item / SECONDARY: Inspect release/readiness evidence |
| Completion / status and history | Audited authorized action; deployment remains a separate exact-SHA decision / Live/local/dark/blocked distinctions, data readiness, operational history and rollback evidence |
| Support / referral | Protected internal operational escalation / Review verified versus declared partner context only; cannot fabricate earned commission |
| Current route / API / component | /admin; /admin/research; /admin/research/care-requests / /api/admin/care/access-requests / AdminResearchRoutes; CareAccessRequests |
| Defects | Inherited broad platform records contain historical states; a route inventory is not a completed operational cockpit; Current UX/auth/account edits are not deployed |
| Recommended change | Show actionable queues and explicit readiness; require current exact-SHA approval for every production mutation and never reuse historical GO. |
| Mobile risk | Recheck keyboard focus, 44px actions, 16px form text, long labels and no overflow at 1440, 1366, 1024, 768, 430, 390, 375, 360 and 320px. |
| Test proof | Source inspected; product tests NOT RUN by this worker. Existing targets: server/release-control-plane.test.ts; server/care/manual-access-admin-wiring.test.ts. Required: Admin denial, domain invariants, exact runtime/source distinction and no secret/private data in evidence. |
| Owner / status | Release/integration authority; founder approval for production / ADMIN_ROUTES_PRESENT; full multi-persona product incomplete |
| Source groups | routes; admin |

## Source index

These are repository-relative paths for maintainers; evidence is source inspection, not a production read. Dynamic route tokens name patterns, not customer records.

- **routes:** `client/src/App.tsx`, `client/src/research/section.tsx`, `client/src/research/lib/routes.ts`
- **public:** `client/src/lib/nav.ts`, `client/src/research/pages/Gateway.tsx`, `client/src/research/pages/AccessHub.tsx`
- **auth:** `client/src/research/pages/SignIn.tsx`, `client/src/research/pages/ResetPassword.tsx`, `client/src/research/pages/ApplyStatus.tsx`, `client/src/research/pages/MemberArea.tsx`, `server/research/members.ts`
- **apply:** `client/src/research/pages/Apply.tsx`, `server/research/membership.ts`
- **request:** `client/src/research/assisted-order/AssistedOrderPage.tsx`, `client/src/research/assisted-order/AssistedOrderStatusPage.tsx`, `client/src/research/assisted-order/storage.ts`, `server/research/assisted-order/service.ts`, `server/index.ts`
- **account:** `server/research/customer-account/routes.ts`, `server/research/customer-account/service.ts`, `server/research/customer-account/production.ts`, `client/src/research/account-portal/views/OverviewView.tsx`
- **referral:** `server/index.ts`, `server/research/partners/referral-capture-routes.ts`, `server/research/partners/attribution.ts`, `server/research/partners/customer-attribution-binding.ts`, `client/src/research/referral-capture.ts`
- **partner:** `server/research/partners/portal-routes.ts`, `client/src/research/layout.tsx`, `client/src/research/pages/partners/Links.tsx`
- **individual:** `client/src/research/pages/member/ReferralsUpgrade.tsx`, `server/research/referrals.ts`
- **organization:** `client/src/research/b2b/OrganizationAccessPage.tsx`, `client/src/research/b2b/PartnershipInquiryForm.tsx`, `server/research/account-identity/production-mount.ts`, `server/research/account-identity/routes.ts`, `client/src/research/account/AccountSignIn.tsx`
- **supplier:** `client/src/research/b2b/SupplierPartnershipPage.tsx`, `client/src/research/b2b/PartnershipInquiryForm.tsx`, `server/research/operations/suppliers.ts`
- **carePublic:** `client/src/care/CarePublicPages.tsx`, `client/src/care/CareAccessRequestForm.tsx`, `shared/care/manual-access.ts`, `server/care/manual-access.ts`
- **careClinical:** `server/care/access.ts`, `server/care/index.ts`, `server/care/appointment-routes.ts`, `server/care/review-routes.ts`, `server/care/prescription-routes.ts`
- **admin:** `client/src/research/adminx-section.tsx`, `server/routes.ts`, `server/care/manual-access-admin.ts`, `server/care/loi-boundary.ts`, `client/src/research/pages/adminx/CareAccessRequests.tsx`

## Acceptance handoff

The current narrow implementation owns safe auth return and account next-action projection; it does not open membership applications, activate referral capture, mount organization/provider/supplier portals, connect public Care requests to patient records, renew supplier evidence, or authorize production changes. Before closing any persona journey, record its exact tested source, composed positive and negative results, browser/mobile proof, remaining gates and actual deployment status in the release handoff. Never count a fixture, route registration, old test result or manual email draft as a successful live workflow.
